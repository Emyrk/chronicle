package database_test

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/ratingfacts"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Match the production deletion transaction without involving object storage.
func deleteRatingInstanceEvidence(t *testing.T, ctx context.Context, store database.Store, id uuid.UUID) {
	t.Helper()
	err := store.InTx(ctx, func(tx database.Store) error {
		if err := tx.AcquireRankingRunRefreshLock(ctx); err != nil {
			return err
		}
		identities, err := tx.RankingRunIdentitiesByInstanceIDs(ctx, []uuid.UUID{id})
		if err != nil {
			return err
		}
		realms, err := tx.RatingRealmsByInstanceIDs(ctx, []uuid.UUID{id})
		if err != nil {
			return err
		}
		if _, err := tx.DeleteLogInstancesByIDs(ctx, []uuid.UUID{id}); err != nil {
			return err
		}
		runs := make([]uuid.UUID, 0, len(identities))
		for _, identity := range identities {
			runs = append(runs, identity.RunID)
		}
		return ratingfacts.ReconcileDeletedRuns(ctx, tx, runs, realms)
	}, nil)
	require.NoError(t, err)
}

func TestRenownReparseRemovesSupersededEvidence(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, store, realm := setupParsesTest(t)
	id := uuid.New()
	insertRankingRow(t, pool, store, realm, rankingOpts{
		instanceID: id, instanceName: "Molten Core", encounterName: "Ragnaros",
		playerGUID: "reparsed-player", playerClass: "WARRIOR", difficultyName: "Normal",
		maxPlayers: 40, damageDone: 1000, durationSecs: 10, dps: 100,
		killedAt: time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC), isBoss: true,
	})
	_, err := store.BackfillRenownFactsForSource(ctx, database.BackfillRenownFactsForSourceParams{RealmID: realm, RunID: id, RepresentativeInstanceID: id})
	require.NoError(t, err)
	var logID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, "SELECT log_group_id FROM log_instances WHERE id=$1", id).Scan(&logID))
	require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
		if err := tx.AcquireRankingRunRefreshLock(ctx); err != nil {
			return err
		}
		return ratingfacts.DeleteParsedLogGroupEvidence(ctx, tx, logID)
	}, nil))
	facts, err := store.ListRenownFactsByCharacter(ctx, database.ListRenownFactsByCharacterParams{RealmID: realm, PlayerGuid: "reparsed-player"})
	require.NoError(t, err)
	require.Empty(t, facts)
}

func TestRenownWholeLogDeletionRemovesLastEvidence(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, store, realm := setupParsesTest(t)
	id := uuid.New()
	insertRankingRow(t, pool, store, realm, rankingOpts{
		instanceID: id, instanceName: "Molten Core", encounterName: "Ragnaros",
		playerGUID: "whole-log-player", playerClass: "WARRIOR", difficultyName: "Normal",
		maxPlayers: 40, damageDone: 1000, durationSecs: 10, dps: 100,
		killedAt: time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC), isBoss: true,
	})
	guild := uuid.New()
	_, err := pool.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1,$2,'Whole Log Guild')", guild, realm)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "UPDATE log_instances SET guild_id=$1 WHERE id=$2", guild, id)
	require.NoError(t, err)
	_, err = store.BackfillRenownFactsForSource(ctx, database.BackfillRenownFactsForSourceParams{RealmID: realm, RunID: id, RepresentativeInstanceID: id})
	require.NoError(t, err)
	_, err = store.BackfillGuildRenownFactsForSource(ctx, database.BackfillGuildRenownFactsForSourceParams{TenantID: uuid.Nil, RunID: id, RepresentativeInstanceID: id})
	require.NoError(t, err)
	asOf := time.Now().UTC()
	generation, err := store.StartRatingRebuild(ctx, database.StartRatingRebuildParams{
		TenantID: uuid.Nil, PolicyVersion: 1, AsOf: database.Timestamptz(asOf), SourceCutoff: database.Timestamptz(asOf),
	})
	require.NoError(t, err)
	before, err := store.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: uuid.Nil, GenerationID: generation})
	require.NoError(t, err)
	var logID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, "SELECT log_group_id FROM log_instances WHERE id=$1", id).Scan(&logID))
	err = store.InTx(ctx, func(tx database.Store) error {
		if err := tx.AcquireRankingRunRefreshLock(ctx); err != nil {
			return err
		}
		identities, err := tx.RankingRunIdentitiesByLogGroupID(ctx, logID)
		if err != nil {
			return err
		}
		realms, err := tx.RatingRealmsByInstanceIDs(ctx, []uuid.UUID{id})
		if err != nil {
			return err
		}
		if err := tx.DeleteWoWLogGroup(ctx, logID); err != nil {
			return err
		}
		runs := make([]uuid.UUID, 0, len(identities))
		for _, identity := range identities {
			runs = append(runs, identity.RunID)
		}
		return ratingfacts.ReconcileDeletedRuns(ctx, tx, runs, realms)
	}, nil)
	require.NoError(t, err)
	afterRevision, err := store.GetRatingConfigRevision(ctx, uuid.Nil)
	require.NoError(t, err)
	require.Greater(t, afterRevision, before.ConfigRevision, "source deletion invalidates a staged generation")
	facts, err := store.ListRenownFactsByCharacter(ctx, database.ListRenownFactsByCharacterParams{RealmID: realm, PlayerGuid: "whole-log-player"})
	require.NoError(t, err)
	require.Empty(t, facts)
	guildFacts, err := store.ListGuildRenownFacts(ctx, database.ListGuildRenownFactsParams{TenantID: uuid.Nil, RealmID: realm, GuildID: guild, LimitCount: 10})
	require.NoError(t, err)
	require.Empty(t, guildFacts)
}

func TestRenownDeletionRetainsOnlySurvivingDuplicate(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, store, realm := setupParsesTest(t)
	anchor, duplicate, replacement := uuid.New(), uuid.New(), uuid.New()
	firstGuild, otherGuild := uuid.New(), uuid.New()
	for _, guild := range []uuid.UUID{firstGuild, otherGuild} {
		_, err := pool.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1,$2,$3)", guild, realm, guild.String())
		require.NoError(t, err)
	}
	kill := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	add := func(id uuid.UUID, player string, guild uuid.UUID, group *uuid.UUID) {
		t.Helper()
		insertRankingRow(t, pool, store, realm, rankingOpts{
			instanceID: id, instanceName: "Molten Core", encounterName: "Ragnaros",
			playerGUID: player, playerClass: "WARRIOR", difficultyName: "Normal",
			maxPlayers: 40, damageDone: 1000, durationSecs: 10, dps: 100,
			killedAt: kill, isBoss: true, dupGroupID: group,
		})
		_, err := pool.Exec(ctx, "UPDATE log_instances SET guild_id=$1 WHERE id=$2", guild, id)
		require.NoError(t, err)
	}
	add(anchor, "old-player", firstGuild, &anchor)
	add(duplicate, "surviving-player", otherGuild, &anchor)
	sources, err := store.RankingRunSources(ctx, []uuid.UUID{anchor})
	require.NoError(t, err)
	require.Len(t, sources, 1)
	require.Equal(t, anchor, sources[0].RunID)
	require.Equal(t, anchor, sources[0].RepresentativeInstanceID)
	_, err = store.BackfillRenownFactsForSource(ctx, database.BackfillRenownFactsForSourceParams{
		RealmID: realm, RunID: anchor, RepresentativeInstanceID: anchor,
	})
	require.NoError(t, err)
	_, err = store.BackfillGuildRenownFactsForSource(ctx, database.BackfillGuildRenownFactsForSourceParams{
		TenantID: uuid.Nil, RunID: anchor, RepresentativeInstanceID: anchor,
	})
	require.NoError(t, err)

	factsFor := func(player string) []database.ListRenownFactsByCharacterRow {
		t.Helper()
		rows, err := store.ListRenownFactsByCharacter(ctx, database.ListRenownFactsByCharacterParams{RealmID: realm, PlayerGuid: player})
		require.NoError(t, err)
		return rows
	}
	guildFactsFor := func(guild uuid.UUID) []database.GuildRenownKillFact {
		t.Helper()
		rows, err := store.ListGuildRenownFacts(ctx, database.ListGuildRenownFactsParams{TenantID: uuid.Nil, RealmID: realm, GuildID: guild, LimitCount: 10})
		require.NoError(t, err)
		return rows
	}

	deleteRatingInstanceEvidence(t, ctx, store, anchor)
	require.Empty(t, factsFor("old-player"))
	require.Empty(t, guildFactsFor(firstGuild))
	require.Len(t, factsFor("surviving-player"), 1)
	require.Len(t, guildFactsFor(otherGuild), 1)
	deleteRatingInstanceEvidence(t, ctx, store, duplicate)
	require.Empty(t, factsFor("surviving-player"))
	require.Empty(t, guildFactsFor(otherGuild))

	// There is no surviving anchor to identify a re-upload as the old run.
	// Deleted evidence is gone, so the newly uploaded copy earns just once.
	add(replacement, "old-player", firstGuild, nil)
	sources, err = store.RankingRunSources(ctx, []uuid.UUID{replacement})
	require.NoError(t, err)
	require.Len(t, sources, 1)
	require.Equal(t, replacement, sources[0].RunID)
	_, err = store.BackfillRenownFactsForSource(ctx, database.BackfillRenownFactsForSourceParams{RealmID: realm, RunID: replacement, RepresentativeInstanceID: replacement})
	require.NoError(t, err)
	_, err = store.BackfillGuildRenownFactsForSource(ctx, database.BackfillGuildRenownFactsForSourceParams{TenantID: uuid.Nil, RunID: replacement, RepresentativeInstanceID: replacement})
	require.NoError(t, err)
	require.Len(t, factsFor("old-player"), 1)
	require.Len(t, guildFactsFor(firstGuild), 1)
}
