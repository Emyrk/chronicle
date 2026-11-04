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

func TestBootstrapTenantLiveEvidenceWaitsForReconciliation(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, store, realm := setupParsesTest(t)
	now := time.Now().UTC().Add(time.Hour) // source_updated_at must precede the fixed bootstrap cutoff
	run := uuid.New()
	insertRankingRunSource(t, pool, store, realm, run, now.Add(-time.Hour), "Boss")
	sources, err := store.RankingRunSources(ctx, []uuid.UUID{run})
	require.NoError(t, err)
	require.Len(t, sources, 1)
	_, err = store.UpsertRankingRun(ctx, database.UpsertRankingRunParams(sources[0]))
	require.NoError(t, err)
	completed, err := ratingmath.BootstrapTenantLiveEvidence(ctx, store, uuid.Nil, now)
	require.NoError(t, err)
	require.False(t, completed)
	ready, err := store.TenantLiveEvidenceReady(ctx, uuid.Nil)
	require.NoError(t, err)
	require.False(t, ready)
	completed, err = ratingmath.BootstrapTenantLiveEvidence(ctx, store, uuid.Nil, now)
	require.NoError(t, err)
	require.False(t, completed, "a dirty run must be reconciled before Mastery can read the live corpus")
	processed, err := ratingmath.ReconcileDirtyTenantObservations(ctx, store, uuid.Nil)
	require.NoError(t, err)
	require.Equal(t, 1, processed)
	completed, err = ratingmath.BootstrapTenantLiveEvidence(ctx, store, uuid.Nil, now)
	require.NoError(t, err)
	require.True(t, completed)
	ready, err = store.TenantLiveEvidenceReady(ctx, uuid.Nil)
	require.NoError(t, err)
	require.True(t, ready)
	completed, err = ratingmath.BootstrapTenantLiveEvidence(ctx, store, uuid.Nil, now)
	require.NoError(t, err)
	require.True(t, completed, "a retried bootstrap is idempotent")
}
