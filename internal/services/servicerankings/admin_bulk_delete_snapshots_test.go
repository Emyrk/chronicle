package servicerankings_test

import (
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDeleteRankingSnapshots(t *testing.T) {
	t.Parallel()

	t.Run("BulkDeleteMultiple", func(t *testing.T) {
		t.Parallel()
		pool, store, realmID := setupSnapshotTest(t)
		ctx := testutil.Context(t, testutil.WaitMedium)

		worker := &servicerankings.WorkerPublishParseSnapshotTenant{
			Store:  store,
			Logger: slog.Default(),
		}

		// Create two snapshots with different cutoffs.
		cutoff1 := time.Date(2024, 7, 1, 0, 0, 0, 0, time.UTC)
		cutoff2 := time.Date(2024, 7, 2, 0, 0, 0, 0, time.UTC)

		for _, cutoff := range []time.Time{cutoff1, cutoff2} {
			insertRankingRow(t, pool, store, realmID, rankingOpts{
				encounterName: "Ragnaros", instanceName: "Molten Core",
				playerGUID: "P-A", playerClass: "Warrior", playerSpec: "Fury",
				difficultyName: "Normal", maxPlayers: 40,
				damageDone: 100000, durationSecs: 300, dps: 333,
				killedAt: cutoff.Add(-time.Hour), isBoss: true,
			})
		}

		// Publish snapshot 1.
		err := worker.Work(ctx, &river.Job[servicerankings.ArgsPublishParseSnapshotTenant]{
			Args: servicerankings.ArgsPublishParseSnapshotTenant{
				TenantID: uuid.Nil, Cutoff: cutoff1, LookbackDays: 0, PolicyVersion: 1,
			},
		})
		require.NoError(t, err)

		snap1, err := store.GetLatestPublishedSnapshot(ctx, database.GetLatestPublishedSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
		})
		require.NoError(t, err)

		// Publish snapshot 2.
		err = worker.Work(ctx, &river.Job[servicerankings.ArgsPublishParseSnapshotTenant]{
			Args: servicerankings.ArgsPublishParseSnapshotTenant{
				TenantID: uuid.Nil, Cutoff: cutoff2, LookbackDays: 0, PolicyVersion: 1,
			},
		})
		require.NoError(t, err)

		snap2, err := store.GetLatestPublishedSnapshot(ctx, database.GetLatestPublishedSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
		})
		require.NoError(t, err)
		require.NotEqual(t, snap1.ID, snap2.ID)

		// Verify members exist.
		count1, err := store.CountSnapshotMembers(ctx, snap1.ID)
		require.NoError(t, err)
		assert.Greater(t, count1, int64(0))

		count2, err := store.CountSnapshotMembers(ctx, snap2.ID)
		require.NoError(t, err)
		assert.Greater(t, count2, int64(0))

		// Bulk-delete both.
		err = store.DeleteRankingSnapshots(ctx, []uuid.UUID{snap1.ID, snap2.ID})
		require.NoError(t, err)

		// Both snapshots and their members should be gone.
		_, err = store.GetRankingSnapshot(ctx, snap1.ID)
		require.Error(t, err)
		_, err = store.GetRankingSnapshot(ctx, snap2.ID)
		require.Error(t, err)

		count1, err = store.CountSnapshotMembers(ctx, snap1.ID)
		require.NoError(t, err)
		assert.Equal(t, int64(0), count1)
		count2, err = store.CountSnapshotMembers(ctx, snap2.ID)
		require.NoError(t, err)
		assert.Equal(t, int64(0), count2)
	})

	t.Run("NonexistentIDsIgnored", func(t *testing.T) {
		t.Parallel()
		_, store, _ := setupSnapshotTest(t)
		ctx := testutil.Context(t, testutil.WaitShort)

		// Deleting nonexistent UUIDs should not error.
		err := store.DeleteRankingSnapshots(ctx, []uuid.UUID{uuid.New(), uuid.New()})
		require.NoError(t, err)
	})

	t.Run("EmptySliceNoOp", func(t *testing.T) {
		t.Parallel()
		_, store, _ := setupSnapshotTest(t)
		ctx := testutil.Context(t, testutil.WaitShort)

		// Empty slice is a valid no-op at the DB level.
		err := store.DeleteRankingSnapshots(ctx, []uuid.UUID{})
		require.NoError(t, err)
	})
}
