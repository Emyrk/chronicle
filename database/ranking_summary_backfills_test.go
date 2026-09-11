package database_test

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPreviewRankingSummaryBackfill(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)

	tenantA, tenantB := uuid.New(), uuid.New()
	serverA, serverB := uuid.New(), uuid.New()
	realmA, realmB := uuid.New(), uuid.New()
	userID, logGroupID := uuid.New(), uuid.New()
	_, err = conn.Exec(ctx, "INSERT INTO tenants (id, name) VALUES ($1, 'Tenant A'), ($2, 'Tenant B')", tenantA, tenantB)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO users (id, username, email) VALUES ($1, 'backfill-test', 'backfill-test@example.com')", userID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_log_groups (id, owner) VALUES ($1, $2)", logGroupID, userID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO parsed_log_group (id) VALUES ($1)", logGroupID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_servers (id, name, tenant_id) VALUES ($1, 'Server A', $2), ($3, 'Server B', $4)", serverA, tenantA, serverB, tenantB)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, 'Realm A'), ($3, $4, 'Realm B')", realmA, serverA, realmB, serverB)
	require.NoError(t, err)

	duplicateAnchor, duplicateMember := uuid.New(), uuid.New()
	staleRun, currentRun := uuid.New(), uuid.New()
	_, err = conn.Exec(ctx, `
		INSERT INTO log_instances (id, realm_id, log_group_id, name, capabilities, duplicate_group_id)
		VALUES ($1,$5,$7,'Duplicate','{}',NULL), ($2,$5,$7,'Duplicate','{}',$1),
		       ($3,$5,$7,'Stale','{}',NULL), ($4,$6,$7,'Current','{}',NULL)
	`, duplicateAnchor, duplicateMember, staleRun, currentRun, realmA, realmB, logGroupID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `
		INSERT INTO encounter_dps_rankings
		(instance_id, encounter_name, instance_name, player_guid, player_name, realm_id, realm_name, damage_done, duration_secs, dps, killed_at)
		VALUES ($1,'Boss','Duplicate','p1','P1',$5,'Realm A',100,10,10,now()),
		       ($2,'Boss','Duplicate','p2','P2',$5,'Realm A',100,10,10,now()),
		       ($3,'Boss','Stale','p3','P3',$5,'Realm A',100,10,10,now()),
		       ($4,'Boss','Current','p4','P4',$6,'Realm B',100,10,10,now())
	`, duplicateAnchor, duplicateMember, staleRun, currentRun, realmA, realmB)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `
		INSERT INTO ranking_runs
		(run_id, representative_instance_id, tenant_id, instance_name, realm_id, realm_name, summary_version, source_generation)
		VALUES ($1,$1,$3,'Stale',$4,'Realm A',1,1), ($2,$2,$5,'Current',$6,'Realm B',2,1)
	`, staleRun, currentRun, tenantA, realmA, tenantB, realmB)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "DELETE FROM ranking_run_summary_dirty")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO ranking_run_summary_dirty (run_id, last_transaction_id) VALUES ($1, pg_current_xact_id())", duplicateAnchor)
	require.NoError(t, err)

	tenantPreview, err := store.PreviewRankingSummaryBackfill(ctx, database.PreviewRankingSummaryBackfillParams{
		TenantID: tenantA, TargetSummaryVersion: 2,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(2), tenantPreview.TotalRuns)
	assert.Equal(t, int64(1), tenantPreview.MissingRuns)
	assert.Equal(t, int64(1), tenantPreview.StaleRuns)
	assert.Zero(t, tenantPreview.CurrentRuns)
	assert.Equal(t, int64(1), tenantPreview.DirtyRuns)

	globalPreview, err := store.PreviewRankingSummaryBackfill(ctx, database.PreviewRankingSummaryBackfillParams{
		ScopeAll: true, TargetSummaryVersion: 2,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(3), globalPreview.TotalRuns)
	assert.Positive(t, globalPreview.SourceRows)
	assert.Positive(t, globalPreview.EstimatedWalBytes)
	assert.Equal(t, int64(1), globalPreview.MissingRuns)
	assert.Equal(t, int64(1), globalPreview.StaleRuns)
	assert.Equal(t, int64(1), globalPreview.CurrentRuns)
	assert.Equal(t, int64(1), globalPreview.DirtyRuns)
}

func TestRankingSummaryBackfillPlanPersistence(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)
	requestedBy := uuid.New()
	plan, err := db.CreateRankingSummaryBackfill(ctx, database.CreateRankingSummaryBackfillParams{
		ScopeAll: true, RequestedBy: requestedBy, TargetSummaryVersion: 2,
		BatchSize: 100, MaxBatches: 10, DelayMs: 500,
		PreviewTotalRuns: 5, PreviewMissingRuns: 2, PreviewStaleRuns: 1,
		PreviewCurrentRuns: 2, PreviewDirtyRuns: 1,
	})
	require.NoError(t, err)
	assert.Equal(t, "planned", plan.Status)
	assert.False(t, plan.TenantID.Valid)
	assert.Zero(t, plan.EstimatedWalBytes)

	got, err := db.GetRankingSummaryBackfill(ctx, plan.ID)
	require.NoError(t, err)
	assert.Equal(t, plan.ID, got.ID)
	latest, err := db.LatestRankingSummaryBackfill(ctx, database.LatestRankingSummaryBackfillParams{ScopeAll: true})
	require.NoError(t, err)
	assert.Equal(t, plan.ID, latest.ID)
}

func TestRankingSummaryBackfillPauseResumeAndRateLimit(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)
	plan, err := db.CreateRankingSummaryBackfill(ctx, database.CreateRankingSummaryBackfillParams{
		ScopeAll: true, RequestedBy: uuid.New(), TargetSummaryVersion: 1,
		BatchSize: 1, MaxBatches: 1, DelayMs: 100,
	})
	require.NoError(t, err)

	running, err := db.StartRankingSummaryBackfill(ctx, plan.ID)
	require.NoError(t, err)
	assert.Equal(t, "running", running.Status)
	paused, err := db.PauseRankingSummaryBackfill(ctx, plan.ID)
	require.NoError(t, err)
	assert.Equal(t, "paused", paused.Status)
	running, err = db.StartRankingSummaryBackfill(ctx, plan.ID)
	require.NoError(t, err)
	assert.Equal(t, "running", running.Status)

	paused, err = db.AdvanceRankingSummaryBackfill(ctx, database.AdvanceRankingSummaryBackfillParams{
		ID: plan.ID, CursorRunID: uuid.New(), RunsMarkedDirty: 1,
	})
	require.NoError(t, err)
	assert.Equal(t, "paused", paused.Status)
	assert.Equal(t, int32(1), paused.BatchesCompleted)
	assert.Equal(t, int64(1), paused.RunsMarkedDirty)
}

func TestLatestRankingSummaryBackfillIsScoped(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)

	tenantA, tenantB := uuid.New(), uuid.New()
	_, err = conn.Exec(ctx, "INSERT INTO tenants (id, name) VALUES ($1, 'Tenant A'), ($2, 'Tenant B')", tenantA, tenantB)
	require.NoError(t, err)

	create := func(tenantID uuid.UUID, scopeAll bool) database.RankingSummaryBackfill {
		plan, err := store.CreateRankingSummaryBackfill(ctx, database.CreateRankingSummaryBackfillParams{
			ScopeAll: scopeAll, TenantID: tenantID, RequestedBy: uuid.New(), TargetSummaryVersion: 2,
			BatchSize: 100, MaxBatches: 10, DelayMs: 500,
		})
		require.NoError(t, err)
		return plan
	}
	global := create(uuid.Nil, true)
	tenantAPlan := create(tenantA, false)
	tenantBPlan := create(tenantB, false)

	latestGlobal, err := store.LatestRankingSummaryBackfill(ctx, database.LatestRankingSummaryBackfillParams{ScopeAll: true})
	require.NoError(t, err)
	assert.Equal(t, global.ID, latestGlobal.ID)
	latestTenantA, err := store.LatestRankingSummaryBackfill(ctx, database.LatestRankingSummaryBackfillParams{TenantID: tenantA})
	require.NoError(t, err)
	assert.Equal(t, tenantAPlan.ID, latestTenantA.ID)
	latestTenantB, err := store.LatestRankingSummaryBackfill(ctx, database.LatestRankingSummaryBackfillParams{TenantID: tenantB})
	require.NoError(t, err)
	assert.Equal(t, tenantBPlan.ID, latestTenantB.ID)
}

func TestRankingSummaryBackfillRestrictsTenantDelete(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)

	tenantID := uuid.New()
	_, err = conn.Exec(ctx, "INSERT INTO tenants (id, name) VALUES ($1, 'Protected Tenant')", tenantID)
	require.NoError(t, err)
	_, err = store.CreateRankingSummaryBackfill(ctx, database.CreateRankingSummaryBackfillParams{
		TenantID: tenantID, RequestedBy: uuid.New(), TargetSummaryVersion: 2,
		BatchSize: 100, MaxBatches: 10, DelayMs: 500,
	})
	require.NoError(t, err)

	_, err = conn.Exec(ctx, "DELETE FROM tenants WHERE id = $1", tenantID)
	require.Error(t, err)
	assert.True(t, database.IsForeignKeyViolation(err, database.ForeignKeyRankingSummaryBackfillsTenantID))
}

func TestPreviewRankingSummaryBackfillDetectsCrossTenantDuplicateGroup(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	tenantA, tenantB := insertCrossTenantRankingDuplicateGroup(t, ctx, pool)

	for _, tt := range []struct {
		params database.PreviewRankingSummaryBackfillParams
		want   int64
	}{
		{database.PreviewRankingSummaryBackfillParams{ScopeAll: true, TargetSummaryVersion: 2}, 1},
		{database.PreviewRankingSummaryBackfillParams{TenantID: tenantA, TargetSummaryVersion: 2}, 1},
		{database.PreviewRankingSummaryBackfillParams{TenantID: tenantB, TargetSummaryVersion: 2}, 0},
	} {
		preview, err := store.PreviewRankingSummaryBackfill(ctx, tt.params)
		require.NoError(t, err)
		assert.Equal(t, tt.want, preview.CrossTenantDuplicateRuns)
	}
}

func insertCrossTenantRankingDuplicateGroup(t *testing.T, ctx context.Context, pool *pgxpool.Pool) (uuid.UUID, uuid.UUID) {
	t.Helper()
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)

	tenantA, tenantB := uuid.New(), uuid.New()
	serverA, serverB := uuid.New(), uuid.New()
	realmA, realmB := uuid.New(), uuid.New()
	userID, logGroupID := uuid.New(), uuid.New()
	anchor, member := uuid.New(), uuid.New()
	_, err = conn.Exec(ctx, "INSERT INTO tenants (id, name) VALUES ($1, 'Tenant A'), ($2, 'Tenant B')", tenantA, tenantB)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO users (id, username, email) VALUES ($1, $2, $3)", userID, "cross-tenant-"+userID.String(), userID.String()+"@example.com")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_log_groups (id, owner) VALUES ($1, $2)", logGroupID, userID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO parsed_log_group (id) VALUES ($1)", logGroupID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_servers (id, name, tenant_id) VALUES ($1, 'Server A', $2), ($3, 'Server B', $4)", serverA, tenantA, serverB, tenantB)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, 'Realm A'), ($3, $4, 'Realm B')", realmA, serverA, realmB, serverB)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `
		INSERT INTO log_instances (id, realm_id, log_group_id, name, capabilities, duplicate_group_id)
		VALUES ($1, $3, $5, 'Cross Tenant', '{}', NULL), ($2, $4, $5, 'Cross Tenant', '{}', $1)
	`, anchor, member, realmA, realmB, logGroupID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `
		INSERT INTO encounter_dps_rankings
		(instance_id, encounter_name, instance_name, player_guid, player_name, realm_id, realm_name, damage_done, duration_secs, dps, killed_at)
		VALUES ($1, 'Boss', 'Cross Tenant', 'p1', 'P1', $2, 'Realm A', 100, 10, 10, now())
	`, anchor, realmA)
	require.NoError(t, err)
	return tenantA, tenantB
}
