package instancesearch

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/xerrors"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

type (
	Evidence     = chroniclesdk.InstanceSearchEvidence
	EvidenceRow  = chroniclesdk.InstanceSearchEvidenceRow
	Witness      = chroniclesdk.InstanceSearchWitness
	Explanation  = chroniclesdk.InstanceSearchExplainResponse
	EvidenceKind = chroniclesdk.InstanceSearchEvidenceKind
)

// ErrNotFound means the instance does not exist or the caller cannot see it.
var ErrNotFound = errors.New("instance not found")

// maxWitnesses is how many matching players or pulls a quantifier shows.
const maxWitnesses = 5

// CompiledExplain is a ready-to-run explain query for one instance.
type CompiledExplain struct {
	SQL  string
	Args []any
	// Cost is the rate-limit cost: a fraction of the search's, since explain
	// only looks at one run through instance-keyed indexes.
	Cost  int
	where *Node
}

// ExplainCost is what explaining one run of a search costs, given the
// search's cost.
func ExplainCost(searchCost int) int {
	return 1 + searchCost/4
}

// CompileExplain compiles the evidence query for q (only Where is used) on
// one instance. It validates q exactly like Compile.
//
// The evidence SQL walks the same tree. Each predicate reports whether it
// holds plus the run's actual value (per boss or fight for per-fight
// fields); each quantifier reports how many players or pulls satisfy it and
// up to five of them with their own evidence. and / or / not are combined in
// Go (see resolve). The query runs in the same visibility frame as Search, so
// RLS and visibility rules are identical.
func CompileExplain(q Query, instanceID uuid.UUID, opts Options) (CompiledExplain, error) {
	compiled, err := Compile(Query{Where: q.Where}, opts)
	if err != nil {
		return CompiledExplain{}, err
	}
	opts = opts.withDefaults()
	// The tree is validated; explain revisits subtrees, so don't count nodes.
	opts.MaxNodes = math.MaxInt
	c := &compiler{opts: opts}

	evidence := "NULL::jsonb"
	if q.Where != nil {
		evidence, err = c.explainNode(q.Where, "where", scope{kind: scopeInstance}, 1)
		if err != nil {
			return CompiledExplain{}, err
		}
	}
	sql := "SELECT " + evidence + "\n" + frameFrom + "\n    AND li.id = " + c.arg(instanceID.String()) + "::uuid"
	return CompiledExplain{SQL: sql, Args: c.args, Cost: ExplainCost(compiled.Cost), where: q.Where}, nil
}

// CompileExplainForContext is CompileExplain with the tenant taken from ctx.
func CompileExplainForContext(ctx context.Context, q Query, instanceID uuid.UUID, opts Options) (CompiledExplain, error) {
	return CompileExplain(q, instanceID, opts)
}

func (c *compiler) explainNode(n *Node, path string, s scope, depth int) (string, error) {
	switch {
	case n.And != nil:
		return c.explainGroup(chroniclesdk.InstanceSearchEvidenceAnd, n.And, path+".and", s, depth)
	case n.Or != nil:
		return c.explainGroup(chroniclesdk.InstanceSearchEvidenceOr, n.Or, path+".or", s, depth)
	case n.Not != nil:
		inner, err := c.explainNode(n.Not, path+".not", s, depth+1)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("jsonb_build_object('kind', 'not', 'children', jsonb_build_array(%s))", inner), nil
	case n.AnyPlayer != nil:
		return c.explainQuantifier(n.AnyPlayer, nil, chroniclesdk.InstanceSearchEvidenceAnyPlayer, path+".any_player", scopePlayer, depth)
	case n.CountPlayers != nil:
		return c.explainQuantifier(n.CountPlayers.Where, n.CountPlayers, chroniclesdk.InstanceSearchEvidenceCountPlayers, path+".count_players", scopePlayer, depth)
	case n.AnyEncounter != nil:
		return c.explainQuantifier(n.AnyEncounter, nil, chroniclesdk.InstanceSearchEvidenceAnyEncounter, path+".any_encounter", scopeEncounter, depth)
	case n.CountEncounters != nil:
		return c.explainQuantifier(n.CountEncounters.Where, n.CountEncounters, chroniclesdk.InstanceSearchEvidenceCountEncounters, path+".count_encounters", scopeEncounter, depth)
	default:
		return c.explainPredicate(n, path, s)
	}
}

func (c *compiler) explainGroup(kind EvidenceKind, children []Node, path string, s scope, depth int) (string, error) {
	parts := make([]string, len(children))
	for i := range children {
		part, err := c.explainNode(&children[i], fmt.Sprintf("%s[%d]", path, i), s, depth+1)
		if err != nil {
			return "", err
		}
		parts[i] = part
	}
	return fmt.Sprintf("jsonb_build_object('kind', '%s', 'children', jsonb_build_array(%s))", kind, strings.Join(parts, ", ")), nil
}

// explainPredicate reports whether the predicate holds and the run's value.
// Per-fight fields list each fight's value (limited to the requested
// bosses) with whether that fight satisfies the comparison.
func (c *compiler) explainPredicate(n *Node, path string, s scope) (string, error) {
	f := fieldsByName[n.Field]
	p, err := c.parsePred(f, n, path)
	if err != nil {
		return "", err
	}
	// f.Name comes from the registry, never from user input.
	ok := fmt.Sprintf("to_jsonb((%s))", f.sql(c, s, p))
	v := f.value(c, s, p)
	if v.From == "" {
		return fmt.Sprintf("jsonb_build_object('kind', 'field', 'field', '%s', 'ok', %s, 'value', to_jsonb(%s))", f.Name, ok, v.Expr), nil
	}
	filter := ""
	if len(p.bosses) > 0 {
		filter = fmt.Sprintf(" AND lower(%s) = ANY(%s)", v.Name, lowerArray(c.arg(p.bosses)))
	}
	rows := fmt.Sprintf("(SELECT COALESCE(jsonb_agg(jsonb_build_object('name', %[1]s, 'value', to_jsonb(%[2]s), 'ok', COALESCE((%[3]s), false)) ORDER BY %[1]s), '[]'::jsonb) FROM %[4]s%[5]s)",
		v.Name, v.Expr, c.cmp(v.Expr, p), v.From, filter)
	return fmt.Sprintf("jsonb_build_object('kind', 'field', 'field', '%s', 'ok', %s, 'rows', %s)", f.Name, ok, rows), nil
}

// explainQuantifier reports how many players or pulls satisfy the subtree,
// whether that satisfies the quantifier, and up to maxWitnesses of them,
// each with evidence for the subtree.
//
// The witness subquery reuses the quantifier's alias for both the base table
// and the derived rows, so the subtree's condition (inside) and its evidence
// (outside) are compiled once against the same alias.
func (c *compiler) explainQuantifier(where *Node, count *Count, kind EvidenceKind, path string, qk scopeKind, depth int) (string, error) {
	var alias, from, distinct, pick, witness, order string
	switch qk {
	case scopePlayer:
		alias = c.alias("w")
		from = fmt.Sprintf("log_instance_players %[1]s WHERE %[1]s.instance_id = li.id", alias)
		distinct = "DISTINCT " + alias + ".unit_guid"
		pick = fmt.Sprintf("SELECT DISTINCT ON (%[1]s.unit_guid) %[1]s.* FROM %[2]s AND (%%s) ORDER BY %[1]s.unit_guid LIMIT %[3]d", alias, from, maxWitnesses)
		witness = fmt.Sprintf("'name', %[1]s.name, 'guid', %[1]s.unit_guid::text, 'class', %[1]s.class::text", alias)
		order = alias + ".name"
	default:
		alias = c.alias("x")
		from = fmt.Sprintf("log_instance_encounters %[1]s WHERE %[1]s.instance_id = li.id", alias)
		distinct = alias + ".id"
		pick = fmt.Sprintf("SELECT %[1]s.* FROM %[2]s AND (%%s) ORDER BY %[1]s.start_time LIMIT %[3]d", alias, from, maxWitnesses)
		witness = fmt.Sprintf("'name', %[1]s.name, 'encounter_id', %[1]s.id, 'outcome', %[1]s.kill_type::text, 'duration_ms', %[2]s", alias, durationMS(alias))
		order = alias + ".start_time"
	}

	inner, innerEvidence := "TRUE", "NULL::jsonb"
	if where != nil {
		sub := scope{kind: qk, alias: alias}
		var err error
		if inner, err = c.node(where, path+".where", sub, depth+1); err != nil {
			return "", err
		}
		if innerEvidence, err = c.explainNode(where, path+".where", sub, depth+1); err != nil {
			return "", err
		}
	}

	// Placeholders may repeat, so the count's SQL is reused verbatim.
	countSQL := fmt.Sprintf("(SELECT count(%s) FROM %s AND (%s))", distinct, from, inner)
	ok := countSQL + " > 0"
	if count != nil {
		ok = fmt.Sprintf("%s %s %s::bigint", countSQL, sqlOp(count.Op), c.arg(count.Value))
	}
	witnesses := fmt.Sprintf("(SELECT COALESCE(jsonb_agg(jsonb_build_object(%s, 'evidence', %s) ORDER BY %s), '[]'::jsonb) FROM (%s) %s)",
		witness, innerEvidence, order, fmt.Sprintf(pick, inner), alias)
	return fmt.Sprintf("jsonb_build_object('kind', '%s', 'ok', to_jsonb(%s), 'count', %s, 'witnesses', %s)", kind, ok, countSQL, witnesses), nil
}

// Explain runs a compiled explain query. It returns ErrNotFound when the
// instance is missing or not visible to the caller's tenant, and refuses
// admin-bypass contexts like Search.
func Explain(ctx context.Context, db database.Store, e CompiledExplain, opts SearchOptions) (Explanation, error) {
	if servicetenant.IsBypass(ctx) {
		return Explanation{}, xerrors.New("instance search must not run with tenant RLS bypassed")
	}
	timeout := opts.StatementTimeout
	if timeout <= 0 {
		timeout = DefaultStatementTimeout
	}

	var (
		raw   []byte
		found bool
	)
	err := db.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.Exec(ctx, "SELECT set_config('statement_timeout', $1::text, true)", fmt.Sprint(timeout.Milliseconds())); err != nil {
			return xerrors.Errorf("set statement timeout: %w", err)
		}
		rows, err := tx.Query(ctx, e.SQL, e.Args...)
		if err != nil {
			return xerrors.Errorf("query: %w", err)
		}
		defer rows.Close()
		if rows.Next() {
			found = true
			if err := rows.Scan(&raw); err != nil {
				return xerrors.Errorf("scan: %w", err)
			}
		}
		return rows.Err()
	}, &pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "57014" { // query_canceled
			return Explanation{}, ErrTimeout
		}
		return Explanation{}, xerrors.Errorf("instance search explain: %w", err)
	}
	if !found {
		return Explanation{}, ErrNotFound
	}
	if e.where == nil {
		return Explanation{Matched: true}, nil
	}

	var ev Evidence
	if err := json.Unmarshal(raw, &ev); err != nil {
		return Explanation{}, xerrors.Errorf("decode evidence: %w", err)
	}
	resolve(&ev)
	return Explanation{Matched: ev.OK != nil && *ev.OK, Evidence: &ev}, nil
}

// resolve fills OK for and / or / not with SQL's three-valued logic, so the
// result agrees with the search: unknown (a missing value) never matches,
// even negated.
func resolve(e *Evidence) {
	for i := range e.Children {
		resolve(&e.Children[i])
	}
	for i := range e.Witnesses {
		if e.Witnesses[i].Evidence != nil {
			resolve(e.Witnesses[i].Evidence)
		}
	}
	switch e.Kind {
	case chroniclesdk.InstanceSearchEvidenceAnd:
		e.OK = combine(e.Children, false)
	case chroniclesdk.InstanceSearchEvidenceOr:
		e.OK = combine(e.Children, true)
	case chroniclesdk.InstanceSearchEvidenceNot:
		if len(e.Children) == 1 && e.Children[0].OK != nil {
			e.OK = boolPtr(!*e.Children[0].OK)
		} else {
			e.OK = nil
		}
	}
}

// combine is AND (decisive = false) or OR (decisive = true): any child equal
// to decisive decides; otherwise any unknown child makes the result unknown.
func combine(children []Evidence, decisive bool) *bool {
	unknown := false
	for _, ch := range children {
		switch {
		case ch.OK == nil:
			unknown = true
		case *ch.OK == decisive:
			return boolPtr(decisive)
		}
	}
	if unknown {
		return nil
	}
	return boolPtr(!decisive)
}

func boolPtr(b bool) *bool { return &b }
