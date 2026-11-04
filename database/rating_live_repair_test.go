package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/ratingmath"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestLiveEvidenceRepairDetectsChangedAndDeletedCanonicalRuns(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, store, realm := setupParsesTest(t)
	cutoff := time.Now().UTC().Add(time.Hour)
	run := uuid.New()
	insertRankingRunSource(t, pool, store, realm, run, cutoff.Add(-time.Hour), "Boss")
	sources, err := store.RankingRunSources(ctx, []uuid.UUID{run})
	require.NoError(t, err)
	require.Len(t, sources, 1)
	_, err = store.UpsertRankingRun(ctx, database.UpsertRankingRunParams(sources[0]))
	require.NoError(t, err)
	page := func() []database.ListLiveEvidenceRepairPageRow {
		t.Helper()
		rows, err := store.ListLiveEvidenceRepairPage(ctx, database.ListLiveEvidenceRepairPageParams{
			TenantID: uuid.Nil, SourceCutoff: database.Timestamptz(cutoff), BatchSize: 200,
		})
		require.NoError(t, err)
		return rows
	}
	require.Len(t, page(), 1)
	require.True(t, page()[0].NeedsRepair.Bool, "unstamped source must be repaired")
	require.NoError(t, store.MarkMissingLiveEvidenceRevision(ctx, database.MarkMissingLiveEvidenceRevisionParams{TenantID: uuid.Nil, RunID: run}))
	processed, err := ratingmath.ReconcileDirtyTenantObservations(ctx, store, uuid.Nil)
	require.NoError(t, err)
	require.Equal(t, 1, processed)
	require.Len(t, page(), 1)
	require.False(t, page()[0].NeedsRepair.Bool)

	_, err = pool.Exec(ctx, "DELETE FROM rating_live_player_observations WHERE tenant_id=$1 AND run_id=$2", uuid.Nil, run)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "DELETE FROM rating_dirty_observation_runs WHERE tenant_id=$1 AND run_id=$2", uuid.Nil, run)
	require.NoError(t, err) // simulate lost intent, not just the normal deletion trigger
	require.True(t, page()[0].NeedsRepair.Bool, "missing evidence is detected even when the source version is unchanged")
	require.NoError(t, store.MarkMissingLiveEvidenceRevision(ctx, database.MarkMissingLiveEvidenceRevisionParams{TenantID: uuid.Nil, RunID: run}))
	processed, err = ratingmath.ReconcileDirtyTenantObservations(ctx, store, uuid.Nil)
	require.NoError(t, err)
	require.Equal(t, 1, processed)
	require.False(t, page()[0].NeedsRepair.Bool)

	_, err = pool.Exec(ctx, "UPDATE ranking_runs SET source_updated_at=$2, updated_at=$2 WHERE run_id=$1", run, cutoff.Add(-30*time.Minute))
	require.NoError(t, err)
	require.True(t, page()[0].NeedsRepair.Bool, "source version changed without a dirty hook")
	require.NoError(t, store.MarkMissingLiveEvidenceRevision(ctx, database.MarkMissingLiveEvidenceRevisionParams{TenantID: uuid.Nil, RunID: run}))
	require.NoError(t, store.MarkMissingLiveEvidenceRevision(ctx, database.MarkMissingLiveEvidenceRevisionParams{TenantID: uuid.Nil, RunID: run}))
	processed, err = ratingmath.ReconcileDirtyTenantObservations(ctx, store, uuid.Nil)
	require.NoError(t, err)
	require.Equal(t, 1, processed)
	require.False(t, page()[0].NeedsRepair.Bool)

	_, err = pool.Exec(ctx, "DELETE FROM ranking_runs WHERE run_id=$1", run)
	require.NoError(t, err)
	require.Len(t, page(), 1, "orphan stamp preserves the deleted run for repair")
	require.True(t, page()[0].NeedsRepair.Bool)
	require.NoError(t, store.MarkMissingLiveEvidenceRevision(ctx, database.MarkMissingLiveEvidenceRevisionParams{TenantID: uuid.Nil, RunID: run}))
	processed, err = ratingmath.ReconcileDirtyTenantObservations(ctx, store, uuid.Nil)
	require.NoError(t, err)
	require.Equal(t, 1, processed)
	require.Empty(t, page(), "deletion removes the orphan stamp")
}
