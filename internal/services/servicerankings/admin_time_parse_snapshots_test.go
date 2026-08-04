package servicerankings_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestListAllTimeParseSnapshots(t *testing.T) {
	t.Parallel()

	t.Run("ListsPublishedAndPending", func(t *testing.T) {
		t.Parallel()
		_, store, realmID := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitMedium)

		baseTime := time.Date(2024, 7, 1, 12, 0, 0, 0, time.UTC)
		cutoff := time.Date(2024, 7, 2, 0, 0, 0, 0, time.UTC)

		// Insert test instances so the worker populates members.
		insertTimeParseInstance(t, nil, store, realmID, timeParseInstanceOpts{
			instanceName:   "Molten Core",
			difficultyName: "Normal",
			maxPlayers:     40,
			qualified:      true,
			durationMs:     300000,
			startTime:      baseTime,
			encounters: []timeParseEncounterOpts{
				{
					name:      "Ragnaros",
					killType:  database.KillTypeClean,
					boss:      true,
					startTime: baseTime.Add(280 * time.Second),
					endTime:   baseTime.Add(300 * time.Second),
				},
			},
		})

		// Publish a snapshot.
		runTimeParseWorker(t, ctx, store, uuid.Nil, cutoff, 0)

		// Also insert a pending snapshot directly.
		_, err := store.InsertTimeParseSnapshot(ctx, database.InsertTimeParseSnapshotParams{
			TenantID:     uuid.Nil,
			Cutoff:       database.Timestamptz(cutoff.Add(24 * time.Hour)),
			LookbackDays: 0,
		})
		require.NoError(t, err)

		rows, err := store.ListAllTimeParseSnapshots(ctx)
		require.NoError(t, err)

		// Should have at least 2 snapshots (one published, one pending).
		require.GreaterOrEqual(t, len(rows), 2)

		// Verify the query returns both statuses.
		statuses := make(map[string]bool)
		for _, r := range rows {
			statuses[r.Status] = true
		}
		assert.True(t, statuses["published"], "should include published snapshots")
		assert.True(t, statuses["pending"], "should include pending snapshots")

		// Verify we get member counts on the published one.
		var foundPublished bool
		for _, r := range rows {
			if r.Status == "published" {
				foundPublished = true
				assert.GreaterOrEqual(t, r.ClearMemberCount, int64(0))
				assert.GreaterOrEqual(t, r.BossMemberCount, int64(0))
			}
		}
		assert.True(t, foundPublished)
	})

	t.Run("EmptyResultOnNoSnapshots", func(t *testing.T) {
		t.Parallel()
		_, store, _ := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitShort)

		rows, err := store.ListAllTimeParseSnapshots(ctx)
		require.NoError(t, err)
		assert.Empty(t, rows)
	})
}

func TestDeleteTimeParseSnapshot(t *testing.T) {
	t.Parallel()

	t.Run("CascadeDeletesMembers", func(t *testing.T) {
		t.Parallel()
		_, store, realmID := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitMedium)

		baseTime := time.Date(2024, 8, 1, 12, 0, 0, 0, time.UTC)
		cutoff := time.Date(2024, 8, 2, 0, 0, 0, 0, time.UTC)

		insertTimeParseInstance(t, nil, store, realmID, timeParseInstanceOpts{
			instanceName:   "Molten Core",
			difficultyName: "Normal",
			maxPlayers:     40,
			qualified:      true,
			durationMs:     300000,
			startTime:      baseTime,
			encounters: []timeParseEncounterOpts{
				{
					name:      "Ragnaros",
					killType:  database.KillTypeClean,
					boss:      true,
					startTime: baseTime.Add(280 * time.Second),
					endTime:   baseTime.Add(300 * time.Second),
				},
			},
		})

		runTimeParseWorker(t, ctx, store, uuid.Nil, cutoff, 0)

		snap, err := store.GetLatestPublishedTimeParseSnapshot(ctx, database.GetLatestPublishedTimeParseSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
			PolicyVersion: 1, QueryVersion: 1,
		})
		require.NoError(t, err)

		clearCount, err := store.CountTimeParseSnapshotClearTimeMembers(ctx, snap.ID)
		require.NoError(t, err)
		assert.Greater(t, clearCount, int64(0), "should have clear-time members before delete")

		// Delete the snapshot.
		err = store.DeleteTimeParseSnapshot(ctx, snap.ID)
		require.NoError(t, err)

		// Members should be cascade-deleted.
		clearCount, err = store.CountTimeParseSnapshotClearTimeMembers(ctx, snap.ID)
		require.NoError(t, err)
		assert.Equal(t, int64(0), clearCount, "clear-time members should be cascade-deleted")

		bossCount, err := store.CountTimeParseSnapshotBossKillMembers(ctx, snap.ID)
		require.NoError(t, err)
		assert.Equal(t, int64(0), bossCount, "boss-kill members should be cascade-deleted")
	})

	t.Run("DeleteNonexistentIsNoOp", func(t *testing.T) {
		t.Parallel()
		_, store, _ := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitShort)

		err := store.DeleteTimeParseSnapshot(ctx, uuid.New())
		require.NoError(t, err)
	})
}

func TestDeleteTimeParseSnapshots(t *testing.T) {
	t.Parallel()

	t.Run("BulkDeleteMultiple", func(t *testing.T) {
		t.Parallel()
		_, store, realmID := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitMedium)

		cutoff1 := time.Date(2024, 7, 1, 0, 0, 0, 0, time.UTC)
		cutoff2 := time.Date(2024, 7, 2, 0, 0, 0, 0, time.UTC)

		for _, cutoff := range []time.Time{cutoff1, cutoff2} {
			insertTimeParseInstance(t, nil, store, realmID, timeParseInstanceOpts{
				instanceName:   "Molten Core",
				difficultyName: "Normal",
				maxPlayers:     40,
				qualified:      true,
				durationMs:     300000,
				startTime:      cutoff.Add(-time.Hour),
			})
		}

		runTimeParseWorker(t, ctx, store, uuid.Nil, cutoff1, 0)
		runTimeParseWorker(t, ctx, store, uuid.Nil, cutoff2, 0)

		rows, err := store.ListAllTimeParseSnapshots(ctx)
		require.NoError(t, err)
		require.GreaterOrEqual(t, len(rows), 2)

		ids := make([]uuid.UUID, 0, len(rows))
		for _, r := range rows {
			ids = append(ids, r.ID)
		}

		// Bulk-delete all.
		err = store.DeleteTimeParseSnapshots(ctx, ids)
		require.NoError(t, err)

		// All should be gone.
		rowsAfter, err := store.ListAllTimeParseSnapshots(ctx)
		require.NoError(t, err)
		assert.Empty(t, rowsAfter)
	})

	t.Run("NonexistentIDsIgnored", func(t *testing.T) {
		t.Parallel()
		_, store, _ := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitShort)

		err := store.DeleteTimeParseSnapshots(ctx, []uuid.UUID{uuid.New(), uuid.New()})
		require.NoError(t, err)
	})

	t.Run("EmptySliceNoOp", func(t *testing.T) {
		t.Parallel()
		_, store, _ := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitShort)

		err := store.DeleteTimeParseSnapshots(ctx, []uuid.UUID{})
		require.NoError(t, err)
	})
}
