package riverqueue

import (
	"context"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

func activeJobStates() []string {
	return []string{
		string(rivertype.JobStateAvailable),
		string(rivertype.JobStatePending),
		string(rivertype.JobStateRetryable),
		string(rivertype.JobStateRunning),
		string(rivertype.JobStateScheduled),
	}
}

type riverMetrics struct {
	jobsTotal          *prometheus.CounterVec
	queueWaitDuration  *prometheus.HistogramVec
	runDuration        *prometheus.HistogramVec
	completeDuration   *prometheus.HistogramVec
	fetchDuration      *prometheus.HistogramVec
	jobsFetched        *prometheus.CounterVec
	configuredWorkers  *prometheus.GaugeVec
	collectionFailures prometheus.Counter
}

func newRiverMetrics(reg prometheus.Registerer) *riverMetrics {
	if reg == nil {
		reg = prometheus.NewRegistry()
	}
	factory := promauto.With(reg)
	jobDurationBuckets := []float64{0.01, 0.1, 0.5, 1, 5, 15, 30, 60, 300, 900, 1800}

	return &riverMetrics{
		jobsTotal: factory.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "river",
			Name:      "jobs_total",
			Help:      "Total River job executions by queue, kind, and result",
		}, []string{"queue", "kind", "result"}),
		queueWaitDuration: factory.NewHistogramVec(prometheus.HistogramOpts{
			Namespace: "chronicle",
			Subsystem: "river",
			Name:      "job_queue_wait_duration_seconds",
			Help:      "Time River jobs spent waiting to start execution",
			Buckets:   []float64{0.01, 0.1, 0.5, 1, 5, 15, 30, 60, 300, 900, 3600},
		}, []string{"queue", "kind"}),
		runDuration: factory.NewHistogramVec(prometheus.HistogramOpts{
			Namespace: "chronicle",
			Subsystem: "river",
			Name:      "job_run_duration_seconds",
			Help:      "Time River jobs spent executing worker code",
			Buckets:   jobDurationBuckets,
		}, []string{"queue", "kind"}),
		completeDuration: factory.NewHistogramVec(prometheus.HistogramOpts{
			Namespace: "chronicle",
			Subsystem: "river",
			Name:      "job_complete_duration_seconds",
			Help:      "Time River spent persisting a job result after worker execution",
			Buckets:   []float64{0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5},
		}, []string{"queue", "kind"}),
		fetchDuration: factory.NewHistogramVec(prometheus.HistogramOpts{
			Namespace: "chronicle",
			Subsystem: "river",
			Name:      "job_fetch_duration_seconds",
			Help:      "Time River spent fetching and locking available jobs",
			Buckets:   []float64{0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5},
		}, []string{"queue"}),
		jobsFetched: factory.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "river",
			Name:      "jobs_fetched_total",
			Help:      "Total jobs fetched and locked by River workers",
		}, []string{"queue"}),
		configuredWorkers: factory.NewGaugeVec(prometheus.GaugeOpts{
			Namespace: "chronicle",
			Subsystem: "river",
			Name:      "configured_workers",
			Help:      "Configured maximum River workers by queue",
		}, []string{"queue"}),
		collectionFailures: factory.NewCounter(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "river",
			Name:      "queue_metrics_collection_failures_total",
			Help:      "Total failures while collecting River queue depth metrics from PostgreSQL",
		}),
	}
}

func (m *riverMetrics) hook() rivertype.Hook {
	return river.HookMetricEmitFunc(func(_ context.Context, params *rivertype.HookMetricEmitParams) {
		switch metric := params.Metric.(type) {
		case *rivertype.JobGetAvailableDurationMetric:
			m.fetchDuration.WithLabelValues(metric.Queue).Observe(metric.Duration.Seconds())
		case *rivertype.JobGetAvailableCountMetric:
			m.jobsFetched.WithLabelValues(metric.Queue).Add(float64(metric.Count))
		}
	})
}

func (m *riverMetrics) observeEvent(event *river.Event) {
	if event == nil || event.Job == nil || event.JobStats == nil {
		return
	}

	queue := event.Job.Queue
	kind := event.Job.Kind
	m.jobsTotal.WithLabelValues(queue, kind, riverEventResult(event)).Inc()
	m.queueWaitDuration.WithLabelValues(queue, kind).Observe(event.JobStats.QueueWaitDuration.Seconds())
	m.runDuration.WithLabelValues(queue, kind).Observe(event.JobStats.RunDuration.Seconds())
	m.completeDuration.WithLabelValues(queue, kind).Observe(event.JobStats.CompleteDuration.Seconds())
}

func riverEventResult(event *river.Event) string {
	switch event.Kind {
	case river.EventKindJobCompleted:
		return "completed"
	case river.EventKindJobCancelled:
		return "cancelled"
	case river.EventKindJobSnoozed:
		return "snoozed"
	case river.EventKindJobFailed:
		if event.Job.State == rivertype.JobStateDiscarded {
			return "discarded"
		}
		return "retryable"
	default:
		return "unknown"
	}
}

type riverQueueMetricsStore interface {
	ListRiverQueueMetrics(context.Context) ([]database.ListRiverQueueMetricsRow, error)
}

type riverQueueCollector struct {
	store   riverQueueMetricsStore
	logger  *slog.Logger
	metrics *riverMetrics
	queues  []string

	jobsDesc      *prometheus.Desc
	oldestAgeDesc *prometheus.Desc
}

func newRiverQueueCollector(store riverQueueMetricsStore, logger *slog.Logger, metrics *riverMetrics, queues []string) *riverQueueCollector {
	return &riverQueueCollector{
		store:   store,
		logger:  logger,
		metrics: metrics,
		queues:  queues,
		jobsDesc: prometheus.NewDesc(
			"chronicle_river_queue_jobs",
			"Current River jobs by queue and active state",
			[]string{"queue", "state"}, nil,
		),
		oldestAgeDesc: prometheus.NewDesc(
			"chronicle_river_queue_oldest_job_age_seconds",
			"Age of the oldest River job by queue and active state",
			[]string{"queue", "state"}, nil,
		),
	}
}

func (c *riverQueueCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- c.jobsDesc
	ch <- c.oldestAgeDesc
}

func (c *riverQueueCollector) Collect(ch chan<- prometheus.Metric) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	rows, err := c.store.ListRiverQueueMetrics(ctx)
	if err != nil {
		c.metrics.collectionFailures.Inc()
		c.logger.Debug("failed to collect River queue metrics", slog.Any("error", err))
		return
	}

	byQueueState := make(map[string]database.ListRiverQueueMetricsRow, len(rows))
	configuredQueues := make(map[string]struct{}, len(c.queues))
	for _, queue := range c.queues {
		configuredQueues[queue] = struct{}{}
	}
	for _, row := range rows {
		if _, ok := configuredQueues[row.Queue]; ok {
			byQueueState[row.Queue+"\x00"+row.State] = row
		}
	}
	states := activeJobStates()
	for _, queue := range c.queues {
		for _, state := range states {
			row := byQueueState[queue+"\x00"+state]
			ch <- prometheus.MustNewConstMetric(c.jobsDesc, prometheus.GaugeValue, float64(row.JobCount), queue, state)
			ch <- prometheus.MustNewConstMetric(c.oldestAgeDesc, prometheus.GaugeValue, row.OldestJobAgeSeconds, queue, state)
		}
	}
}
