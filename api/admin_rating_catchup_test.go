package api

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestRatingCatchupSnapshot(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)
	tenant := uuid.New()
	rows := []database.ListTenantRatingCatchupStatusRow{
		{TenantID: uuid.New()},
		{TenantID: tenant, TenantSlug: "rating-demo", ReadState: "evolving", SourceCutoff: pgtype.Timestamptz{Time: now.Add(-time.Hour), Valid: true},
			CompletedAt:  pgtype.Timestamptz{Time: now.Add(-time.Minute), Valid: true},
			DirtyMastery: 2, OldestMastery: pgtype.Timestamptz{Time: now.Add(-time.Minute), Valid: true},
			PolicyScanStages: 6, UnfinishedPolicyScanStages: 4, PolicyScanStageNumber: 3},
		{TenantID: uuid.New(), ReadState: "evolving", SourceCutoff: pgtype.Timestamptz{Time: now.Add(-time.Hour), Valid: true},
			CompletedAt: pgtype.Timestamptz{Time: now.Add(-time.Minute), Valid: true}},
	}
	result := ratingCatchupSnapshot(rows, nil, nil, now)
	require.Equal(t, now, result.ObservedAt)
	require.Len(t, result.Tenants, 3)
	require.NotNil(t, result.Tenants[0].PolicyScanStageTimes)
	require.Equal(t, "not_started", result.Tenants[0].Status)
	require.Equal(t, "catching_up", result.Tenants[1].Status)
	require.Equal(t, "rating-demo", result.Tenants[1].TenantSlug)
	require.Equal(t, int64(2), result.Tenants[1].DirtyMastery)
	require.Equal(t, int64(6), result.Tenants[1].PolicyScanStages)
	require.Equal(t, int64(4), result.Tenants[1].UnfinishedPolicyScanStages)
	require.Equal(t, int32(3), result.Tenants[1].PolicyScanStageNumber)
	require.NotNil(t, result.Tenants[1].OldestMastery)
	require.Nil(t, result.Tenants[1].OldestRun)
	rows[0].PolicyScanStages = 6
	rows[0].UnfinishedPolicyScanStages = 6
	require.Equal(t, "catching_up", ratingCatchupSnapshot(rows, nil, nil, now).Tenants[0].Status)
	require.Equal(t, "caught_up", result.Tenants[2].Status)
}

func TestRatingCatchupPolicyScanTiming(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)
	tenant := uuid.New()
	rows := []database.ListTenantRatingCatchupStatusRow{{TenantID: tenant, PolicyScanStages: 6, UnfinishedPolicyScanStages: 4}}
	stages := []database.ListRatingPolicyScanStageTimesRow{
		{TenantID: tenant, Stage: "runs", UpdatedAt: pgtype.Timestamptz{Time: now.Add(-20 * time.Minute), Valid: true}},
		{TenantID: tenant, Stage: "renown", UpdatedAt: pgtype.Timestamptz{Time: now.Add(-10 * time.Minute), Valid: true}},
	}
	jobs := []database.ListRecentTenantRatingJobsRow{{Kind: "rating-policy-scan", TenantID: tenant.String(), State: "running",
		CreatedAt: pgtype.Timestamptz{Time: now.Add(-time.Hour), Valid: true}}}
	item := ratingCatchupSnapshot(rows, stages, jobs, now).Tenants[0]
	require.Equal(t, now.Add(-time.Hour), *item.PolicyScanStartedAt)
	require.Equal(t, "runs", item.PolicyScanStageTimes[0].Stage)
	require.Equal(t, now.Add(-20*time.Minute), item.PolicyScanStageTimes[0].CompletedAt)
	require.Equal(t, "renown", item.PolicyScanStageTimes[1].Stage)
	require.Equal(t, now.Add(-10*time.Minute), item.PolicyScanStageTimes[1].CompletedAt)

	jobs[0].State = "completed" // Old job just before a new scan was seeded.
	require.Nil(t, ratingCatchupSnapshot(rows, nil, jobs, now).Tenants[0].PolicyScanStartedAt)
	jobs[0].State = "running"
	jobs[0].CreatedAt.Time = now.Add(-5 * time.Minute) // Recovery job started after the first stage.
	require.Nil(t, ratingCatchupSnapshot(rows, stages, jobs, now).Tenants[0].PolicyScanStartedAt)
}

func TestRatingCatchupJobState(t *testing.T) {
	t.Parallel()
	now := time.Now().UTC()
	tenant := uuid.New()
	rows := []database.ListTenantRatingCatchupStatusRow{{TenantID: tenant, ReadState: "evolving",
		SourceCutoff: pgtype.Timestamptz{Time: now.Add(-time.Hour), Valid: true},
		CompletedAt:  pgtype.Timestamptz{Time: now, Valid: true}}}
	jobs := []database.ListRecentTenantRatingJobsRow{
		{Kind: "rating-policy-scan", TenantID: tenant.String(), State: "retryable", LastError: "repair failed", AttemptedAt: pgtype.Timestamptz{Time: now, Valid: true}},
		{TenantID: tenant.String(), State: "completed", FinalizedAt: pgtype.Timestamptz{Time: now.Add(-time.Minute), Valid: true}},
	}
	rows[0].ActiveDrainJobs = 1
	rows[0].UnfinishedPolicyScanStages = 1
	result := ratingCatchupSnapshot(rows, nil, jobs, now)
	require.Equal(t, "stalled_error", result.Tenants[0].Status)
	require.Equal(t, "rating-policy-scan", result.Tenants[0].JobKind)
	require.Equal(t, "repair failed", result.Tenants[0].JobLastError)
	require.NotNil(t, result.Tenants[0].LastSucceededAt)
}

func TestListTenantRatingCatchupStatus(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	server, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Rating status " + uuid.NewString()})
	require.NoError(t, err)
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: server.ID, Name: "Status realm"})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO rating_dirty_observation_runs (tenant_id,run_id) VALUES ($1,$2)`, uuid.Nil, uuid.New())
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO rating_live_evidence_bootstraps (tenant_id,source_cutoff) VALUES ($1,$2)`, uuid.Nil, time.Now().UTC())
	require.NoError(t, err)
	rows, err := store.ListTenantRatingCatchupStatus(ctx)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, uuid.Nil, rows[0].TenantID)
	require.Equal(t, int64(1), rows[0].DirtyRuns)
	require.True(t, rows[0].OldestRun.Valid)
	require.True(t, rows[0].SourceCutoff.Valid)
	require.Equal(t, int64(0), rows[0].PolicyScanStages)
	_, err = pool.Exec(ctx, `INSERT INTO rating_policy_scan_progress (tenant_id, stage, completed)
		SELECT $1, stage, stage IN ('runs', 'renown') FROM unnest(ARRAY['runs','renown','mastery','peak','player_scope','guild_scope']::text[]) stage`, uuid.Nil)
	require.NoError(t, err)
	rows, err = store.ListTenantRatingCatchupStatus(ctx)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	stageTimes, err := store.ListRatingPolicyScanStageTimes(ctx)
	require.NoError(t, err)
	require.Len(t, stageTimes, 2)
	require.Equal(t, "runs", stageTimes[0].Stage)
	require.Equal(t, "renown", stageTimes[1].Stage)
	require.True(t, stageTimes[0].UpdatedAt.Valid)
	require.Equal(t, int64(6), rows[0].PolicyScanStages)
	require.Equal(t, int64(4), rows[0].UnfinishedPolicyScanStages)
	require.Equal(t, int32(3), rows[0].PolicyScanStageNumber)
	require.Empty(t, rows[0].TenantSlug)
	tenantID := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO tenants (id, slug, name) VALUES ($1, 'rating-demo', 'Rating demo')`, tenantID)
	require.NoError(t, err)
	tenantServer, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Tenant rating status " + uuid.NewString()})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE wow_servers SET tenant_id = $1 WHERE id = $2`, tenantID, tenantServer.ID)
	require.NoError(t, err)
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: uuid.New(), ServerID: tenantServer.ID, Name: "Tenant status realm"})
	require.NoError(t, err)
	rows, err = store.ListTenantRatingCatchupStatus(ctx)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	require.Equal(t, tenantID, rows[1].TenantID)
	require.Equal(t, "rating-demo", rows[1].TenantSlug)
	require.False(t, rows[0].CompletedAt.Valid)
}
