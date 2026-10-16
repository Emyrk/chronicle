package riverqueue

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

type riverQueueMetricsStoreStub struct {
	rows []database.ListRiverQueueMetricsRow
	err  error
}

func (s riverQueueMetricsStoreStub) ListRiverQueueMetrics(context.Context) ([]database.ListRiverQueueMetricsRow, error) {
	return s.rows, s.err
}

func TestRiverMetricsObserveEvent(t *testing.T) {
	t.Parallel()

	reg := prometheus.NewRegistry()
	metrics := newRiverMetrics(reg)
	metrics.observeEvent(&river.Event{
		Kind: river.EventKindJobCompleted,
		Job: &rivertype.JobRow{
			Kind:  "log-parse",
			Queue: QueueLogParsing,
			State: rivertype.JobStateCompleted,
		},
		JobStats: &river.JobStatistics{
			QueueWaitDuration: 2 * time.Second,
			RunDuration:       5 * time.Second,
			CompleteDuration:  10 * time.Millisecond,
		},
	})

	require.Equal(t, float64(1), counterValue(t, metrics.jobsTotal.WithLabelValues(QueueLogParsing, "log-parse", "completed")))
	families, err := reg.Gather()
	require.NoError(t, err)
	require.Equal(t, uint64(1), histogramSampleCount(t, families, "chronicle_river_job_queue_wait_duration_seconds"))
	require.Equal(t, uint64(1), histogramSampleCount(t, families, "chronicle_river_job_run_duration_seconds"))
	require.Equal(t, uint64(1), histogramSampleCount(t, families, "chronicle_river_job_complete_duration_seconds"))
}

func TestRiverEventResult(t *testing.T) {
	t.Parallel()

	for _, tt := range []struct {
		name  string
		kind  river.EventKind
		state rivertype.JobState
		want  string
	}{
		{name: "completed", kind: river.EventKindJobCompleted, state: rivertype.JobStateCompleted, want: "completed"},
		{name: "cancelled", kind: river.EventKindJobCancelled, state: rivertype.JobStateCancelled, want: "cancelled"},
		{name: "snoozed", kind: river.EventKindJobSnoozed, state: rivertype.JobStateScheduled, want: "snoozed"},
		{name: "retryable", kind: river.EventKindJobFailed, state: rivertype.JobStateRetryable, want: "retryable"},
		{name: "discarded", kind: river.EventKindJobFailed, state: rivertype.JobStateDiscarded, want: "discarded"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			event := &river.Event{Kind: tt.kind, Job: &rivertype.JobRow{State: tt.state}}
			require.Equal(t, tt.want, riverEventResult(event))
		})
	}
}

func TestRiverQueueCollector(t *testing.T) {
	t.Parallel()

	reg := prometheus.NewRegistry()
	metrics := newRiverMetrics(reg)
	collector := newRiverQueueCollector(riverQueueMetricsStoreStub{rows: []database.ListRiverQueueMetricsRow{
		{Queue: QueueLogParsing, State: string(rivertype.JobStateAvailable), JobCount: 3, OldestJobAgeSeconds: 42},
		{Queue: "dynamic-user-queue", State: string(rivertype.JobStateAvailable), JobCount: 99, OldestJobAgeSeconds: 100},
	}}, slog.New(slog.NewTextHandler(io.Discard, nil)), metrics, []string{QueueLogParsing})
	require.NoError(t, reg.Register(collector))

	families, err := reg.Gather()
	require.NoError(t, err)
	require.Equal(t, float64(3), gaugeValue(t, families, "chronicle_river_queue_jobs", QueueLogParsing, string(rivertype.JobStateAvailable)))
	require.Equal(t, float64(42), gaugeValue(t, families, "chronicle_river_queue_oldest_job_age_seconds", QueueLogParsing, string(rivertype.JobStateAvailable)))
	require.Equal(t, float64(0), gaugeValue(t, families, "chronicle_river_queue_jobs", QueueLogParsing, string(rivertype.JobStateRunning)))
	require.False(t, metricHasLabelValue(families, "chronicle_river_queue_jobs", "dynamic-user-queue"))
}

func TestRiverQueueCollectorFailure(t *testing.T) {
	t.Parallel()

	reg := prometheus.NewRegistry()
	metrics := newRiverMetrics(reg)
	collector := newRiverQueueCollector(riverQueueMetricsStoreStub{err: errors.New("database unavailable")}, slog.New(slog.NewTextHandler(io.Discard, nil)), metrics, []string{QueueLogParsing})
	require.NoError(t, reg.Register(collector))

	_, err := reg.Gather()
	require.NoError(t, err)
	require.Equal(t, float64(1), counterValue(t, metrics.collectionFailures))
}

func counterValue(t *testing.T, counter prometheus.Counter) float64 {
	t.Helper()
	metric := &dto.Metric{}
	require.NoError(t, counter.Write(metric))
	return metric.GetCounter().GetValue()
}

func histogramSampleCount(t *testing.T, families []*dto.MetricFamily, name string) uint64 {
	t.Helper()
	for _, family := range families {
		if family.GetName() == name {
			return family.GetMetric()[0].GetHistogram().GetSampleCount()
		}
	}
	t.Fatalf("metric family %q not found", name)
	return 0
}

func metricHasLabelValue(families []*dto.MetricFamily, name, value string) bool {
	for _, family := range families {
		if family.GetName() != name {
			continue
		}
		for _, metric := range family.GetMetric() {
			for _, label := range metric.GetLabel() {
				if label.GetValue() == value {
					return true
				}
			}
		}
	}
	return false
}

func gaugeValue(t *testing.T, families []*dto.MetricFamily, name string, labelValues ...string) float64 {
	t.Helper()
	for _, family := range families {
		if family.GetName() != name {
			continue
		}
		for _, metric := range family.GetMetric() {
			labels := metric.GetLabel()
			if len(labels) != len(labelValues) {
				continue
			}
			matches := true
			for i, value := range labelValues {
				if labels[i].GetValue() != value {
					matches = false
					break
				}
			}
			if matches {
				return metric.GetGauge().GetValue()
			}
		}
	}
	t.Fatalf("metric family %q with labels %v not found", name, labelValues)
	return 0
}
