package database_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// Summary cards store the distinct players with eligible boss rankings, not a
// complete-run or top-player calculation.
func TestRankingsInstanceSummaryCountsDistinctPlayers(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, store, realm := setupParsesTest(t)
	killedAt := time.Now().UTC().Add(-time.Hour)
	// Three current clears of Lucifron and Ragnaros.
	for i, player := range []string{"Alpha", "Bravo", "Charlie"} {
		instance := uuid.New()
		insertRankingRow(t, pool, store, realm, rankingOpts{
			instanceID: instance, instanceName: "Molten Core", encounterName: "Lucifron", playerGUID: player,
			playerClass: "MAGE", playerSpec: "Fire", difficultyName: "", maxPlayers: 0,
			damageDone: int64(1000 * (i + 1)), durationSecs: 10, dps: float64(100 * (i + 1)), killedAt: killedAt, isBoss: true,
		})
		// The same log's second boss.
		encounter := uuid.New()
		_, err := store.InsertEncounter(ctx, database.InsertEncounterParams{ID: encounter, InstanceID: instance, Name: "Ragnaros",
			KillType: database.KillTypeClean, Remaining: guid.GUIDs{}, Boss: true,
			StartTime: database.Timestamptz(killedAt.Add(-10 * time.Second)), EndTime: database.Timestamptz(killedAt)})
		require.NoError(t, err)
		require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
			EncounterID: uuid.NullUUID{UUID: encounter, Valid: true}, InstanceID: instance, EncounterName: "Ragnaros",
			InstanceName: "Molten Core", PlayerGuid: player, PlayerName: "Player-" + player, PlayerClass: "MAGE", PlayerSpec: "Fire",
			RealmID: realm, RealmName: "test-realm", DamageDone: int64(1000 * (i + 1)), DurationSecs: 10, Dps: float64(100 * (i + 1)),
			KilledAt: database.Timestamptz(killedAt), LogHashedSlug: "slug-" + uuid.NewString()[:8],
		}))
	}
	// An old run of a boss the server has since removed.
	insertRankingRow(t, pool, store, realm, rankingOpts{
		instanceID: uuid.New(), instanceName: "Molten Core", encounterName: "Gehennas", playerGUID: "Old",
		playerClass: "MAGE", playerSpec: "Fire", difficultyName: "", maxPlayers: 0,
		damageDone: 99999, durationSecs: 10, dps: 9999, killedAt: killedAt, isBoss: true,
	})
	require.NoError(t, store.UpsertRankingsInstanceSummary(ctx, database.UpsertRankingsInstanceSummaryParams{
		InstanceName: "Molten Core", DifficultyName: "", MaxPlayers: 0, TenantID: uuid.Nil, LastRowCount: 7, QueryVersion: 4,
	}))
	summaries, err := store.RankingsInstanceSummaries(ctx, uuid.Nil)
	require.NoError(t, err)
	require.Len(t, summaries, 1)
	require.Equal(t, int64(4), summaries[0].TotalKills)
	require.JSONEq(t, `[]`, string(summaries[0].TopPlayers))
}
