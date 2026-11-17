package instancesearch_test

import (
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/internal/instancesearch"
)

func TestPullPlayerCompile(t *testing.T) {
	t.Parallel()
	valid := `{"any_encounter":{"any_player":{"field":"player.role","op":"=","value":"tank"}}}`
	q := where(t, valid)
	compiled, err := instancesearch.Compile(q, instancesearch.Options{})
	require.NoError(t, err)
	require.Contains(t, compiled.SQL, ".encounter_id = e1.id")
	require.Contains(t, instancesearch.FormatCEL(q.Where), "e.players.exists")
	_, err = instancesearch.CompileExplain(q, uuid.New(), instancesearch.Options{})
	require.NoError(t, err)
	for _, node := range []string{
		`{"field":"player.parse","op":">=","value":90}`,
		`{"field":"player.role","op":"=","value":"tank","on":"trash"}`,
		`{"field":"player.role","op":"=","value":"tank","bosses":["Ragnaros"]}`,
		`{"any_player":{"field":"player.class","op":"=","value":"DRUID"}}`,
		`{"any_encounter":{"field":"encounter.killed","op":"=","value":true}}`,
	} {
		t.Run(node, func(t *testing.T) {
			t.Parallel()
			q := where(t, `{"any_encounter":{"any_player":`+node+`}}`)
			_, err := instancesearch.Compile(q, instancesearch.Options{})
			require.Error(t, err)
			_, err = instancesearch.CompileExplain(q, uuid.New(), instancesearch.Options{})
			require.Error(t, err)
		})
	}
}

func TestSearchPullPlayers(t *testing.T) {
	t.Parallel()
	f := newFixture(t)
	player := func(field, value string) string {
		return fmt.Sprintf(`{"any_player":{"and":[{"field":"player.class","op":"=","value":"DRUID"},{"field":%q,"op":"=","value":%q}]}}`, field, value)
	}
	pull := func(name, child string) string {
		return fmt.Sprintf(`{"any_encounter":{"and":[{"field":"encounter.name","op":"=","value":%q},{"field":"encounter.killed","op":"=","value":true},%s]}}`, name, child)
	}
	cases := []struct {
		name, query string
		want        []uuid.UUID
	}{
		{"TankOnDomo", pull("Majordomo Executus", player("player.role", "tank")), []uuid.UUID{f.mc1}},
		{"TankOnRagNotDomo", pull("Ragnaros", player("player.role", "tank")), []uuid.UUID{f.mc2}},
		{"CatOnRag", pull("Ragnaros", player("player.sub_spec", "Cat")), []uuid.UUID{f.mc1}},
		{"OnAnyStaysOnPull", pull("Ragnaros", `{"any_player":{"field":"player.sub_spec","op":"=","value":"Cat","on":"any"}}`), []uuid.UUID{f.mc1}},
		{"NoWipeMembership", `{"any_encounter":{"and":[{"field":"encounter.outcome","op":"=","value":"wipe"},` + player("player.role", "tank") + `]}}`, nil},
		{"RosterIsNotParticipation", pull("Ragnaros", `{"any_player":{"field":"player.class","op":"=","value":"PRIEST"}}`), nil},
		{"CountPlayers", pull("Ragnaros", `{"count_players":{"op":"=","value":2}}`), []uuid.UUID{f.mc1}},
		{"CountMatchingPlayers", pull("Ragnaros", `{"count_players":{"where":{"field":"player.role","op":"=","value":"tank"},"op":"=","value":1}}`), []uuid.UUID{f.mc2}},
		{"CountEncounters", `{"count_encounters":{"where":` + player("player.role", "dps") + `,"op":"=","value":1}}`, []uuid.UUID{f.mc1}},
		{"NotTank", pull("Ragnaros", `{"not":`+player("player.role", "tank")+`}`), []uuid.UUID{f.mc1}},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			q := where(t, tt.query)
			require.ElementsMatch(t, tt.want, ids(f.search(t, f.tenantA, q)))
			for _, id := range []uuid.UUID{f.mc1, f.mc2} {
				ex := f.explain(t, f.tenantA, tt.query, id)
				expected := false
				for _, want := range tt.want {
					expected = expected || id == want
				}
				require.Equal(t, expected, ex.Matched)
			}
		})
	}
	t.Run("NestedWitness", func(t *testing.T) {
		t.Parallel()
		ex := f.explain(t, f.tenantA, pull("Majordomo Executus", player("player.role", "tank")), f.mc1)
		require.True(t, ex.Matched)
		require.Len(t, ex.Evidence.Witnesses, 1)
		players := ex.Evidence.Witnesses[0].Evidence.Children[2]
		require.Len(t, players.Witnesses, 1)
		require.Equal(t, "Bearcat", players.Witnesses[0].Name)
		require.Len(t, players.Witnesses[0].Evidence.Children[1].Rows, 1)
		require.Equal(t, "Majordomo Executus", players.Witnesses[0].Evidence.Children[1].Rows[0].Name)
	})
	t.Run("TenantIsolation", func(t *testing.T) {
		t.Parallel()
		require.Empty(t, ids(f.search(t, f.tenantB, where(t, pull("Ragnaros", player("player.role", "tank"))))))
	})
}
