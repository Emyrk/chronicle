package servicerankings_test

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

type startFailureRatingStore struct {
	database.Store
	t      *testing.T
	tenant uuid.UUID
	called bool
}

func (s *startFailureRatingStore) InTx(ctx context.Context, f func(database.Store) error, opts *pgx.TxOptions) error {
	s.t.Helper()
	require.Nil(s.t, opts)
	return f(s)
}

func (s *startFailureRatingStore) AcquireRatingRebuildConfigLock(context.Context) error {
	return nil
}

func (s *startFailureRatingStore) StartTenantRatingRebuild(_ context.Context, p database.StartTenantRatingRebuildParams) (uuid.UUID, error) {
	s.t.Helper()
	require.Equal(s.t, s.tenant, p.TenantID)
	s.called = true
	return uuid.Nil, errors.New("snapshot start failed")
}

func (s *startFailureRatingStore) GetBuildingRatingRebuildCheckpoint(context.Context, uuid.UUID) (database.RatingRebuildCheckpoint, error) {
	return database.RatingRebuildCheckpoint{}, pgx.ErrNoRows
}

func TestWorkerRebuildTenantRatings_PropagatesStartFailure(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &startFailureRatingStore{t: t, tenant: tenant}
	worker := &servicerankings.WorkerRebuildTenantRatings{Store: store, Logger: slog.Default()}
	err := worker.Work(t.Context(), &river.Job[servicerankings.ArgsRebuildTenantRatings]{
		Args: servicerankings.ArgsRebuildTenantRatings{TenantID: tenant},
	})
	require.ErrorContains(t, err, "snapshot start failed")
	require.True(t, store.called)
}

func TestWorkerRebuildTenantRatings_RootStartFailure(t *testing.T) {
	t.Parallel()
	store := &startFailureRatingStore{t: t, tenant: uuid.Nil}
	worker := &servicerankings.WorkerRebuildTenantRatings{Store: store, Logger: slog.Default()}
	err := worker.Work(t.Context(), &river.Job[servicerankings.ArgsRebuildTenantRatings]{})
	require.ErrorContains(t, err, "snapshot start failed")
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
func (s *checkpointRatingStore) StartTenantRatingRebuild(context.Context, database.StartTenantRatingRebuildParams) (uuid.UUID, error) {
	return s.cp.GenerationID, nil
}
func (s *checkpointRatingStore) GetBuildingRatingRebuildCheckpoint(context.Context, uuid.UUID) (database.RatingRebuildCheckpoint, error) {
	return s.cp, nil
}
func (s *checkpointRatingStore) GetBuildingTenantProjectionCheckpoint(context.Context, database.GetBuildingTenantProjectionCheckpointParams) (database.RatingRebuildCheckpoint, error) {
	if string(s.cp.Manifest) != `{"writer":"tenant"}` {
		return database.RatingRebuildCheckpoint{}, pgx.ErrNoRows
	}
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
			store := &checkpointRatingStore{cp: database.RatingRebuildCheckpoint{TenantID: tenant, GenerationID: uuid.New(), Phase: phase, Cursor: []byte(`{}`), Manifest: []byte(`{"writer":"tenant"}`), ConfigRevision: 1, AsOf: database.Timestamptz(time.Now().Add(-2 * time.Minute))}, revision: 1}
			histogram := prometheus.NewHistogram(prometheus.HistogramOpts{Name: "rating_rebuild_test_duration_seconds"})
			worker := &servicerankings.WorkerRebuildTenantRatings{Store: store, Logger: slog.Default(), RebuildDuration: histogram}
			err := worker.Work(t.Context(), &river.Job[servicerankings.ArgsRebuildTenantRatings]{Args: servicerankings.ArgsRebuildTenantRatings{TenantID: tenant}})
			if phase == "ready" {
				require.NoError(t, err)
				require.True(t, store.published)
			} else {
				require.NoError(t, err) // Ready and publish can finish in one bounded invocation.
				require.True(t, store.published)
			}
			var metric dto.Metric
			require.NoError(t, histogram.Write(&metric))
			require.EqualValues(t, 1, metric.GetHistogram().GetSampleCount(), "one whole-rebuild observation after publication")
			require.GreaterOrEqual(t, metric.GetHistogram().GetSampleSum(), 120.0, "duration includes the prior checkpoint's elapsed time")
		})
	}
}

func (s *checkpointRatingStore) ListTenantPlayerRaidScopeKeys(context.Context, database.ListTenantPlayerRaidScopeKeysParams) ([]database.ListTenantPlayerRaidScopeKeysRow, error) {
	return nil, errors.New("scope page failed")
}

func TestWorkerRebuildTenantRatingsDoesNotPublishSkippedOrFailedPhases(t *testing.T) {
	t.Parallel()
	for _, phase := range []string{"player_scopes", "guild_renown_scores", "unknown"} {
		t.Run(phase, func(t *testing.T) {
			t.Parallel()
			tenant := uuid.New()
			store := &checkpointRatingStore{cp: database.RatingRebuildCheckpoint{
				TenantID: tenant, GenerationID: uuid.New(), Phase: phase,
				Cursor: []byte(`{}`), Manifest: []byte(`{"writer":"tenant"}`), ConfigRevision: 1,
			}, revision: 1}
			worker := &servicerankings.WorkerRebuildTenantRatings{Store: store, Logger: slog.Default()}
			err := worker.Work(t.Context(), &river.Job[servicerankings.ArgsRebuildTenantRatings]{Args: servicerankings.ArgsRebuildTenantRatings{TenantID: tenant}})
			require.Error(t, err)
			require.False(t, store.published)
			require.Equal(t, phase, store.cp.Phase)
		})
	}
}

func TestWorkerRebuildTenantRatingsRefusesGroupCheckpoint(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &checkpointRatingStore{cp: database.RatingRebuildCheckpoint{TenantID: tenant, GenerationID: uuid.New(), Phase: "ready", Cursor: []byte(`{}`), Manifest: []byte(`{"writer":"group"}`), ConfigRevision: 1}, revision: 1}
	worker := &servicerankings.WorkerRebuildTenantRatings{Store: store, Logger: slog.Default()}
	require.Error(t, worker.Work(t.Context(), &river.Job[servicerankings.ArgsRebuildTenantRatings]{Args: servicerankings.ArgsRebuildTenantRatings{TenantID: tenant}}))
	require.False(t, store.published)
}

func TestWorkerRebuildTenantRatingsStaleConfiguration(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &checkpointRatingStore{cp: database.RatingRebuildCheckpoint{TenantID: tenant, GenerationID: uuid.New(), Phase: "ready", Cursor: []byte(`{}`), Manifest: []byte(`{"writer":"tenant"}`), ConfigRevision: 1, AsOf: database.Timestamptz(time.Now().Add(-time.Minute))}, revision: 2}
	histogram := prometheus.NewHistogram(prometheus.HistogramOpts{Name: "rating_rebuild_stale_test_duration_seconds"})
	worker := &servicerankings.WorkerRebuildTenantRatings{Store: store, Logger: slog.Default(), RebuildDuration: histogram}
	require.Error(t, worker.Work(t.Context(), &river.Job[servicerankings.ArgsRebuildTenantRatings]{Args: servicerankings.ArgsRebuildTenantRatings{TenantID: tenant}}))
	require.True(t, store.aborted)
	require.False(t, store.published)
	var metric dto.Metric
	require.NoError(t, histogram.Write(&metric))
	require.Zero(t, metric.GetHistogram().GetSampleCount(), "an aborted generation is never reported as completed")
}
