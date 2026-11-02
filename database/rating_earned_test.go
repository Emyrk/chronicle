package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestRankingRunRefreshEarnsRenownBeforeSourceDeletion(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	server, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Earned Renown Server"})
	require.NoError(t, err)
	realm, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "Earned Renown Realm"})
	require.NoError(t, err)
	instance := uuid.New()
	insertRankingRow(t, pool, store, realm.ID, rankingOpts{
		instanceID: instance, instanceName: "Molten Core", encounterName: "Ragnaros",
		playerGUID: "attendance", playerClass: "WARRIOR", playerSpec: "Fury",
		difficultyName: "Normal", maxPlayers: 40, damageDone: 10_000,
		durationSecs: 10, dps: 1000, killedAt: time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC), isBoss: true,
	})
	_, err = servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{instance})
	require.NoError(t, err)
	facts, err := store.ListRenownFactsByCharacter(ctx, database.ListRenownFactsByCharacterParams{RealmID: realm.ID, PlayerGuid: "attendance"})
	require.NoError(t, err)
	require.Len(t, facts, 1)
	require.Equal(t, instance, facts[0].RunID)
	_, err = servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{instance})
	require.NoError(t, err)
	facts, err = store.ListRenownFactsByCharacter(ctx, database.ListRenownFactsByCharacterParams{RealmID: realm.ID, PlayerGuid: "attendance"})
	require.NoError(t, err)
	require.Len(t, facts, 1, "retries must not award twice")
	_, err = store.DeleteLogInstancesByIDs(ctx, []uuid.UUID{instance})
	require.NoError(t, err)
	facts, err = store.ListRenownFactsByCharacter(ctx, database.ListRenownFactsByCharacterParams{RealmID: realm.ID, PlayerGuid: "attendance"})
	require.NoError(t, err)
	require.Len(t, facts, 1, "earned Renown survives source deletion")
}

func TestRenownFactsPreservedBeforeRunRefresh(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	server, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Early Deletion Server"})
	require.NoError(t, err)
	realm, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "Early Deletion Realm"})
	require.NoError(t, err)
	instance := uuid.New()
	insertRankingRow(t, pool, store, realm.ID, rankingOpts{
		instanceID: instance, instanceName: "Molten Core", encounterName: "Ragnaros",
		playerGUID: "attendance", playerClass: "WARRIOR", playerSpec: "Fury",
		difficultyName: "Normal", maxPlayers: 40, damageDone: 10_000,
		durationSecs: 10, dps: 1000, killedAt: time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC), isBoss: true,
	})
	resolved, err := store.RankingRunSources(ctx, []uuid.UUID{instance})
	require.NoError(t, err)
	require.Len(t, resolved, 1)
	inserted, err := store.BackfillRenownFactsForSource(ctx, database.BackfillRenownFactsForSourceParams{
		RealmID: resolved[0].RealmID, RunID: resolved[0].RunID,
		RepresentativeInstanceID: resolved[0].RepresentativeInstanceID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(1), inserted)
	_, err = store.DeleteLogInstancesByIDs(ctx, []uuid.UUID{instance})
	require.NoError(t, err)
	facts, err := store.ListRenownFactsByCharacter(ctx, database.ListRenownFactsByCharacterParams{RealmID: realm.ID, PlayerGuid: "attendance"})
	require.NoError(t, err)
	require.Len(t, facts, 1)
}
