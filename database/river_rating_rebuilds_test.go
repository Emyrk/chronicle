package database_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// The admin page reads rebuild jobs straight from River's table.
func TestAdminListRatingRebuildJobs(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	q := database.NewQueries(pool)
	_, err := pool.Exec(ctx, `INSERT INTO river_job (state, attempt, kind, args, metadata, queue, finalized_at, attempted_at, errors)
		VALUES ('completed', 1, 'rebuild-tenant-ratings', '{"tenant_id":"00000000-0000-0000-0000-000000000000"}',
		        '{"output":{"phase":"complete","pages_processed":42,"elapsed_seconds":125}}', 'rankings', now(), now(),
		        ARRAY['{"error":"first try failed"}'::jsonb]),
		       ('completed', 1, 'other-kind', '{}', '{}', 'default', now(), now(), NULL)`)
	require.NoError(t, err)
	rows, err := q.AdminListRatingRebuildJobs(ctx, 40)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, "completed", rows[0].State)
	require.Equal(t, "00000000-0000-0000-0000-000000000000", rows[0].TenantID)
	require.JSONEq(t, `{"phase":"complete","pages_processed":42,"elapsed_seconds":125}`, string(rows[0].Output))
	require.Equal(t, "first try failed", rows[0].LastError)
}
