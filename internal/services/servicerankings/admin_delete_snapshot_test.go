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

func TestDeleteRankingSnapshot(t *testing.T) {
	t.Parallel()

	t.Run("CascadeDeletesMembers", func(t *testing.T) {
		t.Parallel()
		pool, store, realmID := setupSnapshotTest(t)
		ctx := testutil.Context(t, testutil.WaitMedium)

		baseTime := time.Date(2024, 7, 1, 12, 0, 0, 0, time.UTC)
		cutoff := time.Date(2024, 7, 2, 0, 0, 0, 0, time.UTC)

		// Insert ranking rows so the publish worker populates members.
		for i, p := range []string{"P-X", "P-Y"} {
			insertRankingRow(t, pool, store, realmID, rankingOpts{
				encounterName: "Ragnaros", instanceName: "Molten Core",
				playerGUID: p, playerClass: "Warrior", playerSpec: "Fury",
				difficultyName: "Normal", maxPlayers: 40,
				damageDone: int64(100000 + i*10000), durationSecs: 300,
				dps: float64(300 + i*50), killedAt: baseTime, isBoss: true,
			})
		}

		worker := &servicerankings.WorkerPublishParseSnapshotTenant{
			Store:  store,
			Logger: slog.Default(),
		}
		err := worker.Work(ctx, &river.Job[servicerankings.ArgsPublishParseSnapshotTenant]{
			Args: servicerankings.ArgsPublishParseSnapshotTenant{
				TenantID:      uuid.Nil,
				Cutoff:        cutoff,
				LookbackDays:  0,
				PolicyVersion: 1,
			},
		})
		require.NoError(t, err)

		snap, err := store.GetLatestPublishedSnapshot(ctx, database.GetLatestPublishedSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
		})
		require.NoError(t, err)

		memberCount, err := store.CountSnapshotMembers(ctx, snap.ID)
		require.NoError(t, err)
		assert.Equal(t, int64(2), memberCount, "should have 2 members before delete")

		// Delete the snapshot.
		err = store.DeleteRankingSnapshot(ctx, snap.ID)
		require.NoError(t, err)

		// Members should be cascade-deleted.
		memberCount, err = store.CountSnapshotMembers(ctx, snap.ID)
		require.NoError(t, err)
		assert.Equal(t, int64(0), memberCount, "members should be cascade-deleted")

		// The snapshot row itself should be gone.
		_, err = store.GetRankingSnapshot(ctx, snap.ID)
		require.Error(t, err, "snapshot should no longer exist")
	})

	t.Run("DeleteNonexistentIsNoOp", func(t *testing.T) {
		t.Parallel()
		_, store, _ := setupSnapshotTest(t)
		ctx := testutil.Context(t, testutil.WaitShort)

		// Deleting a UUID that doesn't exist should not error (DELETE with no matching rows is fine).
		err := store.DeleteRankingSnapshot(ctx, uuid.New())
		require.NoError(t, err)
	})

	t.Run("DeleteThenReBackfillSameDay", func(t *testing.T) {
		t.Parallel()
		pool, store, realmID := setupSnapshotTest(t)
		ctx := testutil.Context(t, testutil.WaitMedium)

		baseTime := time.Date(2024, 8, 1, 12, 0, 0, 0, time.UTC)
		cutoff := time.Date(2024, 8, 2, 0, 0, 0, 0, time.UTC)

		insertRankingRow(t, pool, store, realmID, rankingOpts{
			encounterName: "Ragnaros", instanceName: "Molten Core",
			playerGUID: "P-Z", playerClass: "Warrior", playerSpec: "Fury",
			difficultyName: "Normal", maxPlayers: 40,
			damageDone: 100000, durationSecs: 300, dps: 333,
			killedAt: baseTime, isBoss: true,
		})

		worker := &servicerankings.WorkerPublishParseSnapshotTenant{
			Store:  store,
			Logger: slog.Default(),
		}
		args := servicerankings.ArgsPublishParseSnapshotTenant{
			TenantID:      uuid.Nil,
			Cutoff:        cutoff,
			LookbackDays:  0,
			PolicyVersion: 1,
		}

		// First publish.
		err := worker.Work(ctx, &river.Job[servicerankings.ArgsPublishParseSnapshotTenant]{Args: args})
		require.NoError(t, err)

		snap1, err := store.GetLatestPublishedSnapshot(ctx, database.GetLatestPublishedSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
		})
		require.NoError(t, err)

		// Delete the snapshot.
		err = store.DeleteRankingSnapshot(ctx, snap1.ID)
		require.NoError(t, err)

		// Re-backfill same day — the idempotency guard should no longer block
		// since the published snapshot was deleted.
		err = worker.Work(ctx, &river.Job[servicerankings.ArgsPublishParseSnapshotTenant]{Args: args})
		require.NoError(t, err)

		snap2, err := store.GetLatestPublishedSnapshot(ctx, database.GetLatestPublishedSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
		})
		require.NoError(t, err)
		assert.NotEqual(t, snap1.ID, snap2.ID, "re-backfill should create a new snapshot")
		assert.Equal(t, "published", snap2.Status)

		memberCount, err := store.CountSnapshotMembers(ctx, snap2.ID)
		require.NoError(t, err)
		assert.Equal(t, int64(1), memberCount, "re-backfilled snapshot should have 1 member")
	})
}
