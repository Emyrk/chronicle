package instancesearch

import (
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
)

const (
	DefaultLimit         = 25
	DefaultMaxLimit      = 100
	DefaultMaxNodes      = 64
	DefaultMaxDepth      = 8
	DefaultMaxListValues = 50
	// DefaultTimeParseLookbackDays matches the lookback the instance page
	// reads (servicerankings.TimeParseScoreLookbackDays).
	DefaultTimeParseLookbackDays int16 = 60
)

// Options configures compilation. The zero value uses defaults.
type Options struct {
	// TenantID scopes tables that carry their own tenant_id and are not
	// protected by row-level security (parse_score_results,
	// time_parse_scores). uuid.Nil is the main site. Search fills this from
	// the request context; Compile callers must pass the same tenant the
	// connection's app.tenant_id is set to.
	TenantID uuid.UUID

	MaxLimit      int
	MaxNodes      int
	MaxDepth      int
	MaxListValues int

	// Time-parse scoring contract. Zero values use the current policy.
	TimeParseLookbackDays  int16
	TimeParsePolicyVersion int16
	TimeParseQueryVersion  int16
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
	if o.TimeParseLookbackDays == 0 {
		o.TimeParseLookbackDays = DefaultTimeParseLookbackDays
	}
	if o.TimeParsePolicyVersion == 0 {
		o.TimeParsePolicyVersion = timeparsepolicy.PolicyVersion
	}
	if o.TimeParseQueryVersion == 0 {
		o.TimeParseQueryVersion = timeparsepolicy.QueryVersion
	}
	return o
}

// Compiled is a ready-to-run query. Columns are documented on Result.
type Compiled struct {
	SQL   string
	Args  []any
	Limit int
	// Cost is a rough estimate of how expensive the query is to run: the
	// sum of per-field and per-quantifier weights. Rate limiters charge it as
	// tokens, so heavy queries drain a bucket faster.
	Cost int
	// Fields lists each predicate field used, once per use.
	Fields []string
}

const (
	baseCost         = 1
	anyQuantCost     = 2
	countQuantCost   = 3
	defaultFieldCost = 1
)

// Error is a validation error that is safe to show to the user.
type Error struct {
	Path    string
	Message string
}

func (e *Error) Error() string {
	if e.Path == "" {
		return e.Message
	}
	return e.Path + ": " + e.Message
}

// Compile validates q and returns the SQL that runs it. Validation errors are
// *Error.
func Compile(q Query, opts Options) (Compiled, error) {
	opts = opts.withDefaults()
	c := &compiler{opts: opts}

	limit := q.Limit
	if limit == 0 {
		limit = DefaultLimit
	}
	if limit < 0 || limit > opts.MaxLimit {
		return Compiled{}, &Error{Path: "limit", Message: fmt.Sprintf("must be between 1 and %d", opts.MaxLimit)}
	}

	where := "TRUE"
	if q.Where != nil {
		var err error
		where, err = c.node(q.Where, "where", scope{kind: scopeInstance}, 1)
		if err != nil {
			return Compiled{}, err
		}
	}

	cursor := "TRUE"
	if q.Cursor != nil {
		if q.Cursor.ID == uuid.Nil || q.Cursor.StartedAt.IsZero() {
			return Compiled{}, &Error{Path: "cursor", Message: "started_at and id are required"}
		}
		cursor = fmt.Sprintf("(m.started_at, m.id) < (%s::timestamptz, %s::uuid)",
			c.arg(q.Cursor.StartedAt), c.arg(q.Cursor.ID.String()))
	}
	// Fetch one extra row so the caller knows whether another page exists.
	limitArg := c.arg(int64(limit + 1))

	sql := strings.NewReplacer(
		"{{WHERE}}", where,
		"{{CURSOR}}", cursor,
		"{{LIMIT}}", limitArg,
	).Replace(frameSQL)
	return Compiled{SQL: sql, Args: c.args, Limit: limit, Cost: baseCost + c.cost, Fields: c.fields}, nil
}

// frameSQL is the fixed outer query. Only {{WHERE}} carries the compiled
// tree, and it is always parenthesized under an AND, so the tree can only
// narrow the visible set.
//
//   - JOIN wow_server_realms: RLS on realms/servers applies the tenant scope.
//   - Finalized parse generation, not unlisted, not invalidated: the same
//     visibility as ListRecentInstances.
//   - DISTINCT ON the logical run collapses duplicate uploads to one row.
const frameSQL = `WITH matched AS (
  SELECT DISTINCT ON (COALESCE(li.duplicate_group_id, li.id))
    li.id,
    li.hashed_slug,
    COALESCE(NULLIF(btrim(li.name), ''), NULLIF(btrim(sm.instance_name), ''), li.name) AS name,
    li.realm_id,
    wsr.name AS realm_name,
    li.guild_id,
    g.name AS guild_name,
    li.difficulty_name,
    li.max_players,
    COALESCE(li.start_time, wlg.created_at) AS started_at
` + frameFrom + `
    AND ({{WHERE}})
  ORDER BY COALESCE(li.duplicate_group_id, li.id), li.id
)
-- Summary columns are computed only for the page of results, after the
-- limit, so they never slow the search itself.
SELECT p.id, p.hashed_slug, p.name, p.realm_id, p.realm_name, p.guild_id, p.guild_name,
  p.difficulty_name, p.max_players, p.started_at,
  (SELECT count(DISTINCT lp.unit_guid) FROM log_instance_players lp WHERE lp.instance_id = p.id) AS player_count,
  (SELECT count(DISTINCT be.name) FROM log_instance_encounters be
    WHERE be.instance_id = p.id AND be.boss AND be.kill_type IN ('clean', 'partial')) AS bosses_killed,
  (SELECT sr.ranked_duration_ms FROM instance_speedruns sr
    WHERE sr.instance_id = p.id AND sr.ranked_duration_ms > 0) AS clear_time_ms
FROM (
  SELECT m.*
  FROM matched m
  WHERE {{CURSOR}}
  ORDER BY m.started_at DESC, m.id DESC
  LIMIT {{LIMIT}}
) p
ORDER BY p.started_at DESC, p.id DESC`

// frameFrom is the visibility frame shared by search and explain: tenant
// RLS through wow_server_realms, finalized + listed + valid logs. Fields may
// reference li, wsr, wlg, sm and g.
const frameFrom = `  FROM log_instances li
  JOIN wow_server_realms wsr ON wsr.id = li.realm_id
  JOIN parsed_log_group plg ON plg.id = li.log_group_id
  JOIN wow_log_groups wlg ON wlg.id = plg.id
    AND plg.parse_generation = wlg.parse_generation
    AND plg.finalized_at IS NOT NULL
    AND NOT wlg.unlisted
  LEFT JOIN server_upload_meta sm ON sm.log_group_id = li.log_group_id
  LEFT JOIN guilds g ON g.id = li.guild_id
  WHERE li.invalidated_at IS NULL`

type scopeKind int

const (
	scopeInstance scopeKind = iota
	scopePlayer
	scopeEncounter
)

func (s scopeKind) String() string {
	switch s {
	case scopePlayer:
		return "player"
	case scopeEncounter:
		return "encounter"
	default:
		return "instance"
	}
}

// scope is the row a predicate is evaluated against. Instance predicates use
// "li"; player and encounter predicates use the alias of the enclosing
// quantifier.
type scope struct {
	kind  scopeKind
	alias string
}

type compiler struct {
	opts    Options
	args    []any
	nodes   int
	aliases int
	cost    int
	fields  []string

	tenantArg   string
	contractArg [3]string
}

// arg binds v as the next positional parameter.
func (c *compiler) arg(v any) string {
	c.args = append(c.args, v)
	return fmt.Sprintf("$%d", len(c.args))
}

// alias returns a fresh table alias so nested subqueries never collide.
func (c *compiler) alias(prefix string) string {
	c.aliases++
	return fmt.Sprintf("%s%d", prefix, c.aliases)
}

// tenant returns the bound tenant parameter, shared by every predicate.
func (c *compiler) tenant() string {
	if c.tenantArg == "" {
		c.tenantArg = c.arg(c.opts.TenantID.String()) + "::uuid"
	}
	return c.tenantArg
}

// timeParseContract returns SQL that pins a time_parse_scores alias to the
// current scoring contract and tenant.
func (c *compiler) timeParseContract(tps string) string {
	if c.contractArg[0] == "" {
		c.contractArg[0] = c.arg(c.opts.TimeParseLookbackDays) + "::smallint"
		c.contractArg[1] = c.arg(c.opts.TimeParsePolicyVersion) + "::smallint"
		c.contractArg[2] = c.arg(c.opts.TimeParseQueryVersion) + "::smallint"
	}
	return fmt.Sprintf("%[1]s.tenant_id = %[2]s AND %[1]s.instance_id = li.id AND %[1]s.lookback_days = %[3]s AND %[1]s.policy_version = %[4]s AND %[1]s.query_version = %[5]s",
		tps, c.tenant(), c.contractArg[0], c.contractArg[1], c.contractArg[2])
}

func (c *compiler) node(n *Node, path string, s scope, depth int) (string, error) {
	c.nodes++
	if c.nodes > c.opts.MaxNodes {
		return "", &Error{Path: path, Message: fmt.Sprintf("query has more than %d nodes", c.opts.MaxNodes)}
	}
	if depth > c.opts.MaxDepth {
		return "", &Error{Path: path, Message: fmt.Sprintf("query is nested deeper than %d levels", c.opts.MaxDepth)}
	}

	kinds := 0
	for _, set := range []bool{
		n.And != nil, n.Or != nil, n.Not != nil, n.AnyPlayer != nil, n.CountPlayers != nil,
		n.AnyEncounter != nil, n.CountEncounters != nil, n.Field != "",
	} {
		if set {
			kinds++
		}
	}
	if kinds != 1 {
		return "", &Error{Path: path, Message: "node must set exactly one of and, or, not, any_player, count_players, any_encounter, count_encounters, field"}
	}

	switch {
	case n.And != nil:
		return c.group(n.And, path+".and", " AND ", s, depth)
	case n.Or != nil:
		return c.group(n.Or, path+".or", " OR ", s, depth)
	case n.Not != nil:
		inner, err := c.node(n.Not, path+".not", s, depth+1)
		if err != nil {
			return "", err
		}
		return "NOT (" + inner + ")", nil
	case n.AnyPlayer != nil:
		return c.quantifier(n.AnyPlayer, nil, path+".any_player", scopePlayer, s, depth)
	case n.CountPlayers != nil:
		return c.quantifier(n.CountPlayers.Where, n.CountPlayers, path+".count_players", scopePlayer, s, depth)
	case n.AnyEncounter != nil:
		return c.quantifier(n.AnyEncounter, nil, path+".any_encounter", scopeEncounter, s, depth)
	case n.CountEncounters != nil:
		return c.quantifier(n.CountEncounters.Where, n.CountEncounters, path+".count_encounters", scopeEncounter, s, depth)
	default:
		return c.predicate(n, path, s)
	}
}

func (c *compiler) group(children []Node, path, sep string, s scope, depth int) (string, error) {
	if len(children) == 0 {
		return "", &Error{Path: path, Message: "must have at least one child"}
	}
	parts := make([]string, 0, len(children))
	for i := range children {
		part, err := c.node(&children[i], fmt.Sprintf("%s[%d]", path, i), s, depth+1)
		if err != nil {
			return "", err
		}
		parts = append(parts, "("+part+")")
	}
	return strings.Join(parts, sep), nil
}

// quantifier opens a player or encounter scope. any_* compiles to EXISTS;
// count_* to a correlated count compared with the bound value.
func (c *compiler) quantifier(where *Node, count *Count, path string, kind scopeKind, s scope, depth int) (string, error) {
	if s.kind != scopeInstance {
		return "", &Error{Path: path, Message: fmt.Sprintf("player and encounter quantifiers can only be used at the instance level, not inside a %s scope", s.kind)}
	}
	var (
		alias, from, distinct string
	)
	switch kind {
	case scopePlayer:
		alias = c.alias("p")
		from = fmt.Sprintf("log_instance_players %[1]s WHERE %[1]s.instance_id = li.id", alias)
		// log_instance_players has no unique key, so count each GUID once.
		distinct = "DISTINCT " + alias + ".unit_guid"
	case scopeEncounter:
		alias = c.alias("e")
		from = fmt.Sprintf("log_instance_encounters %[1]s WHERE %[1]s.instance_id = li.id", alias)
		distinct = alias + ".id"
	}

	inner := "TRUE"
	if where != nil {
		var err error
		inner, err = c.node(where, path+".where", scope{kind: kind, alias: alias}, depth+1)
		if err != nil {
			return "", err
		}
	}

	if count == nil {
		c.cost += anyQuantCost
		return fmt.Sprintf("EXISTS (SELECT 1 FROM %s AND (%s))", from, inner), nil
	}
	switch count.Op {
	case OpEq, OpNe, OpLt, OpLte, OpGt, OpGte:
	default:
		return "", &Error{Path: path + ".op", Message: "must be one of =, !=, <, <=, >, >="}
	}
	if count.Value < 0 {
		return "", &Error{Path: path + ".value", Message: "must not be negative"}
	}
	c.cost += countQuantCost
	return fmt.Sprintf("(SELECT count(%s) FROM %s AND (%s)) %s %s::bigint",
		distinct, from, inner, sqlOp(count.Op), c.arg(count.Value)), nil
}

func (c *compiler) predicate(n *Node, path string, s scope) (string, error) {
	f, ok := fieldsByName[n.Field]
	if !ok {
		return "", &Error{Path: path + ".field", Message: fmt.Sprintf("unknown field %q", n.Field)}
	}
	if f.Scope != s.kind {
		return "", &Error{Path: path + ".field", Message: fmt.Sprintf("%s is a %s field and must be used inside %s", f.Name, f.Scope, scopeHint(f.Scope))}
	}
	p, err := c.parsePred(f, n, path)
	if err != nil {
		return "", err
	}
	if f.Cost > 0 {
		c.cost += f.Cost
	} else {
		c.cost += defaultFieldCost
	}
	c.fields = append(c.fields, f.Name)
	return f.sql(c, s, p), nil
}

func scopeHint(k scopeKind) string {
	switch k {
	case scopePlayer:
		return "any_player or count_players"
	case scopeEncounter:
		return "any_encounter or count_encounters"
	default:
		return "the top level (not inside a player or encounter quantifier)"
	}
}

func sqlOp(op Op) string {
	if op == OpNe {
		return "<>"
	}
	return string(op)
}
