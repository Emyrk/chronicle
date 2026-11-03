package servicerankings

import (
	"net/http/httptest"
	"strings"
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
		performance := hubLandingPerformanceParams(cohort, []string{"Realm A"}, []string{"Lucifron", "Ragnaros"})
		require.Equal(t, []string{cohort.InstanceName}, performance.InstanceNames)
		require.Equal(t, []string{cohort.DifficultyName}, performance.DifficultyNames)
		require.Equal(t, cohort.MaxPlayers, performance.FilterMaxPlayers)
		require.True(t, performance.ExactCohort)
		require.Equal(t, "dps", performance.Metric)
		require.Equal(t, []string{"Realm A"}, performance.RealmNames)
		// The preset's bosses, never an empty list (which ranks every encounter, Trash included).
		require.Equal(t, []string{"Lucifron", "Ragnaros"}, performance.EncounterNames)
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

func TestHubResolveCohort(t *testing.T) {
	t.Parallel()
	instances := []chroniclesdk.RankingsInstanceSummary{
		{InstanceName: "Molten Core", DifficultyName: "Normal", MaxPlayers: 20, Category: "raid", TotalKills: 10},
		{InstanceName: "Molten Core", DifficultyName: "Normal", MaxPlayers: 40, Category: "raid", TotalKills: 90},
		{InstanceName: "Molten Core", DifficultyName: "Heroic", MaxPlayers: 40, Category: "dungeon", TotalKills: 500},
		{InstanceName: "Onyxia's Lair", DifficultyName: "Normal", MaxPlayers: 40, Category: "raid", TotalKills: 900},
	}

	// A published request wins even when another cohort is busier.
	got, ok := hubResolveCohort(instances, "Molten Core", "Normal", 20, true)
	require.True(t, ok)
	require.Equal(t, chroniclesdk.HubSelectedCohort{DifficultyName: "Normal", MaxPlayers: 20}, got)

	// No request, or a stale one, falls back to the instance's busiest raid cohort.
	for _, requested := range []bool{false, true} {
		got, ok = hubResolveCohort(instances, "Molten Core", "Mythic", 10, requested)
		require.True(t, ok)
		require.Equal(t, chroniclesdk.HubSelectedCohort{DifficultyName: "Normal", MaxPlayers: 40}, got)
	}

	_, ok = hubResolveCohort(instances, "Naxxramas", "", 0, false)
	require.False(t, ok)
}

func TestHubClassFilter(t *testing.T) {
	t.Parallel()
	// No class means every class, not the UNKNOWN class.
	require.Equal(t, "", hubClassFilter(""))
	require.Equal(t, "MAGE", hubClassFilter("MAGE"))
	require.Equal(t, "DEATH_KNIGHT", hubClassFilter("DEATHKNIGHT"))
}

func TestTenantPeakTieRaw(t *testing.T) {
	t.Parallel()
	require.Equal(t, 1234.5, tenantPeakTieRaw("peak", 1234.5))
	require.Equal(t, 0.0, tenantPeakTieRaw("peak", 0))
	require.Equal(t, 0.0, tenantPeakTieRaw("ranked_mastery", 1234.5))
}

func TestHubSummaryEncounterSet(t *testing.T) {
	t.Parallel()
	parse := func(query string) (hubSummaryInput, error) {
		return parseHubSummaryInput(httptest.NewRequest("GET", "/hub-summary?"+query, nil))
	}
	in, err := parse("instance_name=Molten+Core&encounter_names=Lucifron,Ragnaros,Lucifron")
	require.NoError(t, err)
	require.Equal(t, []string{"Lucifron", "Ragnaros"}, in.set)
	_, err = parse("instance_name=Molten+Core&encounter_names=Lucifron")
	require.Error(t, err, "one boss uses encounter_name")
	_, err = parse("instance_name=Molten+Core&encounter_names=Lucifron,Ragnaros&encounter_name=Garr")
	require.Error(t, err)
	_, err = parse("encounter_names=Lucifron,Ragnaros")
	require.Error(t, err, "requires an instance")

	// The preset is the default encounter set, else progression bosses, never trash.
	require.Equal(t, []string{"Erennius", "Solnius"}, hubPresetBosses([]chroniclesdk.RankingEncounterSet{
		{ID: "hard", Encounters: []string{"Solnius (Hard Mode)"}}, {ID: "", Encounters: []string{"Erennius", "Solnius"}},
	}, []string{"Erennius"}))
	require.Equal(t, []string{"Lucifron", "Ragnaros"}, hubPresetBosses(nil, []string{"Lucifron", "Trash", "Ragnaros"}))
}

func TestParseHubSetBoardInput(t *testing.T) {
	t.Parallel()
	parse := func(query string) (hubSetBoardInput, error) {
		return parseHubSetBoardInput(httptest.NewRequest("GET", "/set-board?"+query, nil))
	}
	base := "instance_name=Molten+Core&encounter_names=Lucifron,Ragnaros&difficulty_name=&max_players=0&performance_metric=dps&subject=player&rating_metric=mastery"
	in, err := parse(base + "&window=all&page=2&limit=10&class=WARRIOR&spec=Fury")
	require.NoError(t, err)
	require.Equal(t, "ranked_mastery", in.params.RatingMetric)
	require.Equal(t, "all_time", in.params.WindowKind)
	require.Equal(t, "career", in.params.RenownWindow)
	require.Equal(t, "WARRIOR", in.params.PlayerClass)
	require.Equal(t, int32(11), in.params.LimitCount, "one extra row tells whether a next page exists")
	require.Equal(t, int32(20), in.params.OffsetCount)

	_, err = parse(base + "&encounter_names=")
	require.Error(t, err)
	_, err = parse(strings.Replace(base, "subject=player", "subject=guild", 1) + "&class=WARRIOR")
	require.Error(t, err, "guild boards have no class")
	_, err = parse(base + "&spec=Fury")
	require.Error(t, err, "spec needs a class")
	_, err = parse(base + "&limit=500")
	require.Error(t, err)
	_, err = parse(base + "&cursor=x")
	require.Error(t, err)
}
