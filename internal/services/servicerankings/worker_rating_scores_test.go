package servicerankings_test

import (
	"context"
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

type unconfiguredRatingStore struct {
	database.Store
	t      *testing.T
	tenant uuid.UUID
	called bool
}

func (s *unconfiguredRatingStore) InTx(ctx context.Context, f func(database.Store) error, opts *pgx.TxOptions) error {
	s.t.Helper()
	require.Nil(s.t, opts)
	return f(s)
}

func (s *unconfiguredRatingStore) AcquireRatingRebuildConfigLock(context.Context) error {
	return nil
}

func (s *unconfiguredRatingStore) ListTenantRatingPolicies(_ context.Context, tenant uuid.UUID) ([]database.RatingGroupPolicy, error) {
	s.t.Helper()
	require.Equal(s.t, s.tenant, tenant)
	s.called = true
	return nil, nil
}

func (s *unconfiguredRatingStore) GetBuildingRatingRebuildCheckpoint(context.Context, uuid.UUID) (database.RatingRebuildCheckpoint, error) {
	return database.RatingRebuildCheckpoint{}, pgx.ErrNoRows
}

func TestWorkerRebuildTenantRatings_UnconfiguredTenant(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &unconfiguredRatingStore{t: t, tenant: tenant}
	worker := &servicerankings.WorkerRebuildTenantRatings{Store: store, Logger: slog.Default()}
	err := worker.Work(t.Context(), &river.Job[servicerankings.ArgsRebuildTenantRatings]{
		Args: servicerankings.ArgsRebuildTenantRatings{TenantID: tenant},
	})
	require.NoError(t, err)
	require.True(t, store.called)
}

func TestWorkerRebuildTenantRatings_RootUnconfigured(t *testing.T) {
	t.Parallel()
	store := &unconfiguredRatingStore{t: t, tenant: uuid.Nil}
	worker := &servicerankings.WorkerRebuildTenantRatings{Store: store, Logger: slog.Default()}
	err := worker.Work(t.Context(), &river.Job[servicerankings.ArgsRebuildTenantRatings]{})
	require.NoError(t, err)
	require.True(t, store.called)
}

func TestArgsRatingJobsUniqueWhileActive(t *testing.T) {
	t.Parallel()
	for _, opts := range []river.InsertOpts{
		servicerankings.ArgsDispatchRatingScores{}.InsertOpts(),
		servicerankings.ArgsRebuildTenantRatings{}.InsertOpts(),
	} {
		require.Equal(t, 3, opts.MaxAttempts)
		require.ElementsMatch(t, []rivertype.JobState{
			rivertype.JobStateScheduled, rivertype.JobStatePending,
			rivertype.JobStateAvailable, rivertype.JobStateRunning,
		}, opts.UniqueOpts.ByState)
	}
	require.True(t, servicerankings.ArgsRebuildTenantRatings{}.InsertOpts().UniqueOpts.ByArgs)
}

type checkpointRatingStore struct {
	database.Store
	cp                 database.RatingRebuildCheckpoint
	revision           int64
	published, aborted bool
}

func (s *checkpointRatingStore) InTx(_ context.Context, fn func(database.Store) error, _ *pgx.TxOptions) error {
	return fn(s)
}
func (s *checkpointRatingStore) ListTenantRatingPolicies(context.Context, uuid.UUID) ([]database.RatingGroupPolicy, error) {
	return nil, nil
}
func (s *checkpointRatingStore) GetBuildingRatingRebuildCheckpoint(context.Context, uuid.UUID) (database.RatingRebuildCheckpoint, error) {
	return s.cp, nil
}
func (s *checkpointRatingStore) GetRatingRebuildCheckpoint(context.Context, database.GetRatingRebuildCheckpointParams) (database.RatingRebuildCheckpoint, error) {
	return s.cp, nil
}
func (s *checkpointRatingStore) GetRatingConfigRevision(context.Context, uuid.UUID) (int64, error) {
	return s.revision, nil
}
func (s *checkpointRatingStore) AbortRatingRebuild(context.Context, database.AbortRatingRebuildParams) (int64, error) {
	s.aborted = true
	return 1, nil
}
func (s *checkpointRatingStore) PublishRatingRebuild(context.Context, database.PublishRatingRebuildParams) (bool, error) {
	s.published = true
	return true, nil
}
func (s *checkpointRatingStore) AdvanceRatingRebuildCheckpoint(_ context.Context, p database.AdvanceRatingRebuildCheckpointParams) (int64, error) {
	if s.cp.Phase != p.ExpectedPhase {
		return 0, nil
	}
	s.cp.Phase, s.cp.Cursor = p.NextPhase, p.NextCursor
	return 1, nil
}

func TestWorkerRebuildTenantRatingsPublishesOnlyReady(t *testing.T) {
	t.Parallel()
	for _, phase := range []string{"scopes_complete", "ready"} {
		t.Run(phase, func(t *testing.T) {
			t.Parallel()
			tenant := uuid.New()
			store := &checkpointRatingStore{cp: database.RatingRebuildCheckpoint{TenantID: tenant, GenerationID: uuid.New(), Phase: phase, Cursor: []byte(`{}`), ConfigRevision: 1}, revision: 1}
			worker := &servicerankings.WorkerRebuildTenantRatings{Store: store, Logger: slog.Default()}
			err := worker.Work(t.Context(), &river.Job[servicerankings.ArgsRebuildTenantRatings]{Args: servicerankings.ArgsRebuildTenantRatings{TenantID: tenant}})
			if phase == "ready" {
				require.NoError(t, err)
				require.True(t, store.published)
			} else {
				require.Error(t, err) // River snooze after the ready transition.
				require.Equal(t, "ready", store.cp.Phase)
				require.False(t, store.published)
			}
		})
	}
}

func TestWorkerRebuildTenantRatingsStaleConfiguration(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &checkpointRatingStore{cp: database.RatingRebuildCheckpoint{TenantID: tenant, GenerationID: uuid.New(), Phase: "ready", Cursor: []byte(`{}`), ConfigRevision: 1}, revision: 2}
	worker := &servicerankings.WorkerRebuildTenantRatings{Store: store, Logger: slog.Default()}
	require.Error(t, worker.Work(t.Context(), &river.Job[servicerankings.ArgsRebuildTenantRatings]{Args: servicerankings.ArgsRebuildTenantRatings{TenantID: tenant}}))
	require.True(t, store.aborted)
	require.False(t, store.published)
}
