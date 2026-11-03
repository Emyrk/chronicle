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

	"github.com/Emyrk/chronicle/internal/instancesearch"
)

var update = flag.Bool("update", false, "regenerate instance search golden files")

type example struct {
	Name        string
	Description string                `json:"description"`
	Query       instancesearch.Query `json:"query"`
}

func loadExamples(t *testing.T) []example {
	t.Helper()
	paths, err := filepath.Glob("testdata/examples/*.json")
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(paths), 20, "keep at least 20 example queries")

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

// goldenTenant is fixed so golden args are stable.
var goldenTenant = uuid.MustParse("11111111-1111-1111-1111-111111111111")

// TestExamplesGolden pins the SQL each example compiles to. Run with -update
// after changing the compiler and review the diff.
func TestExamplesGolden(t *testing.T) {
	t.Parallel()

	for _, ex := range loadExamples(t) {
		t.Run(ex.Name, func(t *testing.T) {
			t.Parallel()
			compiled, err := instancesearch.Compile(ex.Query, instancesearch.Options{TenantID: goldenTenant})
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
		return &instancesearch.Node{Field: field, Op: op, Value: raw}
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
		{"PlayerFieldAtTop", instancesearch.Query{Where: pred("player.class", instancesearch.OpEq, "MAGE")}, "must be used inside any_player or count_players"},
		{"InstanceFieldInPlayer", instancesearch.Query{Where: &instancesearch.Node{AnyPlayer: pred("instance.name", instancesearch.OpEq, "x")}}, "must be used inside the top level"},
		{"NestedQuantifier", instancesearch.Query{Where: &instancesearch.Node{AnyPlayer: &instancesearch.Node{AnyEncounter: pred("encounter.boss", instancesearch.OpEq, true)}}}, "only be used at the instance level"},
		{"BadOp", instancesearch.Query{Where: pred("instance.name", instancesearch.OpGt, "x")}, "supports =, !=, in, not_in"},
		{"BadEnum", instancesearch.Query{Where: &instancesearch.Node{AnyPlayer: pred("player.class", instancesearch.OpEq, "BARD")}}, "must be one of"},
		{"WrongType", instancesearch.Query{Where: pred("instance.max_players", instancesearch.OpEq, "forty")}, "must be an integer"},
		{"EmptyIn", instancesearch.Query{Where: pred("instance.name", instancesearch.OpIn, []string{})}, "must have 1 to"},
		{"EachWithoutBosses", instancesearch.Query{Where: &instancesearch.Node{Field: "instance.kill_time_ms", Op: instancesearch.OpLt, Value: json.RawMessage("1"), Match: instancesearch.MatchEach}}, "each requires a list of bosses"},
		{"BossesNotAllowed", instancesearch.Query{Where: &instancesearch.Node{Field: "instance.name", Op: instancesearch.OpEq, Value: json.RawMessage(`"x"`), Bosses: []string{"Rag"}}}, "does not take bosses"},
		{"BadParseScope", instancesearch.Query{Where: &instancesearch.Node{Field: "instance.clear_parse", Op: instancesearch.OpGt, Value: json.RawMessage("1"), ParseScope: "world"}}, "must be server, realm or guild"},
		{"TwoKinds", instancesearch.Query{Where: &instancesearch.Node{Field: "instance.name", Op: instancesearch.OpEq, Value: json.RawMessage(`"x"`), Not: pred("instance.name", instancesearch.OpEq, "y")}}, "exactly one of"},
		{"EmptyAnd", instancesearch.Query{Where: &instancesearch.Node{And: []instancesearch.Node{}}}, "at least one child"},
		{"TooDeep", instancesearch.Query{Where: deep}, "nested deeper than"},
		{"TooWide", instancesearch.Query{Where: &instancesearch.Node{Or: wide}}, "more than 64 nodes"},
		{"BadLimit", instancesearch.Query{Limit: 1000}, "limit: must be between"},
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

func mustJSON(t *testing.T, v any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return raw
}
