package instancesearch

import (
	"bytes"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
)

// valueType is the type of a predicate's value.
type valueType string

const (
	typeInt    valueType = "int"
	typeFloat  valueType = "float"
	typeString valueType = "string"
	typeBool   valueType = "bool"
	typeTime   valueType = "time"
	typeUUID   valueType = "uuid"
	typeEnum   valueType = "enum"
)

func (t valueType) sqlType() string {
	switch t {
	case typeInt:
		return "bigint"
	case typeFloat:
		return "float8"
	case typeBool:
		return "boolean"
	case typeTime:
		return "timestamptz"
	case typeUUID:
		return "uuid"
	default:
		return "text"
	}
}

func (t valueType) ops() []Op {
	switch t {
	case typeInt, typeFloat, typeTime:
		return []Op{OpEq, OpNe, OpLt, OpLte, OpGt, OpGte, OpBetween}
	case typeBool:
		return []Op{OpEq, OpNe}
	case typeString:
		return []Op{OpEq, OpNe, OpIn, OpNotIn, OpContains, OpStartsWith}
	default:
		return []Op{OpEq, OpNe, OpIn, OpNotIn}
	}
}

// field is one searchable predicate.
type field struct {
	Name  string
	Scope scopeKind
	Type  valueType
	Enum  []string
	Unit  string
	Doc   string
	// Bosses: the predicate accepts bosses + match.
	Bosses bool
	// ParseScope: the predicate accepts parse_scope.
	ParseScope bool
	// Metric: the predicate accepts metric.
	Metric bool
	// On: the predicate reads per-fight player rows and accepts on
	// (bosses, trash, any).
	On bool
	// Cost is the field's weight in Compiled.Cost. Zero means 1 (a plain
	// column). Correlated subqueries cost more; per-player ranking lookups
	// and clear-window math the most.
	Cost int

	// value says where the field's value comes from. The match condition is
	// derived from it (see sql), and explain reads it to show the evidence.
	value func(c *compiler, s scope, p pred) valueSQL
	// compile overrides the derived condition for fields whose comparison is
	// not "value op argument" (capabilities are a set).
	compile func(c *compiler, s scope, p pred) string
}

// valueSQL is where a field's value comes from.
type valueSQL struct {
	// Expr is the value: a scalar expression in scope, or, when From is set,
	// the value of one From row.
	Expr string
	// From is "<table> <alias> WHERE <correlation>" for fields read per boss
	// or per fight; Name is the row's boss or fight name column. Conditions
	// on these fields go through bossMatch.
	From string
	Name string
}

// sql compiles the field's match condition.
func (f *field) sql(c *compiler, s scope, p pred) string {
	if f.compile != nil {
		return f.compile(c, s, p)
	}
	v := f.value(c, s, p)
	cond := c.cmp(v.Expr, p)
	if v.From == "" {
		return cond
	}
	return c.bossMatch(p, v.From, v.Name, cond)
}

// pred is a validated predicate.
type pred struct {
	typ        valueType
	op         Op
	value      any
	bosses     []string
	match      Match
	parseScope ParseScope
	metric     Metric
	on         On
}

const maxStringLen = 200

// cmp compares expr with the predicate value. User values are always bound.
// Free-text strings compare case-insensitively: both sides are lowered in
// Postgres so Go and the database never disagree about non-ASCII names.
// Enums are already canonicalized during validation.
func (c *compiler) cmp(expr string, p pred) string {
	if p.typ == typeString {
		switch p.op {
		case OpIn:
			return fmt.Sprintf("lower(%s) = ANY(%s)", expr, lowerArray(c.arg(p.value)))
		case OpNotIn:
			return fmt.Sprintf("NOT (lower(%s) = ANY(%s))", expr, lowerArray(c.arg(p.value)))
		case OpContains:
			// strpos, not LIKE, so % and _ in user input are literal.
			return fmt.Sprintf("strpos(lower(%s), lower(%s::text)) > 0", expr, c.arg(p.value))
		case OpStartsWith:
			return fmt.Sprintf("starts_with(lower(%s), lower(%s::text))", expr, c.arg(p.value))
		default:
			return fmt.Sprintf("lower(%s) %s lower(%s::text)", expr, sqlOp(p.op), c.arg(p.value))
		}
	}
	cast := p.typ.sqlType()
	switch p.op {
	case OpBetween:
		bounds := p.value.([]any)
		return fmt.Sprintf("%s BETWEEN %s::%s AND %s::%s", expr, c.arg(bounds[0]), cast, c.arg(bounds[1]), cast)
	case OpIn:
		return fmt.Sprintf("%s = ANY(%s::%s[])", expr, c.arg(p.value), cast)
	case OpNotIn:
		return fmt.Sprintf("NOT (%s = ANY(%s::%s[]))", expr, c.arg(p.value), cast)
	default:
		return fmt.Sprintf("%s %s %s::%s", expr, sqlOp(p.op), c.arg(p.value), cast)
	}
}

// lowerArray lowers every element of a bound text[] parameter.
func lowerArray(arg string) string {
	return fmt.Sprintf("ARRAY(SELECT lower(v) FROM unnest(%s::text[]) v)", arg)
}

// bossMatch applies a condition to rows that each belong to one boss. Boss
// names match case-insensitively. from is "<table> <alias> WHERE <correlation>".
//
//   - match any, no bosses: some row satisfies cond.
//   - match any, bosses:    some row of one of the bosses satisfies cond.
//   - match each:           every listed boss has a row that satisfies cond.
func (c *compiler) bossMatch(p pred, from, nameCol, cond string) string {
	if len(p.bosses) == 0 {
		return fmt.Sprintf("EXISTS (SELECT 1 FROM %s AND %s)", from, cond)
	}
	bosses := lowerArray(c.arg(p.bosses))
	if p.match == MatchEach {
		return fmt.Sprintf("(SELECT count(DISTINCT lower(%s)) FROM %s AND lower(%s) = ANY(%s) AND %s) = cardinality(%s)",
			nameCol, from, nameCol, bosses, cond, bosses)
	}
	return fmt.Sprintf("EXISTS (SELECT 1 FROM %s AND lower(%s) = ANY(%s) AND %s)", from, nameCol, bosses, cond)
}

func (c *compiler) parsePred(f *field, n *Node, path string) (pred, error) {
	p := pred{typ: f.Type, op: n.Op}
	if !slices.Contains(f.Type.ops(), n.Op) {
		return p, &Error{Path: path + ".op", Message: fmt.Sprintf("%s supports %s", f.Name, joinOps(f.Type.ops()))}
	}
	if n.Value == nil {
		return p, &Error{Path: path + ".value", Message: "is required"}
	}
	// Value arrives as decoded JSON (any) or json.RawMessage; normalize to
	// bytes and decode strictly per the field type.
	value, err := json.Marshal(n.Value)
	if err != nil {
		return p, &Error{Path: path + ".value", Message: "invalid value"}
	}

	if n.Op == OpIn || n.Op == OpNotIn {
		var raw []json.RawMessage
		if err := json.Unmarshal(value, &raw); err != nil {
			return p, &Error{Path: path + ".value", Message: "must be a list for in / not_in"}
		}
		if len(raw) == 0 || len(raw) > c.opts.MaxListValues {
			return p, &Error{Path: path + ".value", Message: fmt.Sprintf("must have 1 to %d values", c.opts.MaxListValues)}
		}
		list := make([]string, 0, len(raw))
		for i, r := range raw {
			v, err := decodeScalar(f, r)
			if err != nil {
				return p, &Error{Path: fmt.Sprintf("%s.value[%d]", path, i), Message: err.Error()}
			}
			// in / not_in is only offered for string-like types.
			list = append(list, v.(string))
		}
		p.value = list
	} else if n.Op == OpBetween {
		var raw []json.RawMessage
		if err := json.Unmarshal(value, &raw); err != nil || len(raw) != 2 {
			return p, &Error{Path: path + ".value", Message: "must be [low, high] for between"}
		}
		bounds := make([]any, 2)
		for i, r := range raw {
			v, err := decodeScalar(f, r)
			if err != nil {
				return p, &Error{Path: fmt.Sprintf("%s.value[%d]", path, i), Message: err.Error()}
			}
			bounds[i] = v
		}
		if !ordered(bounds[0], bounds[1]) {
			return p, &Error{Path: path + ".value", Message: "low must not be above high"}
		}
		p.value = bounds
	} else {
		v, err := decodeScalar(f, value)
		if err != nil {
			return p, &Error{Path: path + ".value", Message: err.Error()}
		}
		if (n.Op == OpContains || n.Op == OpStartsWith) && strings.TrimSpace(v.(string)) == "" {
			// An empty substring would match everything.
			return p, &Error{Path: path + ".value", Message: "must not be empty"}
		}
		p.value = v
	}

	if len(n.Bosses) > 0 || n.Match != "" {
		if !f.Bosses {
			return p, &Error{Path: path + ".bosses", Message: fmt.Sprintf("%s does not take bosses or match", f.Name)}
		}
	}
	if f.Bosses {
		if len(n.Bosses) > c.opts.MaxListValues {
			return p, &Error{Path: path + ".bosses", Message: fmt.Sprintf("must have at most %d bosses", c.opts.MaxListValues)}
		}
		seen := map[string]bool{}
		for i, b := range n.Bosses {
			b = strings.TrimSpace(b)
			if b == "" || len(b) > maxStringLen {
				return p, &Error{Path: fmt.Sprintf("%s.bosses[%d]", path, i), Message: "must be a boss name"}
			}
			// Boss names match case-insensitively, so dedupe the same way;
			// match each compares the distinct count to the list length.
			if key := strings.ToLower(b); !seen[key] {
				seen[key] = true
				p.bosses = append(p.bosses, b)
			}
		}
		switch n.Match {
		case "", MatchAny:
			p.match = MatchAny
		case MatchEach:
			if len(p.bosses) == 0 {
				return p, &Error{Path: path + ".match", Message: "each requires a list of bosses"}
			}
			p.match = MatchEach
		default:
			return p, &Error{Path: path + ".match", Message: "must be any or each"}
		}
	}

	if n.ParseScope != "" && !f.ParseScope {
		return p, &Error{Path: path + ".parse_scope", Message: fmt.Sprintf("%s does not take parse_scope", f.Name)}
	}
	if f.ParseScope {
		switch n.ParseScope {
		case "":
			p.parseScope = ParseScopeServer
		case ParseScopeServer, ParseScopeRealm, ParseScopeGuild:
			p.parseScope = n.ParseScope
		default:
			return p, &Error{Path: path + ".parse_scope", Message: "must be server, realm or guild"}
		}
	}

	if n.Metric != "" && !f.Metric {
		return p, &Error{Path: path + ".metric", Message: fmt.Sprintf("%s does not take metric", f.Name)}
	}
	if f.Metric {
		switch n.Metric {
		case "":
			p.metric = MetricDPS
		case MetricDPS, MetricHPS:
			p.metric = n.Metric
		default:
			return p, &Error{Path: path + ".metric", Message: "must be dps or hps"}
		}
	}

	if n.On != "" && !f.On {
		return p, &Error{Path: path + ".on", Message: fmt.Sprintf("%s does not take on", f.Name)}
	}
	if f.On {
		switch n.On {
		case "", OnBosses:
			p.on = OnBosses
		case OnTrash, OnAny:
			p.on = n.On
			// Trash is one aggregated row, so a boss list only makes sense
			// for boss kills.
			if len(p.bosses) > 0 {
				return p, &Error{Path: path + ".bosses", Message: "bosses and match only apply with on: bosses"}
			}
		default:
			return p, &Error{Path: path + ".on", Message: "must be bosses, trash or any"}
		}
	}
	return p, nil
}

func decodeScalar(f *field, raw json.RawMessage) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, fmt.Errorf("invalid value")
	}
	switch f.Type {
	case typeInt:
		num, ok := v.(json.Number)
		if !ok {
			return nil, fmt.Errorf("must be an integer")
		}
		i, err := num.Int64()
		if err != nil {
			return nil, fmt.Errorf("must be an integer")
		}
		return i, nil
	case typeFloat:
		num, ok := v.(json.Number)
		if !ok {
			return nil, fmt.Errorf("must be a number")
		}
		fl, err := num.Float64()
		if err != nil {
			return nil, fmt.Errorf("must be a number")
		}
		return fl, nil
	case typeBool:
		b, ok := v.(bool)
		if !ok {
			return nil, fmt.Errorf("must be true or false")
		}
		return b, nil
	}

	s, ok := v.(string)
	if !ok {
		return nil, fmt.Errorf("must be a string")
	}
	if len(s) > maxStringLen {
		return nil, fmt.Errorf("must be at most %d characters", maxStringLen)
	}
	switch f.Type {
	case typeTime:
		t, err := time.Parse(time.RFC3339, s)
		if err != nil {
			return nil, fmt.Errorf("must be an RFC 3339 timestamp")
		}
		return t, nil
	case typeUUID:
		id, err := uuid.Parse(s)
		if err != nil {
			return nil, fmt.Errorf("must be a UUID")
		}
		return id.String(), nil
	case typeEnum:
		// Accept any case and send the canonical stored value, so enum
		// comparisons stay exact (and index-friendly) in SQL.
		for _, e := range f.Enum {
			if strings.EqualFold(e, s) {
				return e, nil
			}
		}
		return nil, fmt.Errorf("must be one of %s", strings.Join(f.Enum, ", "))
	}
	return s, nil
}

// ordered reports lo <= hi for decoded between bounds (int64, float64 or
// time.Time; the types match because both come from the same field).
func ordered(lo, hi any) bool {
	switch l := lo.(type) {
	case int64:
		return l <= hi.(int64)
	case float64:
		return l <= hi.(float64)
	case time.Time:
		return !l.After(hi.(time.Time))
	}
	return true
}

func joinOps(ops []Op) string {
	s := make([]string, len(ops))
	for i, op := range ops {
		s[i] = string(op)
	}
	return strings.Join(s, ", ")
}

// column is a plain SQL expression in scope; {a} is the quantifier alias.
func column(expr string) func(c *compiler, s scope, p pred) valueSQL {
	return func(c *compiler, s scope, p pred) valueSQL {
		return valueSQL{Expr: strings.ReplaceAll(expr, "{a}", s.alias)}
	}
}

const (
	killedSQL       = "IN ('clean', 'partial')"
	scoredStatusSQL = "IN ('ok', 'low_confidence')"
)

func durationMS(alias string) string {
	return fmt.Sprintf("(EXTRACT(EPOCH FROM (%[1]s.end_time - %[1]s.start_time)) * 1000)::bigint", alias)
}

// rankingRows are a player's per-fight rows in encounter_dps_rankings: one
// per boss kill (encounter_id set) and one aggregated trash row per spec
// (encounter_id NULL). on picks boss kills, trash, or both; bosses and trash
// are exact complements.
func (c *compiler) rankingRows(s scope, on On) (from, alias string) {
	alias = c.alias("r")
	fights := ""
	switch on {
	case OnTrash:
		fights = fmt.Sprintf(" AND %s.encounter_id IS NULL", alias)
	case OnAny:
	default:
		fights = fmt.Sprintf(" AND %s.encounter_id IS NOT NULL", alias)
	}
	return fmt.Sprintf("encounter_dps_rankings %[1]s WHERE %[1]s.instance_id = li.id AND %[1]s.player_guid = %[2]s.unit_guid::text%[3]s",
		alias, s.alias, fights), alias
}

func rankingField(col string) func(c *compiler, s scope, p pred) valueSQL {
	return func(c *compiler, s scope, p pred) valueSQL {
		from, r := c.rankingRows(s, p.on)
		return valueSQL{Expr: r + "." + col, From: from, Name: r + ".encounter_name"}
	}
}

// clearParts computes boss, trash and idle time inside the ranked clear
// window, the same way GuildSpeedrunHistory does: fights are clipped to the
// window, overlapping pulls are merged (gaps and islands), boss = merged boss
// fights, trash = merged all fights minus boss, idle = clear minus all fights.
func clearParts(part string) func(c *compiler, s scope, p pred) valueSQL {
	return func(c *compiler, s scope, p pred) valueSQL {
		sr := c.alias("sr")
		var expr string
		switch part {
		case "boss":
			expr = "parts.boss_ms"
		case "trash":
			expr = "GREATEST(parts.all_ms - parts.boss_ms, 0)"
		default:
			expr = fmt.Sprintf("GREATEST(%s.ranked_duration_ms - parts.all_ms, 0)", sr)
		}
		sub := fmt.Sprintf(`(SELECT (%[2]s)::bigint
    FROM instance_speedruns %[1]s
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(island_ms) FILTER (WHERE scope = 'all'), 0) AS all_ms,
        COALESCE(SUM(island_ms) FILTER (WHERE scope = 'boss'), 0) AS boss_ms
      FROM (
        SELECT scope, EXTRACT(EPOCH FROM (MAX(fight_end) - MIN(fight_start))) * 1000 AS island_ms
        FROM (
          SELECT scope, fight_start, fight_end,
            SUM(starts_island) OVER (PARTITION BY scope ORDER BY fight_start, fight_end) AS island
          FROM (
            SELECT scope, fight_start, fight_end,
              CASE WHEN fight_start <= MAX(fight_end) OVER (
                PARTITION BY scope ORDER BY fight_start, fight_end
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
              ) THEN 0 ELSE 1 END AS starts_island
            FROM (
              SELECT fs.scope, GREATEST(fe.start_time, %[1]s.ranked_start_time) AS fight_start,
                LEAST(fe.end_time, %[1]s.ranked_completion_time) AS fight_end
              FROM log_instance_encounters fe
              CROSS JOIN LATERAL (SELECT 'all'::text AS scope UNION ALL SELECT 'boss'::text WHERE fe.boss) fs
              WHERE fe.instance_id = li.id
            ) fights
            WHERE fight_end > fight_start
          ) marked
        ) islands
        GROUP BY scope, island
      ) merged
    ) parts
    WHERE %[1]s.instance_id = li.id AND %[1]s.ranked_duration_ms > 0)`, sr, expr)
		return valueSQL{Expr: sub}
	}
}

var (
	classes = []string{
		"WARRIOR", "PALADIN", "HUNTER", "ROGUE", "PRIEST", "SHAMAN", "MAGE", "WARLOCK", "DRUID",
		"DEATH_KNIGHT", "MONK", "DEMON_HUNTER",
	}
	races = []string{
		"Human", "Dwarf", "NightElf", "Gnome", "Draenei", "Orc", "Scourge", "Tauren", "Troll", "Goblin", "BloodElf",
	}
	outcomes = []string{"clean", "partial", "wipe", "reset"}
	// roles are the values stored in encounter_dps_rankings.player_role.
	roles = []string{"dps", "heal", "tank"}
	// capabilities are the values the log parser writes to
	// log_instances.capabilities (chronicle/logparse_parse.go).
	capabilities = []string{"overheal", "absorb", "unit-resources", "unit-position", "raidgroup", "interrupt", "server-side"}
)

var fields = []*field{
	// ---- Instance scope -------------------------------------------------
	{Name: "instance.name", Scope: scopeInstance, Type: typeString,
		Doc:   "Zone name, e.g. \"Molten Core\".",
		value: column("COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), li.name)")},
	{Name: "instance.realm", Scope: scopeInstance, Type: typeString,
		Doc: "Realm name.", value: column("wsr.name")},
	{Name: "instance.realm_id", Scope: scopeInstance, Type: typeUUID,
		Doc: "Realm ID.", value: column("li.realm_id")},
	{Name: "instance.guild", Scope: scopeInstance, Type: typeString,
		Doc: "Name of the guild the run is attributed to. Runs without a guild never match.", value: column("g.name")},
	{Name: "instance.guild_id", Scope: scopeInstance, Type: typeUUID,
		Doc: "ID of the guild the run is attributed to.", value: column("li.guild_id")},
	{Name: "instance.started_at", Scope: scopeInstance, Type: typeTime,
		Doc: "When the run started (upload time if unknown). RFC 3339.", value: column("COALESCE(li.start_time, wlg.created_at)")},
	{Name: "instance.difficulty", Scope: scopeInstance, Type: typeString,
		Doc: "Difficulty name, e.g. \"10 Player\". Empty on servers without difficulties.", value: column("li.difficulty_name")},
	{Name: "instance.max_players", Scope: scopeInstance, Type: typeInt,
		Doc: "Declared raid size (0 when unknown).", value: column("li.max_players")},
	{Name: "instance.category", Scope: scopeInstance, Type: typeEnum, Enum: []string{"raid", "dungeon"},
		Doc: "raid or dungeon.", value: column("li.category")},
	{Name: "instance.recorder", Scope: scopeInstance, Type: typeString,
		Doc: "Name of the character that recorded the log.", value: column("li.recorder_name")},
	{Name: "instance.has_video", Cost: 2, Scope: scopeInstance, Type: typeBool,
		Doc:   "A YouTube video is linked to the run.",
		value: column("EXISTS (SELECT 1 FROM log_instance_youtube_timestamped yt WHERE yt.log_instance_id = li.id OR yt.instance_slug = li.hashed_slug)")},
	{Name: "instance.capability", Scope: scopeInstance, Type: typeEnum, Enum: capabilities,
		Doc:   "What the log recorded. `=` has it, `!=` lacks it, `in` has any of them, `not_in` has none of them. AND several `=` to require all.",
		value: column("li.capabilities"),
		compile: func(c *compiler, s scope, p pred) string {
			switch p.op {
			case OpIn:
				return fmt.Sprintf("li.capabilities && %s::text[]", c.arg(p.value))
			case OpNotIn:
				return fmt.Sprintf("NOT (li.capabilities && %s::text[])", c.arg(p.value))
			case OpNe:
				return fmt.Sprintf("NOT (%s::text = ANY(li.capabilities))", c.arg(p.value))
			default:
				return fmt.Sprintf("%s::text = ANY(li.capabilities)", c.arg(p.value))
			}
		}},
	{Name: "instance.player_count", Cost: 2, Scope: scopeInstance, Type: typeInt,
		Doc:   "Number of distinct players in the run.",
		value: column("(SELECT count(DISTINCT lp.unit_guid) FROM log_instance_players lp WHERE lp.instance_id = li.id)")},
	{Name: "instance.bosses_killed", Cost: 2, Scope: scopeInstance, Type: typeInt,
		Doc:   "Number of distinct bosses killed (clean or partial).",
		value: column("(SELECT count(DISTINCT bk.name) FROM log_instance_encounters bk WHERE bk.instance_id = li.id AND bk.boss AND bk.kill_type " + killedSQL + ")")},
	{Name: "instance.wipes", Cost: 2, Scope: scopeInstance, Type: typeInt,
		Doc:   "Total wipes in the run (overview metrics).",
		value: column("(SELECT iom.wipe_count FROM instance_overview_metrics iom WHERE iom.instance_id = li.id)")},
	{Name: "instance.deaths", Cost: 2, Scope: scopeInstance, Type: typeInt,
		Doc:   "Total player deaths in the run (overview metrics).",
		value: column("(SELECT iom.player_deaths FROM instance_overview_metrics iom WHERE iom.instance_id = li.id)")},
	{Name: "instance.clear_time_ms", Cost: 2, Scope: scopeInstance, Type: typeInt, Unit: "ms",
		Doc:   "Ranked full-clear time. Only full clears have one.",
		value: column("(SELECT sr.ranked_duration_ms FROM instance_speedruns sr WHERE sr.instance_id = li.id AND sr.ranked_duration_ms > 0)")},
	{Name: "instance.clear_qualified", Cost: 2, Scope: scopeInstance, Type: typeBool,
		Doc:   "The clear qualifies for speedrun leaderboards.",
		value: column("(SELECT sr.qualified FROM instance_speedruns sr WHERE sr.instance_id = li.id)")},
	{Name: "instance.boss_time_ms", Cost: 10, Scope: scopeInstance, Type: typeInt, Unit: "ms",
		Doc: "Time inside the clear spent fighting bosses. Full clears only.", value: clearParts("boss")},
	{Name: "instance.trash_time_ms", Cost: 10, Scope: scopeInstance, Type: typeInt, Unit: "ms",
		Doc: "Time inside the clear spent fighting trash (non-boss fights). Full clears only.", value: clearParts("trash")},
	{Name: "instance.idle_time_ms", Cost: 10, Scope: scopeInstance, Type: typeInt, Unit: "ms",
		Doc: "Time inside the clear spent out of combat. Full clears only.", value: clearParts("idle")},
	{Name: "instance.clear_parse", Cost: 3, Scope: scopeInstance, Type: typeInt, Unit: "0-100", ParseScope: true,
		Doc: "Clear-time parse (higher is faster).",
		value: func(c *compiler, s scope, p pred) valueSQL {
			tps := c.alias("tps")
			col := fmt.Sprintf("%s.clear_%s", tps, p.parseScope)
			return valueSQL{Expr: fmt.Sprintf("(SELECT %[1]s_display_score FROM time_parse_scores %[2]s WHERE %[3]s AND %[1]s_status %[4]s)",
				col, tps, c.timeParseContract(tps), scoredStatusSQL)}
		}},
	{Name: "instance.kill_time_parse", Cost: 4, Scope: scopeInstance, Type: typeInt, Unit: "0-100", ParseScope: true, Bosses: true,
		Doc: "Boss kill-time parse (higher is faster) on any / each of the bosses.",
		value: func(c *compiler, s scope, p pred) valueSQL {
			tps, tbs := c.alias("tps"), c.alias("tbs")
			from := fmt.Sprintf("time_parse_scores %[1]s JOIN time_parse_boss_scores %[2]s ON %[2]s.time_parse_score_id = %[1]s.id WHERE %[3]s AND %[2]s.%[4]s_status %[5]s",
				tps, tbs, c.timeParseContract(tps), p.parseScope, scoredStatusSQL)
			return valueSQL{Expr: fmt.Sprintf("%s.%s_display_score", tbs, p.parseScope), From: from, Name: tbs + ".encounter_name"}
		}},
	{Name: "instance.kill_time_ms", Cost: 3, Scope: scopeInstance, Type: typeInt, Unit: "ms", Bosses: true,
		Doc: "Boss kill duration (clean or partial kills) on any / each of the bosses.",
		value: func(c *compiler, s scope, p pred) valueSQL {
			e := c.alias("k")
			from := fmt.Sprintf("log_instance_encounters %[1]s WHERE %[1]s.instance_id = li.id AND %[1]s.boss AND %[1]s.kill_type %[2]s", e, killedSQL)
			return valueSQL{Expr: durationMS(e), From: from, Name: e + ".name"}
		}},

	// ---- Encounter scope (inside any_encounter / count_encounters) ------
	{Name: "encounter.name", Scope: scopeEncounter, Type: typeString,
		Doc: "Encounter name (boss name for boss fights).", value: column("{a}.name")},
	{Name: "encounter.boss", Scope: scopeEncounter, Type: typeBool,
		Doc: "The encounter is a boss fight.", value: column("{a}.boss")},
	{Name: "encounter.outcome", Scope: scopeEncounter, Type: typeEnum, Enum: outcomes,
		Doc: "clean (kill), partial (kill with gaps), wipe or reset.", value: column("{a}.kill_type::text")},
	{Name: "encounter.killed", Scope: scopeEncounter, Type: typeBool,
		Doc: "The encounter ended in a kill (clean or partial).", value: column("({a}.kill_type " + killedSQL + ")")},
	{Name: "encounter.duration_ms", Scope: scopeEncounter, Type: typeInt, Unit: "ms",
		Doc: "Pull duration.",
		value: func(c *compiler, s scope, p pred) valueSQL {
			return valueSQL{Expr: durationMS(s.alias)}
		}},
	{Name: "encounter.kill_time_parse", Cost: 4, Scope: scopeEncounter, Type: typeInt, Unit: "0-100", ParseScope: true,
		Doc: "Kill-time parse for this kill.",
		value: func(c *compiler, s scope, p pred) valueSQL {
			tps, tbs := c.alias("tps"), c.alias("tbs")
			return valueSQL{Expr: fmt.Sprintf("(SELECT %[2]s.%[5]s_display_score FROM time_parse_scores %[1]s JOIN time_parse_boss_scores %[2]s ON %[2]s.time_parse_score_id = %[1]s.id WHERE %[3]s AND %[2]s.encounter_id = %[4]s.id AND %[2]s.%[5]s_status %[6]s)",
				tps, tbs, c.timeParseContract(tps), s.alias, p.parseScope, scoredStatusSQL)}
		}},

	// ---- Player scope (inside any_player / count_players) ---------------
	{Name: "player.name", Scope: scopePlayer, Type: typeString,
		Doc: "Character name.", value: column("{a}.name")},
	{Name: "player.guid", Scope: scopePlayer, Type: typeString,
		Doc: "Character GUID, e.g. \"0x0000000000012345\".", value: column("{a}.unit_guid::text")},
	{Name: "player.class", Scope: scopePlayer, Type: typeEnum, Enum: classes,
		Doc: "Class.", value: column("{a}.class::text")},
	{Name: "player.race", Scope: scopePlayer, Type: typeEnum, Enum: races,
		Doc: "Race.", value: column("{a}.race::text")},
	{Name: "player.level", Scope: scopePlayer, Type: typeInt,
		Doc: "Level.", value: column("{a}.level")},
	{Name: "player.guild", Cost: 2, Scope: scopePlayer, Type: typeString,
		Doc: "Guild name at the time of the run.", value: column("(SELECT pg.name FROM guilds pg WHERE pg.id = {a}.guild_id)")},
	{Name: "player.guild_id", Scope: scopePlayer, Type: typeUUID,
		Doc: "Guild ID at the time of the run.", value: column("{a}.guild_id")},
	{Name: "player.spec", Cost: 3, Scope: scopePlayer, Type: typeString, Bosses: true, On: true,
		Doc: "Spec in a fight, e.g. \"Feral\". Read from boss kills by default; see on.", value: rankingField("player_spec")},
	{Name: "player.sub_spec", Cost: 3, Scope: scopePlayer, Type: typeString, Bosses: true, On: true,
		Doc: "Sub-spec in a fight: Bear / Cat (Feral druid), Tank / DPS (Enhancement shaman), Fury Prot. Empty for other specs and servers.", value: rankingField("player_sub_spec")},
	{Name: "player.role", Cost: 3, Scope: scopePlayer, Type: typeEnum, Enum: roles, Bosses: true, On: true,
		Doc: "Role in a fight.", value: rankingField("player_role")},
	{Name: "player.dps", Cost: 3, Scope: scopePlayer, Type: typeFloat, Bosses: true, On: true,
		Doc: "DPS in a fight.", value: rankingField("dps")},
	{Name: "player.hps", Cost: 3, Scope: scopePlayer, Type: typeFloat, Bosses: true, On: true,
		Doc: "HPS in a fight.", value: rankingField("hps")},
	{Name: "player.deaths", Cost: 3, Scope: scopePlayer, Type: typeInt, Bosses: true, On: true,
		Doc: "Deaths in a fight. Wipes are not counted.", value: rankingField("player_deaths")},
	{Name: "player.avg_ilvl", Cost: 3, Scope: scopePlayer, Type: typeInt, Bosses: true, On: true,
		Doc: "Average item level in a fight.", value: rankingField("avg_ilvl")},
	{Name: "player.parse", Cost: 15, Scope: scopePlayer, Type: typeInt, Unit: "0-100", Bosses: true, Metric: true,
		Doc: "Player parse on a boss kill (latest stored score per boss).",
		value: func(c *compiler, s scope, p pred) valueSQL {
			r := c.alias("ps")
			from := fmt.Sprintf(`(SELECT DISTINCT ON (x.encounter_name) x.encounter_name, x.display_score, x.status
      FROM parse_score_results x
      WHERE x.tenant_id = %[2]s AND x.instance_id = li.id AND x.player_guid = %[3]s.unit_guid::text AND x.metric = %[4]s::text
      ORDER BY x.encounter_name, x.created_at DESC, x.precise_score DESC) %[1]s WHERE %[1]s.status %[5]s`,
				r, c.tenant(), s.alias, c.arg(string(p.metric)), scoredStatusSQL)
			return valueSQL{Expr: r + ".display_score", From: from, Name: r + ".encounter_name"}
		}},
}

var fieldsByName = func() map[string]*field {
	m := make(map[string]*field, len(fields))
	for _, f := range fields {
		if _, dup := m[f.Name]; dup {
			panic("duplicate instance search field " + f.Name)
		}
		m[f.Name] = f
	}
	return m
}()
