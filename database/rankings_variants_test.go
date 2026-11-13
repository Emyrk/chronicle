package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestRankingsEncounterVariants(t *testing.T) {
	t.Parallel()
	pool, store, realm := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	killedAt := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	for i, variant := range []string{"normal", "hard", ""} {
		instance := uuid.New()
		duration := float64(10 * (i + 1))
		player := variant + "player"
		insertRankingRow(t, pool, store, realm, rankingOpts{instanceID: instance, instanceName: "Ulduar", encounterName: "Thorim", playerGUID: player, playerClass: "MAGE", playerSpec: "Fire", durationSecs: duration, damageDone: int64(duration * float64(100*(i+1))), dps: float64(100 * (i + 1)), killedAt: killedAt, isBoss: true})
		// Fixture updates mirror existing database ranking tests; NULL represents legacy data.
		v := pgtype.Text{String: variant, Valid: variant != ""}
		_, err := pool.Exec(ctx, "UPDATE log_instance_encounters SET encounter_variant=$1 WHERE instance_id=$2", v, instance)
		require.NoError(t, err)
		_, err = pool.Exec(ctx, "UPDATE encounter_dps_rankings SET encounter_variant=$1 WHERE instance_id=$2", v, instance)
		require.NoError(t, err)
		encounter := uuid.New()
		_, err = store.InsertEncounter(ctx, database.InsertEncounterParams{ID: encounter, InstanceID: instance, Name: "Ignis", Boss: true, KillType: database.KillTypeClean, Remaining: guid.GUIDs{}, StartTime: database.Timestamptz(killedAt.Add(-10 * time.Second)), EndTime: database.Timestamptz(killedAt)})
		require.NoError(t, err)
		require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{EncounterID: uuid.NullUUID{UUID: encounter, Valid: true}, InstanceID: instance, InstanceName: "Ulduar", EncounterName: "Ignis", PlayerGuid: player, PlayerName: player, PlayerClass: "MAGE", PlayerSpec: "Fire", RealmID: realm, RealmName: "test-realm", DurationSecs: 10, DamageDone: 1000, Dps: 100, KilledAt: database.Timestamptz(killedAt), LogHashedSlug: uuid.NewString()}))
	}
	for _, tc := range []struct {
		name     string
		variants []byte
		count    int
		min, max float64
		seconds  float64
	}{
		{"nil combined", nil, 3, 100, 300, 20},
		{"empty combined", []byte(`{}`), 3, 100, 300, 20},
		{"normal", []byte(`{"Thorim":"normal"}`), 1, 100, 100, 10},
		{"hard", []byte(`{"Thorim":"hard"}`), 1, 200, 200, 20},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			ctx := testutil.Context(t, testutil.WaitMedium)
			leaderboard, err := store.RankingsLeaderboard(ctx, database.RankingsLeaderboardParams{InstanceNames: []string{"Ulduar"}, EncounterNames: []string{"Thorim"}, EncounterVariants: tc.variants, QueryLimit: 100})
			require.NoError(t, err)
			require.Len(t, leaderboard, tc.count)
			require.Equal(t, int64(tc.count), leaderboard[0].TotalCount)
			stats, err := store.RankingsBoxPlotStats(ctx, database.RankingsBoxPlotStatsParams{InstanceNames: []string{"Ulduar"}, EncounterNames: []string{"Thorim"}, EncounterVariants: tc.variants})
			require.NoError(t, err)
			require.Len(t, stats, 1)
			require.Equal(t, int64(tc.count), stats[0].Count)
			require.Equal(t, tc.min, stats[0].MinDps)
			require.Equal(t, tc.max, stats[0].MaxDps)
			kills, err := store.RankingsKillTimeStats(ctx, database.RankingsKillTimeStatsParams{InstanceName: "Ulduar", EncounterNames: []string{"Thorim"}, EncounterVariants: tc.variants})
			require.NoError(t, err)
			require.Len(t, kills, 1)
			require.Equal(t, int64(tc.count), kills[0].Count)
			require.Equal(t, tc.seconds, kills[0].MedianSecs)
			// The unmapped boss remains Combined, including its NULL legacy variants.
			mixed, err := store.RankingsKillTimeStats(ctx, database.RankingsKillTimeStatsParams{InstanceName: "Ulduar", EncounterVariants: tc.variants})
			require.NoError(t, err)
			require.Len(t, mixed, 2)
			require.Equal(t, "Ignis", mixed[0].EncounterName)
			require.Equal(t, int64(3), mixed[0].Count)
			runs, err := store.RankingsLeaderboard(ctx, database.RankingsLeaderboardParams{InstanceNames: []string{"Ulduar"}, EncounterNames: []string{"Thorim", "Ignis"}, EncounterVariants: tc.variants, QueryLimit: 100})
			require.NoError(t, err)
			require.Len(t, runs, tc.count)
			require.Equal(t, int64(tc.count), runs[0].TotalCount)
		})
	}
	// Cohort filters are applied before duration distributions are aggregated.
	for _, tc := range []struct {
		name   string
		params database.RankingsKillTimeStatsParams
		count  int
	}{
		{"matching realm", database.RankingsKillTimeStatsParams{RealmNames: []string{"test-realm"}}, 2},
		{"other realm", database.RankingsKillTimeStatsParams{RealmNames: []string{"other"}}, 0},
		{"other difficulty", database.RankingsKillTimeStatsParams{DifficultyNames: []string{"Heroic"}}, 0},
		{"other size", database.RankingsKillTimeStatsParams{FilterMaxPlayers: true, MaxPlayers: 25}, 0},
		{"exact zero", database.RankingsKillTimeStatsParams{ExactCohort: true, MaxPlayers: 0}, 2},
		{"legacy difficulty", database.RankingsKillTimeStatsParams{FilterDifficulty: true, DifficultyName: "Heroic"}, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			ctx := testutil.Context(t, testutil.WaitMedium)
			params := tc.params
			params.InstanceName = "Ulduar"
			rows, err := store.RankingsKillTimeStats(ctx, params)
			require.NoError(t, err)
			require.Len(t, rows, tc.count)
		})
	}

}
