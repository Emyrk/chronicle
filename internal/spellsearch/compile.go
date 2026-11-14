package spellsearch

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"

	"github.com/google/uuid"
)

const (
	DefaultLimit         = 25
	DefaultMaxLimit      = 100
	DefaultMaxNodes      = 64
	DefaultMaxDepth      = 8
	DefaultMaxListValues = 50
	baseCost             = 1
)

type Options struct {
	MaxLimit      int
	MaxNodes      int
	MaxDepth      int
	MaxListValues int
}

func (o Options) withDefaults() Options {
	if o.MaxLimit <= 0 {
		o.MaxLimit = DefaultMaxLimit
	}
	if o.MaxNodes <= 0 {
		o.MaxNodes = DefaultMaxNodes
	}
	if o.MaxDepth <= 0 {
		o.MaxDepth = DefaultMaxDepth
	}
	if o.MaxListValues <= 0 {
		o.MaxListValues = DefaultMaxListValues
	}
	return o
}

type Compiled struct {
	SQL    string
	Args   []any
	Limit  int
	Cost   int
	Fields []string
}

type Error struct{ Path, Message string }

func (e *Error) Error() string {
	if e.Path == "" {
		return e.Message
	}
	return e.Path + ": " + e.Message
}

type scope int

const (
	scopeSpell scope = iota
	scopeEffect
	scopePower
)

func (s scope) String() string {
	switch s {
	case scopeSpell:
		return "spell"
	case scopeEffect:
		return "effect"
	case scopePower:
		return "power"
	}
	return "unknown"
}

type valueType int

const (
	typeInt valueType = iota
	typeFloat
	typeString
	typeAttributes
)

type fieldDef struct {
	scope  scope
	type_  valueType
	expr   func(*compiler, string) (string, error)
	labels map[string]int64
	cost   int
}

var schoolLabels = labels(map[string]int64{"physical": 1, "holy": 2, "fire": 4, "nature": 8, "frost": 16, "shadow": 32, "arcane": 64})
var dispelLabels = labels(map[string]int64{"none": 0, "magic": 1, "curse": 2, "disease": 3, "poison": 4, "stealth": 5, "invisibility": 6, "all": 7, "special": 8, "enrage": 9})
var mechanicLabels = labels(map[string]int64{"none": 0, "charm": 1, "fear": 5, "root": 7, "silence": 9, "snare": 11, "stun": 12})
var powerLabels = labels(map[string]int64{"mana": 0, "rage": 1, "focus": 2, "energy": 3, "runic power": 6})
var effectLabels = labels(map[string]int64{"apply aura": 6, "school damage": 2, "heal": 10, "trigger spell": 64, "create item": 24})

// Attribute labels are intentionally a fixed allowlist. Values are block/mask
// pairs encoded as block<<32 | mask. Channeled matches either legacy channel bit.
var attributeLabels = map[string][][2]int64{
	"passive":                       {{0, 1 << 6}},
	"channeled":                     {{1, 1 << 2}, {1, 1 << 6}},
	"channeled1":                    {{1, 1 << 2}},
	"channeled2":                    {{1, 1 << 6}},
	"hidden":                        {{0, 1 << 7}},
	"unaffected by invulnerability": {{0, 1 << 29}},
	"cannot crit":                   {{2, 1 << 29}},
	"ability":                       {{0, 1 << 4}},
	"tradeskill":                    {{0, 1 << 5}},
	"only outdoors":                 {{0, 1 << 15}},
	"only indoors":                  {{0, 1 << 14}},
	"allow while mounted":           {{0, 1 << 25}},
	"allow cast while dead":         {{0, 1 << 23}},
}

func labels(in map[string]int64) map[string]int64 {
	out := make(map[string]int64, len(in))
	for k, v := range in {
		out[normalizeLabel(k)] = v
	}
	return out
}
func normalizeLabel(s string) string {
	return strings.Join(strings.Fields(strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(strings.TrimSpace(s), "_", " "), "-", " "))), " ")
}

var fields = map[string]fieldDef{
	"spell.name":           {scope: scopeSpell, type_: typeString, expr: fixed("s.name"), cost: 1},
	"spell.id":             {scope: scopeSpell, type_: typeInt, expr: fixed("s.spell_id"), cost: 1},
	"spell.school":         {scope: scopeSpell, type_: typeInt, expr: fixed("COALESCE(v.school_mask, s.school)"), labels: schoolLabels},
	"spell.attributes":     {scope: scopeSpell, type_: typeAttributes, expr: fixed("COALESCE(v.attributes, s.attributes)")},
	"spell.base_level":     {scope: scopeSpell, type_: typeInt, expr: fixed("COALESCE(v.base_level, s.base_level)")},
	"spell.mechanic":       {scope: scopeSpell, type_: typeInt, expr: fixed("COALESCE(v.mechanic, s.mechanic)"), labels: mechanicLabels},
	"spell.dispel_type":    {scope: scopeSpell, type_: typeInt, expr: fixed("COALESCE(v.dispel_type, s.dispel_type)"), labels: dispelLabels},
	"spell.proc_chance":    {scope: scopeSpell, type_: typeInt, expr: fixed("COALESCE(v.proc_chance, s.proc_chance)")},
	"effect.type":          {scope: scopeEffect, type_: typeInt, expr: fixed("e.effect"), labels: effectLabels},
	"effect.aura":          {scope: scopeEffect, type_: typeInt, expr: fixed("e.effect_aura"), labels: labels(map[string]int64{"mod stat": 29, "periodic damage": 3, "periodic heal": 8, "mod damage done": 13, "mod resistance": 22})},
	"effect.base_points":   {scope: scopeEffect, type_: typeFloat, expr: fixed("e.effect_base_points_f")},
	"effect.value":         {scope: scopeEffect, type_: typeFloat, expr: effectValue},
	"effect.trigger_spell": {scope: scopeEffect, type_: typeInt, expr: fixed("e.effect_trigger_spell")},
	"power.type":           {scope: scopePower, type_: typeInt, expr: fixed("p.power_type"), labels: powerLabels},
	"power.cost":           {scope: scopePower, type_: typeInt, expr: fixed("p.mana_cost")},
}

func fixed(sql string) func(*compiler, string) (string, error) {
	return func(*compiler, string) (string, error) { return sql, nil }
}
func effectValue(c *compiler, _ string) (string, error) {
	if c.query.Context.Level == nil {
		return "e.effect_base_points_f", nil
	}
	level := c.arg(int64(*c.query.Context.Level))
	// value = base points + points/level * max(0, min(level, max_level
	// when max_level > 0) - base_level), with variant component overrides.
	return fmt.Sprintf("(e.effect_base_points_f + e.effect_real_points_per_level * GREATEST(0, LEAST(%s::integer, CASE WHEN COALESCE(v.max_level, s.max_level) > 0 THEN COALESCE(v.max_level, s.max_level) ELSE %s::integer END) - COALESCE(v.base_level, s.base_level)))", level, level), nil
}

type compiler struct {
	query  Query
	opts   Options
	args   []any
	nodes  int
	cost   int
	fields []string
}

func Compile(datasetID uuid.UUID, q Query, opts Options) (Compiled, error) {
	opts = opts.withDefaults()
	c := &compiler{query: q, opts: opts}
	if q.Context.Level != nil && *q.Context.Level < 0 {
		return Compiled{}, &Error{Path: "context.level", Message: "must be at least 0"}
	}
	if q.Context.Difficulty < 0 {
		return Compiled{}, &Error{Path: "context.difficulty", Message: "must be at least 0"}
	}
	limit := q.Limit
	if limit == 0 {
		limit = DefaultLimit
	}
	if limit < 1 || limit > opts.MaxLimit {
		return Compiled{}, &Error{Path: "limit", Message: fmt.Sprintf("must be between 1 and %d", opts.MaxLimit)}
	}
	where := "TRUE"
	var err error
	if q.Where != nil {
		where, err = c.node(q.Where, "where", scopeSpell, 1)
		if err != nil {
			return Compiled{}, err
		}
	}
	dataset := c.arg(datasetID)
	difficulty := c.arg(int64(q.Context.Difficulty))
	cursor := "TRUE"
	if q.Cursor != nil {
		if q.Cursor.SpellID < 0 {
			return Compiled{}, &Error{Path: "cursor.spell_id", Message: "must be at least 0"}
		}
		cursor = "s.spell_id > " + c.arg(int64(q.Cursor.SpellID)) + "::integer"
	}
	limitArg := c.arg(int64(limit + 1))
	sql := strings.NewReplacer("{{DATASET}}", dataset, "{{DIFFICULTY}}", difficulty, "{{WHERE}}", where, "{{CURSOR}}", cursor, "{{LIMIT}}", limitArg).Replace(frameSQL)
	return Compiled{SQL: sql, Args: c.args, Limit: limit, Cost: baseCost + c.cost, Fields: c.fields}, nil
}

const frameSQL = `SELECT s.spell_id, s.name, s.name_subtext, s.description,
  COALESCE(v.spell_level, s.spell_level) AS spell_level,
  COALESCE(v.base_level, s.base_level) AS base_level,
  COALESCE(v.school_mask, s.school) AS school,
  COALESCE(v.spell_icon_file_data_id, s.spell_icon_id) AS spell_icon_id
FROM dbc_spells s
LEFT JOIN dbc_spell_variants v
  ON v.dataset_id = s.dataset_id AND v.spell_id = s.spell_id
  AND v.difficulty_id = {{DIFFICULTY}}::integer
WHERE s.dataset_id = {{DATASET}}::uuid
  AND ({{WHERE}})
  AND ({{CURSOR}})
ORDER BY s.spell_id ASC
LIMIT {{LIMIT}}::integer`

func (c *compiler) arg(v any) string {
	c.args = append(c.args, v)
	return fmt.Sprintf("$%d", len(c.args))
}

func (c *compiler) node(n *Node, path string, sc scope, depth int) (string, error) {
	c.nodes++
	if c.nodes > c.opts.MaxNodes {
		return "", &Error{Path: path, Message: fmt.Sprintf("too many nodes, maximum is %d", c.opts.MaxNodes)}
	}
	if depth > c.opts.MaxDepth {
		return "", &Error{Path: path, Message: fmt.Sprintf("too deep, maximum is %d", c.opts.MaxDepth)}
	}
	set := 0
	if n.And != nil {
		set++
	}
	if n.Or != nil {
		set++
	}
	if n.Not != nil {
		set++
	}
	if n.AnyEffect != nil {
		set++
	}
	if n.AnyPower != nil {
		set++
	}
	if n.Field != "" {
		set++
	}
	if set != 1 {
		return "", &Error{Path: path, Message: "must set exactly one of and, or, not, any_effect, any_power or field"}
	}
	if n.And != nil {
		return c.logic(n.And, path+".and", sc, depth, "AND")
	}
	if n.Or != nil {
		c.cost += 2
		return c.logic(n.Or, path+".or", sc, depth, "OR")
	}
	if n.Not != nil {
		c.cost++
		child, err := c.node(n.Not, path+".not", sc, depth+1)
		if err != nil {
			return "", err
		}
		return "(NOT COALESCE((" + child + "), FALSE))", nil
	}
	if n.AnyEffect != nil {
		if sc != scopeSpell {
			return "", &Error{Path: path + ".any_effect", Message: "quantifiers cannot be nested"}
		}
		c.cost += 4
		child, err := c.node(n.AnyEffect, path+".any_effect", scopeEffect, depth+1)
		if err != nil {
			return "", err
		}
		difficulty := c.arg(int64(c.query.Context.Difficulty))
		return `(EXISTS (SELECT 1 FROM dbc_spell_effects e WHERE e.dataset_id = s.dataset_id AND e.spell_id = s.spell_id AND e.difficulty_id = CASE WHEN EXISTS (SELECT 1 FROM dbc_spell_effects selected_effect WHERE selected_effect.dataset_id = s.dataset_id AND selected_effect.spell_id = s.spell_id AND selected_effect.difficulty_id = ` + difficulty + `::integer) THEN ` + difficulty + `::integer ELSE 0 END AND (` + child + `)))`, nil
	}
	if n.AnyPower != nil {
		if sc != scopeSpell {
			return "", &Error{Path: path + ".any_power", Message: "quantifiers cannot be nested"}
		}
		c.cost += 4
		child, err := c.node(n.AnyPower, path+".any_power", scopePower, depth+1)
		if err != nil {
			return "", err
		}
		return `(EXISTS (SELECT 1 FROM dbc_spell_powers p WHERE p.dataset_id = s.dataset_id AND p.spell_id = s.spell_id AND (` + child + `)))`, nil
	}
	return c.predicate(n, path, sc)
}

func (c *compiler) logic(nodes []Node, path string, sc scope, depth int, op string) (string, error) {
	if len(nodes) == 0 {
		return "", &Error{Path: path, Message: "must not be empty"}
	}
	if len(nodes) > c.opts.MaxListValues {
		return "", &Error{Path: path, Message: fmt.Sprintf("too many children, maximum is %d", c.opts.MaxListValues)}
	}
	parts := make([]string, len(nodes))
	for i := range nodes {
		part, err := c.node(&nodes[i], fmt.Sprintf("%s[%d]", path, i), sc, depth+1)
		if err != nil {
			return "", err
		}
		parts[i] = "(" + part + ")"
	}
	return "(" + strings.Join(parts, " "+op+" ") + ")", nil
}

func (c *compiler) predicate(n *Node, path string, sc scope) (string, error) {
	def, ok := fields[n.Field]
	if !ok {
		return "", &Error{Path: path + ".field", Message: fmt.Sprintf("unknown field %q", n.Field)}
	}
	if def.scope != sc {
		return "", &Error{Path: path + ".field", Message: fmt.Sprintf("%s is only valid in %s scope", n.Field, def.scope)}
	}
	expr, err := def.expr(c, path)
	if err != nil {
		return "", err
	}
	c.cost += def.cost
	if def.cost == 0 {
		c.cost += 2
	}
	c.fields = append(c.fields, n.Field)
	if def.type_ == typeAttributes {
		return c.attributePredicate(expr, n, path)
	}
	if n.Field == "spell.school" && n.Op == OpHas {
		value, err := parseScalar(def, n.Value)
		if err != nil {
			return "", &Error{Path: path + ".value", Message: err.Error()}
		}
		return fmt.Sprintf("(%s & %s::integer) <> 0", expr, c.arg(value)), nil
	}
	allowed := map[Op]bool{OpEq: true, OpNe: true, OpLt: true, OpLte: true, OpGt: true, OpGte: true, OpIn: true}
	if def.type_ == typeString {
		allowed = map[Op]bool{OpEq: true, OpNe: true, OpContains: true, OpIn: true}
	}
	if !allowed[n.Op] {
		return "", &Error{Path: path + ".op", Message: "operator is not valid for this field"}
	}
	if n.Op == OpIn {
		return c.inPredicate(expr, def, n.Value, path)
	}
	value, err := parseScalar(def, n.Value)
	if err != nil {
		return "", &Error{Path: path + ".value", Message: err.Error()}
	}
	arg := c.arg(value)
	if def.type_ == typeString {
		switch n.Op {
		case OpEq:
			return "lower(" + expr + ") = lower(" + arg + "::text)", nil
		case OpNe:
			return "lower(" + expr + ") <> lower(" + arg + "::text)", nil
		case OpContains:
			return "strpos(lower(" + expr + "), lower(" + arg + "::text)) > 0", nil
		}
	}
	return expr + " " + string(n.Op) + " " + arg, nil
}

func parseScalar(def fieldDef, raw any) (any, error) {
	if s, ok := raw.(string); ok && def.labels != nil {
		if v, found := def.labels[normalizeLabel(s)]; found {
			return v, nil
		}
		return nil, fmt.Errorf("unknown label %q", s)
	}
	switch def.type_ {
	case typeString:
		s, ok := raw.(string)
		if !ok || strings.TrimSpace(s) == "" {
			return nil, fmt.Errorf("must be a non-empty string")
		}
		return s, nil
	case typeInt:
		v, ok := number(raw)
		if !ok || math.Trunc(v) != v || v < math.MinInt64 || v > math.MaxInt64 {
			return nil, fmt.Errorf("must be an integer or known label")
		}
		return int64(v), nil
	case typeFloat:
		v, ok := number(raw)
		if !ok {
			return nil, fmt.Errorf("must be a number")
		}
		return v, nil
	}
	return nil, fmt.Errorf("invalid value")
}
func number(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int32:
		return float64(n), true
	case int64:
		return float64(n), true
	case json.Number:
		f, e := n.Float64()
		return f, e == nil
	}
	return 0, false
}

func (c *compiler) inPredicate(expr string, def fieldDef, raw any, path string) (string, error) {
	list, ok := raw.([]any)
	if !ok {
		return "", &Error{Path: path + ".value", Message: "must be a list"}
	}
	if len(list) == 0 || len(list) > c.opts.MaxListValues {
		return "", &Error{Path: path + ".value", Message: fmt.Sprintf("must contain between 1 and %d values", c.opts.MaxListValues)}
	}
	args := make([]string, len(list))
	for i, item := range list {
		v, err := parseScalar(def, item)
		if err != nil {
			return "", &Error{Path: fmt.Sprintf("%s.value[%d]", path, i), Message: err.Error()}
		}
		args[i] = c.arg(v)
	}
	if def.type_ == typeString {
		for i := range args {
			args[i] = "lower(" + args[i] + "::text)"
		}
		return "lower(" + expr + ") IN (" + strings.Join(args, ",") + ")", nil
	}
	return expr + " IN (" + strings.Join(args, ",") + ")", nil
}

func (c *compiler) attributePredicate(expr string, n *Node, path string) (string, error) {
	if n.Op != OpHas {
		return "", &Error{Path: path + ".op", Message: "spell.attributes only supports has"}
	}
	label, ok := n.Value.(string)
	if !ok {
		return "", &Error{Path: path + ".value", Message: "must be an attribute label"}
	}
	pairs, ok := attributeLabels[normalizeLabel(label)]
	if !ok {
		return "", &Error{Path: path + ".value", Message: fmt.Sprintf("unknown attribute %q", label)}
	}
	parts := make([]string, len(pairs))
	for i, pair := range pairs {
		block := c.arg(pair[0] + 1)
		mask := c.arg(pair[1])
		parts[i] = fmt.Sprintf("(COALESCE((%s)[%s::integer], 0) & %s::integer) <> 0", expr, block, mask)
	}
	return "(" + strings.Join(parts, " OR ") + ")", nil
}
