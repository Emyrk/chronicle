package servicerankings

import (
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestParseHubSummaryInput(t *testing.T) {
	t.Parallel()
	realm := uuid.New()
	for _, tt := range []struct {
		name, query  string
		valid, exact bool
		size         int16
		realms       int
	}{
		{"landing", "", true, false, 0, 0},
		{"statistics landing", "tab=statistics", true, false, 0, 0},
		{"invalid tab", "tab=other", false, false, 0, 0},
		{"tab on selected instance", "instance_name=Molten+Core&tab=statistics", false, false, 0, 0},
		{"turtle empty difficulty size zero", "instance_name=Molten+Core&difficulty_name=&max_players=0", true, true, 0, 0},
		{"selected boss and realms", "instance_name=Molten+Core&encounter_name=Ragnaros&difficulty_name=Heroic&max_players=40&realm_ids=" + realm.String() + "," + realm.String(), true, true, 40, 1},
		{"unpaired difficulty", "instance_name=Molten+Core&difficulty_name=", false, false, 0, 0},
		{"unpaired size", "instance_name=Molten+Core&max_players=0", false, false, 0, 0},
		{"negative size", "instance_name=Molten+Core&difficulty_name=&max_players=-1", false, false, 0, 0},
		{"duplicate filter", "instance_name=A&instance_name=B", false, false, 0, 0},
		{"invalid realm", "realm_ids=unknown", false, false, 0, 0},
		{"invalid metric", "instance_name=A&performance_metric=heals", false, false, 0, 0},
		{"unsupported limit", "limit=100000", false, false, 0, 0},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			request := httptest.NewRequest("GET", "/ratings/hub-summary?"+tt.query, nil)
			got, err := parseHubSummaryInput(request)
			if !tt.valid {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.exact, got.exact)
			require.Equal(t, tt.size, got.size)
			require.Len(t, got.realmIDs, tt.realms)
		})
	}
}

func TestEmptyHubRatingBoard(t *testing.T) {
	t.Parallel()
	board := emptyHubBoard()
	require.NotNil(t, board.Player.Peak)
	require.NotNil(t, board.Player.RankedMastery)
	require.NotNil(t, board.Player.Renown)
	require.NotNil(t, board.Guild.Peak)
	require.NotNil(t, board.Guild.RankedMastery)
	require.NotNil(t, board.Guild.Renown)
}

func TestHubLandingV1RankingParams(t *testing.T) {
	t.Parallel()
	for _, cohort := range []chroniclesdk.RankingsInstanceSummary{
		{InstanceName: "Molten Core", DifficultyName: "", MaxPlayers: 0},
		{InstanceName: "Naxxramas", DifficultyName: "Heroic", MaxPlayers: 40},
	} {
		performance := hubLandingPerformanceParams(cohort, []string{"Realm A"})
		require.Equal(t, []string{cohort.InstanceName}, performance.InstanceNames)
		require.Equal(t, []string{cohort.DifficultyName}, performance.DifficultyNames)
		require.Equal(t, cohort.MaxPlayers, performance.FilterMaxPlayers)
		require.True(t, performance.ExactCohort)
		require.Equal(t, "dps", performance.Metric)
		require.Equal(t, []string{"Realm A"}, performance.RealmNames)
		require.Empty(t, performance.EncounterNames)
		require.EqualValues(t, 3, performance.QueryLimit)

		stats := hubLandingStatisticsParams(cohort, []string{"Realm A"})
		require.Equal(t, []string{cohort.InstanceName}, stats.InstanceNames)
		require.Equal(t, []string{cohort.DifficultyName}, stats.DifficultyNames)
		require.Equal(t, cohort.MaxPlayers, stats.FilterMaxPlayers)
		require.True(t, stats.ExactCohort)
		require.Equal(t, "dps", stats.Metric)
		require.Equal(t, []string{"Realm A"}, stats.RealmNames)
		require.Empty(t, stats.EncounterNames)
		require.False(t, stats.GroupByClass)
	}
}
