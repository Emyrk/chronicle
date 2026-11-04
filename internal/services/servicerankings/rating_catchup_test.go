package servicerankings

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestTenantRatingProjectionLockSerializes(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	tenant := uuid.New()
	require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
		if err := tx.AcquireTenantRatingProjectionLock(ctx, tenant); err != nil {
			return err
		}
		var acquired bool
		if err := pool.QueryRow(ctx, `SELECT pg_try_advisory_xact_lock(hashtextextended($1::text, 7119))`, tenant.String()).Scan(&acquired); err != nil {
			return err
		}
		require.False(t, acquired, "another connection must wait while a score page holds the tenant lock")
		return nil
	}, nil))
	var acquired bool
	require.NoError(t, pool.QueryRow(ctx, `SELECT pg_try_advisory_xact_lock(hashtextextended($1::text, 7119))`, tenant.String()).Scan(&acquired))
	require.True(t, acquired, "committed page releases the tenant lock")
}

func TestTenantRatingCatchupNeedsScanAndNoDirtyKeys(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	state, err := store.GetTenantRatingCatchupSummary(ctx, uuid.Nil)
	require.NoError(t, err)
	require.False(t, state.Bool)
	_, err = pool.Exec(ctx, `INSERT INTO rating_live_evidence_bootstraps (tenant_id, source_cutoff, completed_at) VALUES ($1, $2, $2)`, uuid.Nil, time.Now().UTC())
	require.NoError(t, err)
	state, err = store.GetTenantRatingCatchupSummary(ctx, uuid.Nil)
	require.NoError(t, err)
	require.True(t, state.Valid && state.Bool)
	_, err = pool.Exec(ctx, `INSERT INTO river_job (kind, args) VALUES ('drain-tenant-ratings', jsonb_build_object('tenant_id', $1::text))`, uuid.Nil.String())
	require.NoError(t, err)
	state, err = store.GetTenantRatingCatchupSummary(ctx, uuid.Nil)
	require.NoError(t, err)
	require.False(t, state.Bool, "queued drain prevents claiming caught up")
	_, err = pool.Exec(ctx, `DELETE FROM river_job WHERE kind = 'drain-tenant-ratings'`)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO rating_policy_scan_progress (tenant_id, stage) VALUES ($1, 'runs')`, uuid.Nil)
	require.NoError(t, err)
	state, err = store.GetTenantRatingCatchupSummary(ctx, uuid.Nil)
	require.NoError(t, err)
	require.False(t, state.Bool, "unfinished policy scan prevents claiming caught up")
	_, err = pool.Exec(ctx, `UPDATE rating_policy_scan_progress SET completed = true WHERE tenant_id = $1`, uuid.Nil)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO rating_dirty_observation_runs (tenant_id, run_id) VALUES ($1, $2)`, uuid.Nil, uuid.New())
	require.NoError(t, err)
	state, err = store.GetTenantRatingCatchupSummary(ctx, uuid.Nil)
	require.NoError(t, err)
	require.False(t, state.Bool)
}
