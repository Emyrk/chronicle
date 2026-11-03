package database_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// A raid whose roster changed (a boss removed) still has complete runs: the
// boss count full clears reach, not every boss name ever recorded.
func TestRankingsInstanceSummaryCompleteRunsSurviveRosterChange(t *testing.T) {
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
	top := chroniclesdk.TopPlayersFromJSON(summaries[0].TopPlayers)
	require.Len(t, top, 3)
	require.Equal(t, "Player-Charlie", top[0].PlayerName)
	for _, player := range top {
		require.NotEqual(t, "Player-Old", player.PlayerName, "a partial old run is not a complete run")
	}
}
