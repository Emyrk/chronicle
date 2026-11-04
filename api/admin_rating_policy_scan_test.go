package api

import (
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSeedRatingPolicyScanRejectsInFlightWithoutReset(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	tenant := uuid.Nil
	start := func() error {
		return store.InTx(ctx, func(tx database.Store) error {
			return seedRatingPolicyScan(ctx, tx, tenant)
		}, nil)
	}

	require.NoError(t, start())
	_, err := pool.Exec(ctx, `UPDATE rating_policy_scan_progress SET after_key = '["page-cursor"]'::jsonb WHERE tenant_id = $1 AND stage = 'runs'`, tenant)
	require.NoError(t, err)
	require.ErrorIs(t, start(), errRatingPolicyScanInFlight)
	var cursor string
	err = pool.QueryRow(ctx, `SELECT after_key::text FROM rating_policy_scan_progress WHERE tenant_id = $1 AND stage = 'runs'`, tenant).Scan(&cursor)
	require.NoError(t, err)
	require.Equal(t, `["page-cursor"]`, cursor)

	_, err = pool.Exec(ctx, `UPDATE rating_policy_scan_progress SET completed = true WHERE tenant_id = $1`, tenant)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO river_job (args,kind) VALUES (jsonb_build_object('tenant_id', $1::text), 'rating-policy-scan')`, tenant)
	require.NoError(t, err)
	require.True(t, errors.Is(start(), errRatingPolicyScanInFlight))
	_, err = pool.Exec(ctx, `UPDATE river_job SET state = 'completed', finalized_at = now() WHERE kind = 'rating-policy-scan' AND args->>'tenant_id' = $1::text`, tenant)
	require.NoError(t, err)
	require.NoError(t, start())
}
