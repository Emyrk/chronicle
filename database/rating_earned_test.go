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

func TestRankingRunRefreshEarnsRenownUntilSourceDeletion(t *testing.T) {
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
	guild := uuid.New()
	_, err = pool.Exec(ctx, "INSERT INTO guilds (id,realm_id,name) VALUES ($1,$2,'Earned Guild')", guild, realm.ID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "UPDATE log_instances SET guild_id=$1 WHERE id=$2", guild, instance)
	require.NoError(t, err)
	_, err = servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{instance})
	require.NoError(t, err)
	guildFacts, err := store.ListGuildRenownFacts(ctx, database.ListGuildRenownFactsParams{
		TenantID: uuid.Nil, RealmID: realm.ID, GuildID: guild, LimitCount: 10,
	})
	require.NoError(t, err)
	require.Len(t, guildFacts, 1, "refresh records guild credit before source deletion")
	facts, err := store.ListRenownFactsByCharacter(ctx, database.ListRenownFactsByCharacterParams{RealmID: realm.ID, PlayerGuid: "attendance"})
	require.NoError(t, err)
	require.Len(t, facts, 1)
	require.Equal(t, instance, facts[0].RunID)
	_, err = servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{instance})
	require.NoError(t, err)
	facts, err = store.ListRenownFactsByCharacter(ctx, database.ListRenownFactsByCharacterParams{RealmID: realm.ID, PlayerGuid: "attendance"})
	require.NoError(t, err)
	require.Len(t, facts, 1, "retries must not award twice")
	guildFacts, err = store.ListGuildRenownFacts(ctx, database.ListGuildRenownFactsParams{
		TenantID: uuid.Nil, RealmID: realm.ID, GuildID: guild, LimitCount: 10,
	})
	require.NoError(t, err)
	require.Len(t, guildFacts, 1, "guild retries must not award twice")
	deleteRatingInstanceEvidence(t, ctx, store, instance)
	facts, err = store.ListRenownFactsByCharacter(ctx, database.ListRenownFactsByCharacterParams{RealmID: realm.ID, PlayerGuid: "attendance"})
	require.NoError(t, err)
	require.Empty(t, facts, "last source deletion removes earned player evidence")
	guildFacts, err = store.ListGuildRenownFacts(ctx, database.ListGuildRenownFactsParams{
		TenantID: uuid.Nil, RealmID: realm.ID, GuildID: guild, LimitCount: 10,
	})
	require.NoError(t, err)
	require.Empty(t, guildFacts, "last source deletion removes earned guild evidence")
}

func TestBatchRenownRepairIdempotentAndExcludesGuildless(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	server, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Batch Repair Server"})
	require.NoError(t, err)
	realm, err := store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "Batch Repair Realm"})
	require.NoError(t, err)
	guild := uuid.New()
	_, err = pool.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1, $2, 'Batch Repair Guild')", guild, realm.ID)
	require.NoError(t, err)
	runs := []uuid.UUID{uuid.New(), uuid.New()}
	for _, run := range runs {
		insertRankingRow(t, pool, store, realm.ID, rankingOpts{
			instanceID: run, instanceName: "Molten Core", encounterName: "Ragnaros",
			playerGUID: run.String(), playerClass: "WARRIOR", playerSpec: "Fury",
			difficultyName: "Normal", maxPlayers: 40, damageDone: 10_000,
			durationSecs: 10, dps: 1000, killedAt: time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC), isBoss: true,
		})
	}
	_, err = pool.Exec(ctx, "UPDATE log_instances SET guild_id = $1 WHERE id = $2", guild, runs[0])
	require.NoError(t, err)
	for _, run := range runs {
		sources, err := store.RankingRunSources(ctx, []uuid.UUID{run})
		require.NoError(t, err)
		require.Len(t, sources, 1)
		_, err = store.UpsertRankingRun(ctx, database.UpsertRankingRunParams(sources[0]))
		require.NoError(t, err)
	}
	for attempt := 0; attempt < 2; attempt++ {
		playerAdded, err := store.BackfillRenownFactsForRuns(ctx, []uuid.UUID{runs[0], runs[1], runs[0]})
		require.NoError(t, err)
		guildAdded, err := store.BackfillGuildRenownFactsForRuns(ctx, database.BackfillGuildRenownFactsForRunsParams{
			TenantID: uuid.Nil, RunIds: []uuid.UUID{runs[0], runs[1], runs[0]},
		})
		require.NoError(t, err)
		if attempt == 0 {
			require.Equal(t, int64(2), playerAdded)
			require.Equal(t, int64(1), guildAdded)
		} else {
			require.Zero(t, playerAdded)
			require.Zero(t, guildAdded)
		}
	}
	for _, run := range runs {
		facts, err := store.ListRenownFactsByCharacter(ctx, database.ListRenownFactsByCharacterParams{
			RealmID: realm.ID, PlayerGuid: run.String(),
		})
		require.NoError(t, err)
		require.Len(t, facts, 1)
		require.Equal(t, run, facts[0].RunID)
	}
	guildFacts, err := store.ListGuildRenownFacts(ctx, database.ListGuildRenownFactsParams{
		TenantID: uuid.Nil, RealmID: realm.ID, GuildID: guild, LimitCount: 10,
	})
	require.NoError(t, err)
	require.Len(t, guildFacts, 1, "guild-less runs never earn guild credit")
	require.Equal(t, runs[0], guildFacts[0].RunID)
}

func TestRenownFactsRemovedBeforeRunRefresh(t *testing.T) {
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
	guild := uuid.New()
	_, err = pool.Exec(ctx, "INSERT INTO guilds (id,realm_id,name) VALUES ($1,$2,'Early Guild')", guild, realm.ID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "UPDATE log_instances SET guild_id=$1 WHERE id=$2", guild, instance)
	require.NoError(t, err)
	resolved, err := store.RankingRunSources(ctx, []uuid.UUID{instance})
	require.NoError(t, err)
	require.Len(t, resolved, 1)
	inserted, err := store.BackfillRenownFactsForSource(ctx, database.BackfillRenownFactsForSourceParams{
		RealmID: resolved[0].RealmID, RunID: resolved[0].RunID,
		RepresentativeInstanceID: resolved[0].RepresentativeInstanceID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(1), inserted)
	guildInserted, err := store.BackfillGuildRenownFactsForSource(ctx, database.BackfillGuildRenownFactsForSourceParams{
		TenantID: uuid.Nil, RunID: resolved[0].RunID,
		RepresentativeInstanceID: resolved[0].RepresentativeInstanceID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(1), guildInserted)
	deleteRatingInstanceEvidence(t, ctx, store, instance)
	facts, err := store.ListRenownFactsByCharacter(ctx, database.ListRenownFactsByCharacterParams{RealmID: realm.ID, PlayerGuid: "attendance"})
	require.NoError(t, err)
	require.Empty(t, facts)
	guildFacts, err := store.ListGuildRenownFacts(ctx, database.ListGuildRenownFactsParams{
		TenantID: uuid.Nil, RealmID: realm.ID, GuildID: guild, LimitCount: 10,
	})
	require.NoError(t, err)
	require.Empty(t, guildFacts, "deleting the last source removes credit before run refresh")
}
