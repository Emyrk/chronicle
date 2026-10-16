package chronicle

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// logParseMetrics contains Prometheus metrics for log parsing job performance.
type logParseMetrics struct {
	jobsTotal        *prometheus.CounterVec
	jobDuration      prometheus.Histogram
	linesProcessed   prometheus.Counter
	instancesParsed  prometheus.Counter
	encountersParsed prometheus.Counter

	// Stage durations
	loadFileDuration prometheus.Histogram
	parseDuration    prometheus.Histogram
	finalizeDuration prometheus.Histogram
	dbInsertDuration prometheus.Histogram
}

const (
	ParseProcessRoleServer = "server"
	ParseProcessRoleParser = "parser"
)

// newLogParseMetrics creates metrics for log parsing with the given registerer.
// Every metric is labeled with the process role that executed the parse. If reg
// is nil, metrics are registered with an isolated registry for testing.
func newLogParseMetrics(reg prometheus.Registerer, processRole string) *logParseMetrics {
	if processRole == "" {
		processRole = ParseProcessRoleServer
	}
	if reg == nil {
		reg = prometheus.NewRegistry()
	}
	reg = prometheus.WrapRegistererWith(prometheus.Labels{"process_role": processRole}, reg)
	factory := promauto.With(reg)

	// Buckets for job durations (1s to 10min)
	jobBuckets := []float64{1, 5, 10, 30, 60, 120, 300, 600}
	// Buckets for stage durations (100ms to 5min)
	stageBuckets := []float64{0.1, 0.5, 1, 5, 10, 30, 60, 120, 300}

	return &logParseMetrics{
		jobsTotal: factory.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "logparse",
			Name:      "jobs_total",
			Help:      "Total log parse jobs by result (success, failure, cancelled)",
		}, []string{"result"}),

		jobDuration: factory.NewHistogram(prometheus.HistogramOpts{
			Namespace: "chronicle",
			Subsystem: "logparse",
			Name:      "job_duration_seconds",
			Help:      "Total job duration in seconds",
			Buckets:   jobBuckets,
		}),

		linesProcessed: factory.NewCounter(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "logparse",
			Name:      "lines_processed_total",
			Help:      "Total combat log lines processed",
		}),

		instancesParsed: factory.NewCounter(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "logparse",
			Name:      "instances_parsed_total",
			Help:      "Total instances (dungeons/raids) parsed",
		}),

		encountersParsed: factory.NewCounter(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "logparse",
			Name:      "encounters_parsed_total",
			Help:      "Total encounters (boss fights) parsed",
		}),

		loadFileDuration: factory.NewHistogram(prometheus.HistogramOpts{
			Namespace: "chronicle",
			Subsystem: "logparse",
			Name:      "load_file_duration_seconds",
			Help:      "Time spent loading and sorting log files",
			Buckets:   stageBuckets,
		}),

		parseDuration: factory.NewHistogram(prometheus.HistogramOpts{
			Namespace: "chronicle",
			Subsystem: "logparse",
			Name:      "parse_duration_seconds",
			Help:      "Time spent parsing combat log lines",
			Buckets:   stageBuckets,
		}),

		finalizeDuration: factory.NewHistogram(prometheus.HistogramOpts{
			Namespace: "chronicle",
			Subsystem: "logparse",
			Name:      "finalize_duration_seconds",
			Help:      "Time spent finalizing instances (encounter detection)",
			Buckets:   stageBuckets,
		}),

		dbInsertDuration: factory.NewHistogram(prometheus.HistogramOpts{
			Namespace: "chronicle",
			Subsystem: "logparse",
			Name:      "db_insert_duration_seconds",
			Help:      "Time spent inserting parsed data into database",
			Buckets:   stageBuckets,
		}),
	}
}
