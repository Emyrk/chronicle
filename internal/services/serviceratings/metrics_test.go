package serviceratings

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/require"
)

type diagnosticsStore struct {
	database.Store
	calls int
	fail  bool
}

func (s *diagnosticsStore) LeaderboardQueueDiagnostics(ctx context.Context, tenant uuid.UUID) ([]database.LeaderboardQueueDiagnosticsRow, error) {
	s.calls++
	if s.fail {
		return nil, errors.New("injected collection error")
	}
	return s.Store.LeaderboardQueueDiagnostics(ctx, tenant)
}

func TestQueueDiagnosticsTruthAndCachedMetrics(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	ctx := s.tenantctx()
	s.enqueueRun()
	s.enqueueRun() // upsert increments revision, not queue size.
	registry := prometheus.NewRegistry()
	metrics, err := NewMetrics(registry)
	require.NoError(t, err)
	store := &diagnosticsStore{Store: s.db}
	require.NoError(t, metrics.RefreshPage(s.ctx, store))
	require.Equal(t, 1, store.calls)
	families, err := registry.Gather()
	require.NoError(t, err)
	require.NotEmpty(t, families)
	_, err = registry.Gather()
	require.NoError(t, err)
	require.Equal(t, 1, store.calls)
	rows, err := s.db.LeaderboardQueueDiagnostics(ctx, s.tenant)
	require.NoError(t, err)
	require.Len(t, rows, 14)
	require.EqualValues(t, 1, diagnosticFamily(rows, "runs").Pending)
	require.EqualValues(t, 1, diagnosticFamily(rows, "runs").Due)
	isolated, err := s.db.LeaderboardQueueDiagnostics(servicetenant.WithTenantID(s.ctx, uuid.New()), s.tenant)
	require.NoError(t, err)
	require.Len(t, isolated, 14)
	for _, row := range isolated {
		require.Zero(t, row.Pending)
	}

	claim := s.claim()
	rows, err = s.db.LeaderboardQueueDiagnostics(ctx, s.tenant)
	require.NoError(t, err)
	require.EqualValues(t, 1, diagnosticFamily(rows, "runs").Claimed)
	require.Zero(t, diagnosticFamily(rows, "runs").Due)
	require.NoError(t, s.db.RetryLeaderboardRun(ctx, database.RetryLeaderboardRunParams{TenantID: s.tenant, RunID: s.run, ClaimToken: claim.ClaimToken.UUID, ClaimedRevision: claim.ClaimedRevision.Int64}))
	rows, err = s.db.LeaderboardQueueDiagnostics(ctx, s.tenant)
	require.NoError(t, err)
	require.EqualValues(t, 1, diagnosticFamily(rows, "runs").Retrying)
	require.Zero(t, diagnosticFamily(rows, "runs").Due)
	before := metrics.snapshots[s.tenant]
	store.fail = true
	require.NoError(t, metrics.RefreshPage(s.ctx, store))
	after := metrics.snapshots[s.tenant]
	require.Equal(t, before.at, after.at)
	require.Equal(t, before.rows, after.rows)
	require.False(t, after.healthy)
	require.Equal(t, float64(1), counterValue(t, metrics.collection.WithLabelValues("failed")))
	store.fail = false
	s.exec(`DELETE FROM leaderboard_dirty_runs WHERE tenant_id=$1`, s.tenant)
	require.NoError(t, metrics.RefreshPage(s.ctx, store))
	require.Zero(t, diagnosticFamily(metrics.snapshots[s.tenant].rows, "runs").Pending)
	require.True(t, metrics.snapshots[s.tenant].healthy)
}

func TestRepairMetricPublicationCommitAndFence(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	metrics, err := NewMetrics(prometheus.NewRegistry())
	require.NoError(t, err)
	worker := &RepairWorker{Store: s.db, Metrics: metrics}
	s.enqueueRun()
	claim := s.claim()
	rows := s.compute()
	require.NoError(t, worker.publish(s.tenantctx(), claim, rows))
	require.Equal(t, float64(1), counterValue(t, metrics.events.WithLabelValues(s.tenant.String(), "runs", "publish", "committed")))
	require.NoError(t, worker.publish(s.tenantctx(), claim, rows))
	require.Equal(t, float64(1), counterValue(t, metrics.events.WithLabelValues(s.tenant.String(), "runs", "publish", "fenced")))
	s.enqueueRun()
	claim = s.claim()
	broken := &RepairWorker{Store: operationRollbackStore{s.db}, Metrics: metrics}
	require.Error(t, broken.publish(s.tenantctx(), claim, rows))
	require.Equal(t, float64(1), counterValue(t, metrics.events.WithLabelValues(s.tenant.String(), "runs", "publish", "committed")))
}

func TestD2MetricsCountCommittedScopes(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	require.NoError(t, s.direct(s.compute()))
	metrics, err := NewMetrics(prometheus.NewRegistry())
	require.NoError(t, err)
	_, err = (&Worker{Store: s.db, Metrics: metrics}).Drain(s.ctx, s.tenant, FamilyPlayerBossSubject)
	require.NoError(t, err)
	require.Equal(t, float64(1), counterValue(t, metrics.events.WithLabelValues(s.tenant.String(), "player_boss_subjects", "publish", "committed")))
	// Failed transactions cannot add committed events.
	metrics.event(s.tenant, "operation", "runs", "committed_page", 0)
	require.Zero(t, counterValue(t, metrics.events.WithLabelValues(s.tenant.String(), "operation", "runs", "committed_page")))
	metrics.elapsed(s.tenant, "runs", "compute", time.Now(), nil)
}

func diagnosticFamily(rows []database.LeaderboardQueueDiagnosticsRow, family string) database.LeaderboardQueueDiagnosticsRow {
	for _, row := range rows {
		if row.Family == family {
			return row
		}
	}
	panic("missing diagnostic family")
}

func counterValue(t *testing.T, c prometheus.Counter) float64 {
	t.Helper()
	m := &dto.Metric{}
	require.NoError(t, c.Write(m))
	return m.GetCounter().GetValue()
}

type failPublicationCommitStore struct {
	database.Store
	transactions int
}

func (s *failPublicationCommitStore) InTx(ctx context.Context, fn func(database.Store) error, opts *pgx.TxOptions) error {
	s.transactions++
	fail := s.transactions == 3
	return s.Store.InTx(ctx, func(tx database.Store) error {
		if err := fn(tx); err != nil {
			return err
		}
		if fail {
			return errors.New("injected publication rollback")
		}
		return nil
	}, opts)
}
func TestD2MetricsIgnoreRolledBackPublication(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	require.NoError(t, s.direct(s.compute()))
	metrics, err := NewMetrics(prometheus.NewRegistry())
	require.NoError(t, err)
	wrapped := &failPublicationCommitStore{Store: s.db}
	_, err = (&Worker{Store: wrapped, Metrics: metrics}).Drain(s.ctx, s.tenant, FamilyPlayerBossSubject)
	require.NoError(t, err) // durable retry, not immediate River retry.
	require.Zero(t, counterValue(t, metrics.events.WithLabelValues(s.tenant.String(), "player_boss_subjects", "publish", "committed")))
	require.Equal(t, float64(1), counterValue(t, metrics.events.WithLabelValues(s.tenant.String(), "player_boss_subjects", "retry", "committed_attempt")))
	var count int
	require.NoError(t, s.row(`SELECT count(*) FROM leaderboard_player_boss_subjects WHERE tenant_id=$1`, s.tenant).Scan(&count))
	require.Zero(t, count)
}

type expirePublicationStore struct {
	database.Store
	transactions int
}

func (s *expirePublicationStore) InTx(ctx context.Context, fn func(database.Store) error, opts *pgx.TxOptions) error {
	s.transactions++
	expire := s.transactions == 3
	return s.Store.InTx(ctx, func(tx database.Store) error {
		if expire {
			raw, ok := database.PGXTx(tx)
			if !ok {
				return errors.New("missing transaction")
			}
			if _, err := raw.Exec(ctx, `UPDATE leaderboard_dirty_player_boss_subjects SET locked_until=clock_timestamp()-interval '1 minute'`); err != nil {
				return err
			}
		}
		return fn(tx)
	}, opts)
}
func TestD2MetricsSeparateFencedPublication(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	require.NoError(t, s.direct(s.compute()))
	metrics, err := NewMetrics(prometheus.NewRegistry())
	require.NoError(t, err)
	_, err = (&Worker{Store: &expirePublicationStore{Store: s.db}, Metrics: metrics}).Drain(s.ctx, s.tenant, FamilyPlayerBossSubject)
	require.NoError(t, err)
	require.Zero(t, counterValue(t, metrics.events.WithLabelValues(s.tenant.String(), "player_boss_subjects", "publish", "committed")))
	require.Equal(t, float64(1), counterValue(t, metrics.events.WithLabelValues(s.tenant.String(), "player_boss_subjects", "publish", "fenced")))
}

type metricsTenantPager struct {
	database.Store
	tenants []uuid.UUID
	calls   int
}

func (s *metricsTenantPager) ListLeaderboardMetricTenants(_ context.Context, after uuid.UUID) ([]uuid.UUID, error) {
	var out []uuid.UUID
	for _, id := range s.tenants {
		if bytes.Compare(id[:], after[:]) > 0 {
			out = append(out, id)
			if len(out) == 100 {
				break
			}
		}
	}
	return out, nil
}
func (s *metricsTenantPager) LeaderboardQueueDiagnostics(context.Context, uuid.UUID) ([]database.LeaderboardQueueDiagnosticsRow, error) {
	s.calls++
	return []database.LeaderboardQueueDiagnosticsRow{{Family: "runs"}}, nil
}
func (s *metricsTenantPager) LeaderboardMetricOperationProgress(context.Context, uuid.UUID) ([]database.LeaderboardMetricOperationProgressRow, error) {
	return nil, nil
}
func TestMetricsCollectorPagesAndPrunesTenants(t *testing.T) {
	t.Parallel()
	metrics, err := NewMetrics(prometheus.NewRegistry())
	require.NoError(t, err)
	store := &metricsTenantPager{}
	for i := 1; i <= 101; i++ {
		id := uuid.Nil
		id[15] = byte(i)
		store.tenants = append(store.tenants, id)
	}
	require.NoError(t, metrics.RefreshPage(context.Background(), store))
	require.Equal(t, 100, store.calls)
	require.Len(t, metrics.snapshots, 100)
	require.NoError(t, metrics.RefreshPage(context.Background(), store))
	require.Equal(t, 101, store.calls)
	require.Len(t, metrics.snapshots, 101)
	require.Equal(t, uuid.Nil, metrics.after)
	store.tenants = store.tenants[:1]
	require.NoError(t, metrics.RefreshPage(context.Background(), store))
	require.Len(t, metrics.snapshots, 1)
	store.tenants = nil
	require.NoError(t, metrics.RefreshPage(context.Background(), store))
	require.Empty(t, metrics.snapshots)
}

type closeFailPublication struct{}

func (closeFailPublication) QueryRow(fn func(int, bool, error)) { fn(0, true, nil) }
func (closeFailPublication) Close() error                       { return errors.New("injected batch close failure") }
func TestD2MetricsIgnoreBatchCloseFailure(t *testing.T) {
	t.Parallel()
	s := newSourceFixture(t)
	metrics, err := NewMetrics(prometheus.NewRegistry())
	require.NoError(t, err)
	ctx := withMetricScope(s.tenantctx(), metrics, s.tenant, "player_boss_subjects")
	result, err := drainFamily(ctx, s.db,
		func(context.Context, database.Store) ([]int, error) { return []int{1}, nil },
		func(context.Context, database.Store, []int) ([]int, error) { return []int{1}, nil },
		func(ctx context.Context, _ database.Store, _, _ []int) error {
			return consumePublished(ctx, closeFailPublication{})
		},
		func(context.Context, database.Store, []int) error { return nil })
	require.NoError(t, err)
	require.Equal(t, 1, result.Failed)
	require.Zero(t, counterValue(t, metrics.events.WithLabelValues(s.tenant.String(), "player_boss_subjects", "publish", "committed")))
}
