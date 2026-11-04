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
		{TenantID: tenant, ReadState: "evolving", SourceCutoff: pgtype.Timestamptz{Time: now.Add(-time.Hour), Valid: true},
			CompletedAt:  pgtype.Timestamptz{Time: now.Add(-time.Minute), Valid: true},
			DirtyMastery: 2, OldestMastery: pgtype.Timestamptz{Time: now.Add(-time.Minute), Valid: true}},
		{TenantID: uuid.New(), ReadState: "evolving", SourceCutoff: pgtype.Timestamptz{Time: now.Add(-time.Hour), Valid: true},
			CompletedAt: pgtype.Timestamptz{Time: now.Add(-time.Minute), Valid: true}},
	}
	result := ratingCatchupSnapshot(rows, nil, now)
	require.Equal(t, now, result.ObservedAt)
	require.Len(t, result.Tenants, 3)
	require.Equal(t, "not_started", result.Tenants[0].Status)
	require.Equal(t, "catching_up", result.Tenants[1].Status)
	require.Equal(t, int64(2), result.Tenants[1].DirtyMastery)
	require.NotNil(t, result.Tenants[1].OldestMastery)
	require.Nil(t, result.Tenants[1].OldestRun)
	require.Equal(t, "caught_up", result.Tenants[2].Status)
}

func TestRatingCatchupJobState(t *testing.T) {
	t.Parallel()
	now := time.Now().UTC()
	tenant := uuid.New()
	rows := []database.ListTenantRatingCatchupStatusRow{{TenantID: tenant, ReadState: "evolving",
		SourceCutoff: pgtype.Timestamptz{Time: now.Add(-time.Hour), Valid: true},
		CompletedAt:  pgtype.Timestamptz{Time: now, Valid: true}}}
	jobs := []database.ListRecentTenantRatingDrainJobsRow{
		{TenantID: tenant.String(), State: "retryable", LastError: "repair failed", AttemptedAt: pgtype.Timestamptz{Time: now, Valid: true}},
		{TenantID: tenant.String(), State: "completed", FinalizedAt: pgtype.Timestamptz{Time: now.Add(-time.Minute), Valid: true}},
	}
	result := ratingCatchupSnapshot(rows, jobs, now)
	require.Equal(t, "stalled_error", result.Tenants[0].Status)
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
	require.False(t, rows[0].CompletedAt.Valid)
}
