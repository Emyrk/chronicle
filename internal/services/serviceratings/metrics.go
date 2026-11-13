package serviceratings

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
)

// Metrics contains process-local committed event counters and cached DB truth.
// Database work happens only in RefreshPage, never in Collect/scrape.
type Metrics struct {
	events                                                                       *prometheus.CounterVec
	duration                                                                     *prometheus.HistogramVec
	collection                                                                   *prometheus.CounterVec
	pending, due, claimed, retrying, oldestPending, oldestDue, snapshot, healthy *prometheus.Desc
	operationProgress, operationTimestamp                                        *prometheus.Desc
	mu                                                                           sync.RWMutex
	snapshots                                                                    map[uuid.UUID]queueSnapshot
	after                                                                        uuid.UUID
	seen                                                                         map[uuid.UUID]bool
}
type queueSnapshot struct {
	operation []database.LeaderboardMetricOperationProgressRow
	rows      []database.LeaderboardQueueDiagnosticsRow
	at        time.Time
	healthy   bool
}

func NewMetrics(reg prometheus.Registerer) (*Metrics, error) {
	m := &Metrics{snapshots: map[uuid.UUID]queueSnapshot{}, seen: map[uuid.UUID]bool{}}
	m.events = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "chronicle_leaderboard_events_total", Help: "Process-local leaderboard outcomes. Committed outcomes increment only after transaction commit; not a durable accounting ledger."}, []string{"tenant", "family", "phase", "outcome"})
	m.duration = prometheus.NewHistogramVec(prometheus.HistogramOpts{Name: "chronicle_leaderboard_phase_duration_seconds", Help: "Leaderboard phase attempt duration, including failures.", Buckets: []float64{.001, .005, .01, .05, .1, .5, 1, 5, 15, 30, 60, 300}}, []string{"tenant", "family", "phase", "outcome"})
	m.collection = prometheus.NewCounterVec(prometheus.CounterOpts{Name: "chronicle_leaderboard_queue_collections_total", Help: "Periodic queue snapshot collection outcomes, independent of scrapes."}, []string{"outcome"})
	desc := func(name, help string) *prometheus.Desc {
		return prometheus.NewDesc("chronicle_leaderboard_queue_"+name, help, []string{"tenant", "family"}, nil)
	}
	m.pending = desc("pending", "Durable dirty scopes, including leased and delayed work. Use max across replicas.")
	m.due = desc("due", "Due unleased dirty scopes. Use max across replicas.")
	m.claimed = desc("claimed", "Dirty scopes with an unexpired lease. Use max across replicas.")
	m.retrying = desc("retrying", "Dirty scopes waiting for retry_after. Use max across replicas.")
	m.oldestPending = desc("oldest_pending_timestamp_seconds", "Oldest dirty timestamp; zero when empty.")
	m.oldestDue = desc("oldest_due_timestamp_seconds", "Oldest process_after among claimable scopes; zero when empty.")
	m.operationProgress = prometheus.NewDesc("chronicle_leaderboard_operation_obligations", "Discovered obligations in latest persisted operation, not unique runs. Resets for a new operation; use max across replicas.", []string{"tenant", "phase"}, nil)
	m.operationTimestamp = prometheus.NewDesc("chronicle_leaderboard_operation_last_progress_timestamp_seconds", "Last persisted operation progress; use max across replicas.", []string{"tenant"}, nil)
	m.snapshot = prometheus.NewDesc("chronicle_leaderboard_queue_snapshot_timestamp_seconds", "Last successful DB snapshot per tenant; zero before first success.", []string{"tenant"}, nil)
	m.healthy = prometheus.NewDesc("chronicle_leaderboard_queue_collection_success", "Whether the last collection attempt for tenant succeeded.", []string{"tenant"}, nil)
	for _, c := range []prometheus.Collector{m, m.events, m.duration, m.collection} {
		if err := reg.Register(c); err != nil {
			return nil, fmt.Errorf("register leaderboard metrics: %w", err)
		}
	}
	return m, nil
}
func (m *Metrics) Describe(ch chan<- *prometheus.Desc) {
	for _, d := range []*prometheus.Desc{m.pending, m.due, m.claimed, m.retrying, m.oldestPending, m.oldestDue, m.snapshot, m.healthy, m.operationProgress, m.operationTimestamp} {
		ch <- d
	}
}
func (m *Metrics) Collect(ch chan<- prometheus.Metric) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for tenant, s := range m.snapshots {
		if len(s.operation) > 0 {
			op := s.operation[0]
			ch <- prometheus.MustNewConstMetric(m.operationProgress, prometheus.GaugeValue, float64(op.Discovered), tenant.String(), metricOperationPhase(op.Phase))
			ch <- prometheus.MustNewConstMetric(m.operationTimestamp, prometheus.GaugeValue, float64(op.LastProgressAt.Time.Unix()), tenant.String())
		}

		at := float64(0)
		if !s.at.IsZero() {
			at = float64(s.at.Unix())
		}
		healthy := float64(0)
		if s.healthy {
			healthy = 1
		}
		ch <- prometheus.MustNewConstMetric(m.snapshot, prometheus.GaugeValue, at, tenant.String())
		ch <- prometheus.MustNewConstMetric(m.healthy, prometheus.GaugeValue, healthy, tenant.String())
		for _, r := range s.rows {
			values := []float64{float64(r.Pending), float64(r.Due), float64(r.Claimed), float64(r.Retrying), 0, 0}
			if r.OldestPendingAt.Valid {
				values[4] = float64(r.OldestPendingAt.Time.Unix())
			}
			if r.OldestDueAt.Valid {
				values[5] = float64(r.OldestDueAt.Time.Unix())
			}
			for i, d := range []*prometheus.Desc{m.pending, m.due, m.claimed, m.retrying, m.oldestPending, m.oldestDue} {
				ch <- prometheus.MustNewConstMetric(d, prometheus.GaugeValue, values[i], tenant.String(), r.Family)
			}
		}
	}
}

// RefreshPage is called by one lifecycle-owned goroutine. Tenant queries have
// independent timeouts and errors preserve prior values with freshness exposed.
func (m *Metrics) RefreshPage(ctx context.Context, store database.Store) error {
	pagectx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	tenants, err := store.ListLeaderboardMetricTenants(servicetenant.AdminBypass(pagectx), m.after)
	if err != nil {
		m.collection.WithLabelValues("list_failed").Inc()
		return err
	}
	for _, tenant := range tenants {
		if pagectx.Err() != nil {
			return pagectx.Err()
		}
		tenantctx, stop := context.WithTimeout(servicetenant.WithTenantID(pagectx, tenant), 2*time.Second)
		rows, err := store.LeaderboardQueueDiagnostics(tenantctx, tenant)
		var operation []database.LeaderboardMetricOperationProgressRow
		if err == nil {
			operation, err = store.LeaderboardMetricOperationProgress(tenantctx, tenant)
		}
		stop()
		m.mu.Lock()
		previous := m.snapshots[tenant]
		previous.healthy = err == nil
		if err == nil {
			previous.rows = rows
			previous.operation = operation
			previous.at = time.Now()
		}
		m.snapshots[tenant] = previous
		m.mu.Unlock()
		outcome := "success"
		if err != nil {
			outcome = "failed"
		}
		m.collection.WithLabelValues(outcome).Inc()
		m.after = tenant
		m.seen[tenant] = true
	}
	if len(tenants) < 100 {
		m.mu.Lock()
		for tenant := range m.snapshots {
			if !m.seen[tenant] {
				delete(m.snapshots, tenant)
			}
		}
		m.mu.Unlock()
		m.after = uuid.Nil
		m.seen = map[uuid.UUID]bool{}
	}
	return nil
}
func (m *Metrics) event(tenant uuid.UUID, family, phase, outcome string, n int) {
	if m != nil && n > 0 {
		m.events.WithLabelValues(tenant.String(), family, phase, outcome).Add(float64(n))
	}
}
func (m *Metrics) elapsed(tenant uuid.UUID, family, phase string, start time.Time, err error) {
	if m != nil {
		outcome := "success"
		if err != nil {
			outcome = "failed"
		}
		m.duration.WithLabelValues(tenant.String(), family, phase, outcome).Observe(time.Since(start).Seconds())
	}
}

var metricFamilies = []string{"player_boss_benchmarks", "player_boss_subjects", "guild_boss_benchmarks", "guild_boss_subjects", "guild_clear_benchmarks", "guild_clear_subjects", "player_renown", "guild_renown", "variant_player_boss_benchmarks", "variant_player_boss_subjects", "variant_guild_boss_benchmarks", "variant_guild_boss_subjects"}

type metricScopeKey struct{}
type metricScope struct {
	metrics *Metrics
	tenant  uuid.UUID
	family  string
}

func withMetricScope(ctx context.Context, m *Metrics, tenant uuid.UUID, family string) context.Context {
	return context.WithValue(ctx, metricScopeKey{}, metricScope{m, tenant, family})
}
func observeMetricDuration(ctx context.Context, phase string, start time.Time, err error) {
	if s, ok := ctx.Value(metricScopeKey{}).(metricScope); ok {
		s.metrics.elapsed(s.tenant, s.family, phase, start, err)
	}
}
func observeMetricEvent(ctx context.Context, phase, outcome string, n int) {
	if s, ok := ctx.Value(metricScopeKey{}).(metricScope); ok {
		s.metrics.event(s.tenant, s.family, phase, outcome, n)
	}
}

type publicationOutcomeKey struct{}
type publicationOutcome struct{ published, fenced int }

func consumePublished(ctx context.Context, batch batchOne[bool]) error {
	var first error
	batch.QueryRow(func(_ int, published bool, err error) {
		if first == nil {
			first = err
		}
		if err == nil {
			if o, ok := ctx.Value(publicationOutcomeKey{}).(*publicationOutcome); ok {
				if published {
					o.published++
				} else {
					o.fenced++
				}
			}
		}
	})
	return errors.Join(first, batch.Close())
}
