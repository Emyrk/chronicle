package instancesearch_test

import (
	"encoding/json"
	"errors"
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/internal/instancesearch"
)

var update = flag.Bool("update", false, "regenerate instance search golden files")

type example struct {
	Name string
	// Title and Category are set on examples shown in the search UI's
	// Examples menu (see TestUIExamples).
	Title       string               `json:"title,omitempty"`
	Category    string               `json:"category,omitempty"`
	Description string               `json:"description"`
	Query       instancesearch.Query `json:"query"`
}

// uiExampleCategories is the menu order; every titled example must use one.
var uiExampleCategories = []string{"Run", "Bosses", "Speed", "Roster", "Parses", "Logs", "Combined"}

// TestUIExamples writes the titled examples to the frontend's Examples
// menu. They are the same queries TestSearch runs against Postgres, so the
// menu can only offer queries that compile and run.
func TestUIExamples(t *testing.T) {
	t.Parallel()

	type uiExample struct {
		ID          string               `json:"id"`
		Title       string               `json:"title"`
		Category    string               `json:"category"`
		Description string               `json:"description"`
		Where       *instancesearch.Node `json:"where"`
		// Cost is the compiled cost; the UI's live cost estimate is tested
		// against it.
		Cost int `json:"cost"`
	}
	var out []uiExample
	for _, cat := range uiExampleCategories {
		for _, ex := range loadExamples(t) {
			if ex.Title == "" || ex.Category != cat {
				continue
			}
			compiled, err := instancesearch.Compile(instancesearch.Query{Where: ex.Query.Where}, instancesearch.Options{})
			require.NoError(t, err, ex.Name)
			out = append(out, uiExample{ID: ex.Name, Title: ex.Title, Category: ex.Category, Description: ex.Description, Where: ex.Query.Where, Cost: compiled.Cost})
		}
	}
	for _, ex := range loadExamples(t) {
		if ex.Title != "" {
			require.Contains(t, uiExampleCategories, ex.Category, "%s: unknown category", ex.Name)
		}
	}
	require.NotEmpty(t, out)

	path := filepath.Join("..", "..", "frontend", "chronicle", "src", "pages", "InstanceSearch", "generated", "searchExamples.json")
	got, err := json.MarshalIndent(out, "", "  ")
	require.NoError(t, err)
	got = append(got, '\n')
	if *update {
		require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o750))
		require.NoError(t, os.WriteFile(path, got, 0o600))
		return
	}
	want, err := os.ReadFile(path)
	require.NoError(t, err)
	require.Equal(t, string(want), string(got), "run go test ./internal/instancesearch -run TestUIExamples -update")
}

func loadExamples(t *testing.T) []example {
	t.Helper()
	paths, err := filepath.Glob("testdata/examples/*.json")
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(paths), 10, "keep at least 10 example queries")

	examples := make([]example, 0, len(paths))
	for _, path := range paths {
		raw, err := os.ReadFile(path)
		require.NoError(t, err)
		dec := json.NewDecoder(strings.NewReader(string(raw)))
		dec.DisallowUnknownFields()
		var ex example
		require.NoError(t, dec.Decode(&ex), path)
		ex.Name = strings.TrimSuffix(filepath.Base(path), ".json")
		examples = append(examples, ex)
	}
	return examples
}

// TestExamplesGolden pins the SQL each example compiles to. Run with -update
// after changing the compiler and review the diff.
func TestExamplesGolden(t *testing.T) {
	t.Parallel()

	for _, ex := range loadExamples(t) {
		t.Run(ex.Name, func(t *testing.T) {
			t.Parallel()
			compiled, err := instancesearch.Compile(ex.Query, instancesearch.Options{})
			require.NoError(t, err)

			args, err := json.MarshalIndent(compiled.Args, "", "  ")
			require.NoError(t, err)
			cel := "--   " + strings.ReplaceAll(instancesearch.FormatCEL(ex.Query.Where), "\n", "\n--   ")
			got := "-- " + ex.Description + "\n--\n-- CEL:\n" + cel + "\n\n" + compiled.SQL + "\n\n-- args:\n" + string(args) + "\n"

			path := filepath.Join("testdata", "examples", ex.Name+".golden.sql")
			if *update {
				require.NoError(t, os.WriteFile(path, []byte(got), 0o600))
				return
			}
			want, err := os.ReadFile(path)
			require.NoError(t, err, "missing golden file; run go test ./internal/instancesearch -run TestExamplesGolden -update")
			require.Equal(t, string(want), got)
		})
	}
}

// TestFieldReference keeps the agent skill's field table in sync with the
// registry.
func TestFieldReference(t *testing.T) {
	t.Parallel()

	path := filepath.Join("..", "..", ".agents", "skills", "instance-search", "fields.md")
	got := instancesearch.FieldReference()
	if *update {
		require.NoError(t, os.WriteFile(path, []byte(got), 0o600))
		return
	}
	want, err := os.ReadFile(path)
	require.NoError(t, err)
	require.Equal(t, string(want), got, "run go test ./internal/instancesearch -run TestFieldReference -update")
}

func TestDescribe(t *testing.T) {
	t.Parallel()

	d := instancesearch.Describe()
	require.NotEmpty(t, d.Fields)
	byName := map[string]chroniclesdk.InstanceSearchField{}
	for _, f := range d.Fields {
		byName[f.Name] = f
	}
	name := byName["instance.name"]
	require.True(t, name.Anonymous)
	require.Equal(t, chroniclesdk.InstanceSearchFieldScopeInstance, name.Scope)
	require.Contains(t, name.Ops, instancesearch.OpContains)

	role := byName["player.role"]
	require.False(t, role.Anonymous)
	require.Equal(t, chroniclesdk.InstanceSearchFieldScopePlayer, role.Scope)
	require.Equal(t, []string{"dps", "heal", "tank"}, role.Enum)
	require.True(t, role.On)
	require.True(t, role.Bosses)

	require.Len(t, d.Sorts, 14)
	sorts := map[chroniclesdk.InstanceSearchSortField]chroniclesdk.InstanceSearchSortOption{}
	for _, sort := range d.Sorts {
		sorts[sort.Field] = sort
	}
	require.Equal(t, chroniclesdk.InstanceSearchSortTierFree, sorts[instancesearch.SortName].MinimumTier)
	require.Equal(t, chroniclesdk.InstanceSearchSortTierHonored, sorts[instancesearch.SortPlayerCount].MinimumTier)
	require.Equal(t, chroniclesdk.InstanceSearchSortTierRevered, sorts[instancesearch.SortDeaths].MinimumTier)
	require.Equal(t, chroniclesdk.InstanceSearchSortTierRevered, sorts[instancesearch.SortWipes].MinimumTier)
	require.Equal(t, chroniclesdk.InstanceSearchSortTierHonored, sorts[instancesearch.SortIdleTime].MinimumTier)
	require.Equal(t, chroniclesdk.InstanceSearchSortTierHonored, sorts[instancesearch.SortBossTime].MinimumTier)
	require.True(t, sorts[instancesearch.SortKillTime].Boss)

	require.Equal(t, chroniclesdk.InstanceSearchFieldScopeEncounter, byName["encounter.outcome"].Scope)
}

// TestDescribeFixture keeps the frontend's Storybook/test fixture of
// GET /search/fields in sync with the registry.
func TestDescribeFixture(t *testing.T) {
	t.Parallel()

	path := filepath.Join("..", "..", "frontend", "chronicle", "src", "pages", "InstanceSearch", "fixtures", "searchFields.json")
	got, err := json.MarshalIndent(instancesearch.Describe(), "", "  ")
	require.NoError(t, err)
	got = append(got, '\n')
	if *update {
		require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o750))
		require.NoError(t, os.WriteFile(path, got, 0o600))
		return
	}
	want, err := os.ReadFile(path)
	require.NoError(t, err)
	require.Equal(t, string(want), string(got), "run go test ./internal/instancesearch -run TestDescribeFixture -update")
}

func TestCompileSort(t *testing.T) {
	t.Parallel()

	for _, option := range instancesearch.DescribeSorts() {
		t.Run(string(option.Field), func(t *testing.T) {
			t.Parallel()
			sort := &instancesearch.Sort{Field: option.Field}
			if option.Boss {
				sort.Boss = "Ragnaros"
			}
			compiled, err := instancesearch.Compile(instancesearch.Query{Sort: sort}, instancesearch.Options{})
			require.NoError(t, err)
			require.Equal(t, option.DefaultDirection, compiled.Sort.Direction)
			require.Equal(t, 1+option.Cost, compiled.Cost)
			require.Contains(t, compiled.SQL, "AS sort_value")
		})
	}

}

func TestCompileSortErrors(t *testing.T) {
	t.Parallel()

	value := "not-a-time"
	id := uuid.New()
	for _, tc := range []struct {
		name string
		q    instancesearch.Query
		want string
	}{
		{name: "UnknownField", q: instancesearch.Query{Sort: &instancesearch.Sort{Field: "instance.secret"}}, want: "sort.field"},
		{name: "BadDirection", q: instancesearch.Query{Sort: &instancesearch.Sort{Field: instancesearch.SortStartedAt, Direction: "sideways"}}, want: "sort.direction"},
		{name: "ScopeOnDate", q: instancesearch.Query{Sort: &instancesearch.Sort{Field: instancesearch.SortStartedAt, ParseScope: instancesearch.ParseScopeRealm}}, want: "sort.parse_scope"},
		{name: "KillTimeNeedsBoss", q: instancesearch.Query{Sort: &instancesearch.Sort{Field: instancesearch.SortKillTime}}, want: "sort.boss"},
		{name: "BossOnDate", q: instancesearch.Query{Sort: &instancesearch.Sort{Field: instancesearch.SortStartedAt, Boss: "Ragnaros"}}, want: "sort.boss"},
		{name: "CursorSortMismatch", q: instancesearch.Query{Sort: &instancesearch.Sort{Field: instancesearch.SortClearTime}, Cursor: &instancesearch.Cursor{ID: id, Sort: instancesearch.Sort{Field: instancesearch.SortStartedAt}}}, want: "cursor.sort"},
		{name: "BadCursorValue", q: instancesearch.Query{Cursor: &instancesearch.Cursor{Value: &value, ID: id, Sort: instancesearch.Sort{Field: instancesearch.SortStartedAt}}}, want: "cursor.value"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := instancesearch.Compile(tc.q, instancesearch.Options{})
			require.ErrorContains(t, err, tc.want)
		})
	}
}

func TestCompileEnumsAreCanonicalized(t *testing.T) {
	t.Parallel()

	compiled, err := instancesearch.Compile(where(t, `{"any_player": {"field": "player.class", "op": "in", "value": ["priest", "Mage"]}}`), instancesearch.Options{})
	require.NoError(t, err)
	require.Contains(t, compiled.Args, []string{"PRIEST", "MAGE"})
}

func TestCompileUserValuesAreBound(t *testing.T) {
	t.Parallel()

	evil := `x'); DROP TABLE log_instances; --`
	q := instancesearch.Query{Where: &instancesearch.Node{
		AnyPlayer: &instancesearch.Node{
			Field: "player.name", Op: instancesearch.OpEq, Value: mustJSON(t, evil),
		},
	}}
	compiled, err := instancesearch.Compile(q, instancesearch.Options{})
	require.NoError(t, err)
	require.NotContains(t, compiled.SQL, "DROP TABLE")
	require.Contains(t, compiled.Args, evil)
}

func TestCompileErrors(t *testing.T) {
	t.Parallel()

	pred := func(field string, op instancesearch.Op, value any) *instancesearch.Node {
		raw, _ := json.Marshal(value)
		return &instancesearch.Node{Field: field, Op: op, Value: json.RawMessage(raw)}
	}
	deep := pred("instance.name", instancesearch.OpEq, "x")
	for range 10 {
		deep = &instancesearch.Node{Not: deep}
	}
	wide := make([]instancesearch.Node, 100)
	for i := range wide {
		wide[i] = *pred("instance.name", instancesearch.OpEq, "x")
	}

	cases := []struct {
		name  string
		query instancesearch.Query
		want  string
	}{
		{"UnknownField", instancesearch.Query{Where: pred("instance.secret", instancesearch.OpEq, 1)}, `unknown field "instance.secret"`},
		{"RemovedTimeParse", instancesearch.Query{Where: pred("instance.clear_parse", instancesearch.OpGt, 90)}, `unknown field "instance.clear_parse"`},
		{"RemovedPlayerParse", instancesearch.Query{Where: &instancesearch.Node{AnyPlayer: pred("player.parse", instancesearch.OpGt, 90)}}, `unknown field "player.parse"`},
		{"PlayerFieldAtTop", instancesearch.Query{Where: pred("player.class", instancesearch.OpEq, "MAGE")}, "must be used inside any_player or count_players"},
		{"InstanceFieldInPlayer", instancesearch.Query{Where: &instancesearch.Node{AnyPlayer: pred("instance.name", instancesearch.OpEq, "x")}}, "must be used inside the top level"},
		{"NestedQuantifier", instancesearch.Query{Where: &instancesearch.Node{AnyPlayer: &instancesearch.Node{AnyEncounter: pred("encounter.boss", instancesearch.OpEq, true)}}}, "only be used at the instance level"},
		{"BadOp", instancesearch.Query{Where: pred("instance.name", instancesearch.OpGt, "x")}, "supports =, !=, in, not_in"},
		{"BadEnum", instancesearch.Query{Where: &instancesearch.Node{AnyPlayer: pred("player.class", instancesearch.OpEq, "BARD")}}, "must be one of"},
		{"WrongType", instancesearch.Query{Where: pred("instance.max_players", instancesearch.OpEq, "forty")}, "must be an integer"},
		{"EmptyIn", instancesearch.Query{Where: pred("instance.name", instancesearch.OpIn, []string{})}, "must have 1 to"},
		{"BetweenOneValue", instancesearch.Query{Where: pred("instance.max_players", instancesearch.OpBetween, []int{10})}, "must be [low, high]"},
		{"BetweenScalar", instancesearch.Query{Where: pred("instance.max_players", instancesearch.OpBetween, 10)}, "must be [low, high]"},
		{"BetweenBackwards", instancesearch.Query{Where: pred("instance.max_players", instancesearch.OpBetween, []int{40, 10})}, "low must not be above high"},
		{"BetweenBackwardsTime", instancesearch.Query{Where: pred("instance.started_at", instancesearch.OpBetween, []string{"2026-11-01T00:00:00Z", "2026-10-01T00:00:00Z"})}, "low must not be above high"},
		{"BetweenBadTime", instancesearch.Query{Where: pred("instance.started_at", instancesearch.OpBetween, []string{"yesterday", "2026-10-01T00:00:00Z"})}, "value[0]: must be an RFC 3339"},
		{"BetweenOnText", instancesearch.Query{Where: pred("instance.name", instancesearch.OpBetween, []string{"a", "b"})}, "supports =, !=, in, not_in"},
		{"EachWithoutBosses", instancesearch.Query{Where: &instancesearch.Node{Field: "instance.kill_time_ms", Op: instancesearch.OpLt, Value: json.RawMessage("1"), Match: instancesearch.MatchEach}}, "each requires a list of bosses"},
		{"BossesNotAllowed", instancesearch.Query{Where: &instancesearch.Node{Field: "instance.name", Op: instancesearch.OpEq, Value: json.RawMessage(`"x"`), Bosses: []string{"Rag"}}}, "does not take bosses"},
		{"TwoKinds", instancesearch.Query{Where: &instancesearch.Node{Field: "instance.name", Op: instancesearch.OpEq, Value: json.RawMessage(`"x"`), Not: pred("instance.name", instancesearch.OpEq, "y")}}, "exactly one of"},
		{"EmptyAnd", instancesearch.Query{Where: &instancesearch.Node{And: []instancesearch.Node{}}}, "at least one child"},
		{"TooDeep", instancesearch.Query{Where: deep}, "nested deeper than"},
		{"TooWide", instancesearch.Query{Where: &instancesearch.Node{Or: wide}}, "more than 64 nodes"},
		{"BadLimit", instancesearch.Query{Limit: 1000}, "limit: must be between"},
		{"ContainsOnNumber", instancesearch.Query{Where: &instancesearch.Node{Field: "instance.max_players", Op: instancesearch.OpContains, Value: json.RawMessage("4")}}, "supports =, !=, <, <=, >, >="},
		{"ContainsOnEnum", instancesearch.Query{Where: &instancesearch.Node{Field: "instance.category", Op: instancesearch.OpContains, Value: json.RawMessage(`"ra"`)}}, "supports =, !=, in, not_in"},
		{"ContainsEmpty", instancesearch.Query{Where: &instancesearch.Node{Field: "instance.name", Op: instancesearch.OpContains, Value: json.RawMessage(`"  "`)}}, "must not be empty"},
		{"BadCountOp", instancesearch.Query{Where: &instancesearch.Node{CountPlayers: &instancesearch.Count{Op: instancesearch.OpIn, Value: 1}}}, "must be one of =, !=, <, <=, >, >="},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := instancesearch.Compile(tc.query, instancesearch.Options{})
			require.Error(t, err)
			var serr *instancesearch.Error
			require.True(t, errors.As(err, &serr), "want *instancesearch.Error, got %T", err)
			require.Contains(t, err.Error(), tc.want)
		})
	}
}

func TestCost(t *testing.T) {
	t.Parallel()

	cost := func(raw string) int {
		var n instancesearch.Node
		require.NoError(t, json.Unmarshal([]byte(raw), &n))
		compiled, err := instancesearch.Compile(instancesearch.Query{Where: &n}, instancesearch.Options{})
		require.NoError(t, err)
		return compiled.Cost
	}
	empty, err := instancesearch.Compile(instancesearch.Query{}, instancesearch.Options{})
	require.NoError(t, err)
	require.Equal(t, 1, empty.Cost)
	require.Empty(t, empty.Fields)

	cheap := cost(`{"field": "instance.name", "op": "=", "value": "Molten Core"}`)
	heavy := cost(`{"field": "instance.idle_time_ms", "op": "<", "value": 1}`)
	player := cost(`{"any_player": {"field": "player.class", "op": "=", "value": "PRIEST"}}`)
	require.Equal(t, 3, cheap)
	require.Equal(t, 21, heavy)
	require.Equal(t, 7, player)
	require.Equal(t, 7, cost(`{"or": [{"field": "instance.name", "op": "=", "value": "a"}, {"field": "instance.name", "op": "=", "value": "b"}]}`))
	require.Equal(t, 4, cost(`{"not": {"field": "instance.name", "op": "=", "value": "a"}}`))
	require.Equal(t, 13, cost(`{"count_players": {"where": {"field": "player.class", "op": "=", "value": "MAGE"}, "op": ">", "value": 1}}`))

	compiled, err := instancesearch.Compile(where(t, `{"and": [
		{"field": "instance.name", "op": "=", "value": "x"},
		{"count_players": {"where": {"field": "player.class", "op": "=", "value": "MAGE"}, "op": ">", "value": 1}}]}`), instancesearch.Options{})
	require.NoError(t, err)
	require.Equal(t, []string{"instance.name", "player.class"}, compiled.Fields)
}

func TestCheckAnonymous(t *testing.T) {
	t.Parallel()

	allowed := []string{
		`{"field": "instance.name", "op": "=", "value": "Molten Core"}`,
		`{"and": [{"field": "instance.realm", "op": "=", "value": "Nordanaar"}, {"field": "instance.started_at", "op": ">=", "value": "2026-10-01T00:00:00Z"}]}`,
	}
	for _, raw := range allowed {
		require.NoError(t, instancesearch.CheckAnonymous(where(t, raw)), raw)
	}
	require.NoError(t, instancesearch.CheckAnonymous(instancesearch.Query{}))

	denied := []string{
		`{"any_player": {"field": "player.class", "op": "=", "value": "MAGE"}}`,
		`{"or": [{"field": "instance.name", "op": "=", "value": "a"}, {"field": "instance.name", "op": "=", "value": "b"}]}`,
		`{"not": {"field": "instance.name", "op": "=", "value": "a"}}`,
		`{"and": [{"field": "instance.name", "op": "=", "value": "a"}, {"and": [{"field": "instance.name", "op": "=", "value": "b"}]}]}`,
		`{"and": [` + strings.Repeat(`{"field": "instance.name", "op": "=", "value": "a"},`, 6) + `{"field": "instance.name", "op": "=", "value": "a"}]}`,
	}
	for _, raw := range denied {
		require.ErrorIs(t, instancesearch.CheckAnonymous(where(t, raw)), instancesearch.ErrLoginRequired, raw)
	}
	require.ErrorIs(t, instancesearch.CheckAnonymous(instancesearch.Query{Limit: 100}), instancesearch.ErrLoginRequired)
}

func mustJSON(t *testing.T, v any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return raw
}
