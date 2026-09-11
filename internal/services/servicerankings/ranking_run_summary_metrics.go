package servicerankings

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

type rankingRunSummaryMetrics struct {
	queueDepth      prometheus.Gauge
	oldestDirtyAge  prometheus.Gauge
	rebuildDuration prometheus.Histogram
	failures        prometheus.Counter
	runsProcessed   prometheus.Counter
	runsRebuilt     prometheus.Counter
	runsDeleted     prometheus.Counter
	runsRetained    prometheus.Counter
}

func newRankingRunSummaryMetrics(reg prometheus.Registerer) *rankingRunSummaryMetrics {
	if reg == nil {
		reg = prometheus.NewRegistry()
	}
	factory := promauto.With(reg)
	return &rankingRunSummaryMetrics{
		queueDepth: factory.NewGauge(prometheus.GaugeOpts{
			Namespace: "chronicle",
			Subsystem: "rankings_run_summaries",
			Name:      "dirty_queue_depth",
			Help:      "Current number of dirty ranking runs awaiting summary rebuild.",
		}),
		oldestDirtyAge: factory.NewGauge(prometheus.GaugeOpts{
			Namespace: "chronicle",
			Subsystem: "rankings_run_summaries",
			Name:      "oldest_dirty_age_seconds",
			Help:      "Age in seconds of the oldest dirty ranking run, or zero when the queue is empty.",
		}),
		rebuildDuration: factory.NewHistogram(prometheus.HistogramOpts{
			Namespace: "chronicle",
			Subsystem: "rankings_run_summaries",
			Name:      "rebuild_duration_seconds",
			Help:      "Duration of ranking run summary rebuild worker invocations.",
			Buckets:   prometheus.DefBuckets,
		}),
		failures: factory.NewCounter(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "rankings_run_summaries",
			Name:      "rebuild_failures_total",
			Help:      "Total failed ranking run summary rebuild worker invocations.",
		}),
		runsProcessed: factory.NewCounter(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "rankings_run_summaries",
			Name:      "runs_processed_total",
			Help:      "Total dirty ranking runs processed by the rebuild worker.",
		}),
		runsRebuilt: factory.NewCounter(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "rankings_run_summaries",
			Name:      "runs_rebuilt_total",
			Help:      "Total ranking run summaries rebuilt by the worker.",
		}),
		runsDeleted: factory.NewCounter(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "rankings_run_summaries",
			Name:      "runs_deleted_total",
			Help:      "Total obsolete ranking run summaries deleted by the worker.",
		}),
		runsRetained: factory.NewCounter(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "rankings_run_summaries",
			Name:      "runs_retained_dirty_total",
			Help:      "Total ranking runs retained dirty after a generation changed during rebuild.",
		}),
	}
}
