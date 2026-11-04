package database_test

import (
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestDirtyObservationRunsFollowCanonicalRefreshAndSourceDeletion(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, store, realm := setupParsesTest(t)
	run := uuid.New()
	insertRankingRunSource(t, pool, store, realm, run, time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC), "Boss")
	_, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{run})
	require.NoError(t, err)

	tenants, err := store.ListDirtyObservationRunTenants(ctx)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{uuid.Nil}, tenants)
	rows, err := store.LockDirtyObservationRuns(ctx, database.LockDirtyObservationRunsParams{TenantID: uuid.Nil, BatchSize: 10})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, run, rows[0].RunID)

	// Locked parse updates may arrive after the canonical run is unchanged.
	require.NoError(t, store.MarkDirtyObservationRunForInstance(ctx, database.MarkDirtyObservationRunForInstanceParams{
		TenantID: uuid.Nil, InstanceID: run,
	}))
	n, err := store.DeleteDirtyObservationRunIfRevision(ctx, database.DeleteDirtyObservationRunIfRevisionParams{
		TenantID: uuid.Nil, RunID: run, Revision: rows[0].Revision,
	})
	require.NoError(t, err)
	require.Zero(t, n, "an older reconciliation cannot acknowledge a newer source")

	// Record old intent before the canonical row disappears.
	require.NoError(t, store.MarkDirtyObservationRunsByIDs(ctx, []uuid.UUID{run}))
	_, err = pool.Exec(ctx, "DELETE FROM ranking_runs WHERE run_id=$1", run)
	require.NoError(t, err)
	rows, err = store.LockDirtyObservationRuns(ctx, database.LockDirtyObservationRunsParams{TenantID: uuid.Nil, BatchSize: 10})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, run, rows[0].RunID)
}

func TestDirtyObservationRunMarkRollsBackWithSourceTransaction(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, store, realm := setupParsesTest(t)
	run := uuid.New()
	insertRankingRunSource(t, pool, store, realm, run, time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC), "Boss")
	sources, err := store.RankingRunSources(ctx, []uuid.UUID{run})
	require.NoError(t, err)
	require.Len(t, sources, 1)
	_, err = store.UpsertRankingRun(ctx, database.UpsertRankingRunParams(sources[0]))
	require.NoError(t, err)
	abort := errors.New("abort source update")
	err = store.InTx(ctx, func(tx database.Store) error {
		if err := tx.MarkDirtyObservationRunsByIDs(ctx, []uuid.UUID{run}); err != nil {
			return err
		}
		return abort
	}, nil)
	require.ErrorIs(t, err, abort)
	rows, err := store.LockDirtyObservationRuns(ctx, database.LockDirtyObservationRunsParams{TenantID: uuid.Nil, BatchSize: 10})
	require.NoError(t, err)
	require.Empty(t, rows)
}

func TestDirtyObservationRunsIncludeOldDuplicateRepresentative(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, store, realm := setupParsesTest(t)
	first, second := uuid.New(), uuid.New()
	start := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	insertRankingRunSource(t, pool, store, realm, first, start, "Boss")
	insertRankingRunSource(t, pool, store, realm, second, start.Add(time.Second), "Boss")
	_, err := servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{first, second})
	require.NoError(t, err)
	// Simulate a completed earlier reconciliation, then merge the two sources.
	for _, id := range []uuid.UUID{first, second} {
		rows, err := store.LockDirtyObservationRuns(ctx, database.LockDirtyObservationRunsParams{TenantID: uuid.Nil, BatchSize: 10})
		require.NoError(t, err)
		for _, row := range rows {
			if row.RunID == id {
				_, err = store.DeleteDirtyObservationRunIfRevision(ctx, database.DeleteDirtyObservationRunIfRevisionParams{
					TenantID: uuid.Nil, RunID: row.RunID, Revision: row.Revision,
				})
				require.NoError(t, err)
			}
		}
	}
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: first, Valid: true}, Ids: []uuid.UUID{second},
	}))
	_, err = servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{first, second})
	require.NoError(t, err)
	rows, err := store.LockDirtyObservationRuns(ctx, database.LockDirtyObservationRunsParams{TenantID: uuid.Nil, BatchSize: 10})
	require.NoError(t, err)
	require.Len(t, rows, 2)
	seen := map[uuid.UUID]bool{}
	for _, row := range rows {
		seen[row.RunID] = true
	}
	require.True(t, seen[first], "new representative's run is dirty")
	require.True(t, seen[second], "obsolete standalone run is dirty")
}
