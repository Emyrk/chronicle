package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestDeleteRenownFactsForRunsWithoutGroupMembership(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _, realmID := setupParsesTest(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	guilds := []uuid.UUID{uuid.New(), uuid.New()}
	// Guild fixture creation needs bypass; the deletion itself must not use it.
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	for _, guildID := range guilds {
		_, err = conn.Exec(ctx, "INSERT INTO guilds(id, realm_id, name) VALUES ($1, $2, $3)", guildID, realmID, guildID.String())
		require.NoError(t, err)
	}
	_, err = conn.Exec(ctx, "RESET app.tenant_bypass")
	require.NoError(t, err)

	q := database.NewQueries(conn)
	removedRuns := []uuid.UUID{uuid.New(), uuid.New()}
	keptRun := uuid.New()
	killedAt := database.Timestamptz(time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC))
	for _, runID := range append(append([]uuid.UUID{}, removedRuns...), keptRun) {
		for _, player := range []string{"player-a", "player-b"} {
			inserted, err := q.InsertRenownKillFact(ctx, database.InsertRenownKillFactParams{
				RealmID: realmID, PlayerGuid: player, RunID: runID,
				InstanceName: "Molten Core", EncounterName: "Ragnaros", KilledAt: killedAt,
			})
			require.NoError(t, err)
			require.Equal(t, int64(1), inserted)
		}
		for i, guildID := range guilds {
			encounter := []string{"Ragnaros", "Lucifron"}[i]
			_, err := conn.Exec(ctx, `INSERT INTO guild_renown_kill_facts
				(tenant_id, realm_id, guild_id, run_id, instance_name, encounter_name, killed_at)
				VALUES ($1, $2, $3, $4, 'Molten Core', $5, $6)`,
				uuid.Nil, realmID, guildID, runID, encounter, killedAt)
			require.NoError(t, err)
		}
	}

	// No rating group or membership was created; deletion must be run-scoped,
	// not gated on membership in today's group.
	deleted, err := q.DeletePlayerRenownFactsForRuns(ctx, removedRuns)
	require.NoError(t, err)
	require.Equal(t, int64(4), deleted)
	deleted, err = q.DeleteGuildRenownFactsForRuns(ctx, removedRuns)
	require.NoError(t, err)
	require.Equal(t, int64(4), deleted)
	for _, player := range []string{"player-a", "player-b"} {
		facts, err := q.ListRenownFactsByCharacter(ctx, database.ListRenownFactsByCharacterParams{
			RealmID: realmID, PlayerGuid: player,
		})
		require.NoError(t, err)
		require.Len(t, facts, 1)
		require.Equal(t, keptRun, facts[0].RunID)
	}
	for _, guildID := range guilds {
		facts, err := q.ListGuildRenownFacts(ctx, database.ListGuildRenownFactsParams{
			TenantID: uuid.Nil, RealmID: realmID, GuildID: guildID, LimitCount: 10,
		})
		require.NoError(t, err)
		require.Len(t, facts, 1)
		require.Equal(t, keptRun, facts[0].RunID)
	}
	// A single revision bump invalidates any checkpoint staged before deletion.
	bumped, err := q.BumpRatingConfigRevisionForRealms(ctx, []uuid.UUID{realmID, realmID})
	require.NoError(t, err)
	require.Equal(t, int64(1), bumped)
	revision, err := q.GetRatingConfigRevision(ctx, uuid.Nil)
	require.NoError(t, err)
	require.Equal(t, int64(1), revision)
	bumped, err = q.BumpRatingConfigRevisionForRealms(ctx, []uuid.UUID{realmID})
	require.NoError(t, err)
	require.Equal(t, int64(1), bumped)
	revision, err = q.GetRatingConfigRevision(ctx, uuid.Nil)
	require.NoError(t, err)
	require.Equal(t, int64(2), revision)

	deleted, err = q.DeletePlayerRenownFactsForRuns(ctx, nil)
	require.NoError(t, err)
	require.Zero(t, deleted)
	deleted, err = q.DeleteGuildRenownFactsForRuns(ctx, make([]uuid.UUID, 101))
	require.NoError(t, err)
	require.Zero(t, deleted)
}
