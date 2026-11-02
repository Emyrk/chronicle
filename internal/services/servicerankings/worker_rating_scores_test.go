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
