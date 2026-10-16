package chronicle

import (
	"maps"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/require"
)

func TestLogParseMetricsProcessRole(t *testing.T) {
	t.Parallel()

	reg := prometheus.NewRegistry()
	metrics := newLogParseMetrics(reg, ParseProcessRoleParser)
	metrics.jobsTotal.WithLabelValues("success").Inc()
	metrics.jobsTotal.WithLabelValues("failure").Inc()
	metrics.jobDuration.Observe(2)
	metrics.parseDuration.Observe(1.5)

	families, err := reg.Gather()
	require.NoError(t, err)

	jobs := metricFamily(t, families, "chronicle_logparse_jobs_total")
	require.Len(t, jobs.Metric, 2)
	require.Equal(t, 1.0, counterValue(t, jobs, map[string]string{
		"process_role": ParseProcessRoleParser,
		"result":       "success",
	}))
	require.Equal(t, 1.0, counterValue(t, jobs, map[string]string{
		"process_role": ParseProcessRoleParser,
		"result":       "failure",
	}))

	duration := metricFamily(t, families, "chronicle_logparse_job_duration_seconds")
	require.Len(t, duration.Metric, 1)
	require.Equal(t, map[string]string{
		"process_role": ParseProcessRoleParser,
	}, metricLabels(duration.Metric[0]))
	require.Equal(t, uint64(1), duration.Metric[0].GetHistogram().GetSampleCount())
	require.Equal(t, 2.0, duration.Metric[0].GetHistogram().GetSampleSum())

	parseDuration := metricFamily(t, families, "chronicle_logparse_parse_duration_seconds")
	require.Len(t, parseDuration.Metric, 1)
	require.Equal(t, map[string]string{
		"process_role": ParseProcessRoleParser,
	}, metricLabels(parseDuration.Metric[0]))
	require.Equal(t, uint64(1), parseDuration.Metric[0].GetHistogram().GetSampleCount())
	require.Equal(t, 1.5, parseDuration.Metric[0].GetHistogram().GetSampleSum())
}

func TestLogParseMetricsDefaultsToServerRole(t *testing.T) {
	t.Parallel()

	reg := prometheus.NewRegistry()
	metrics := newLogParseMetrics(reg, "")
	metrics.jobsTotal.WithLabelValues("success").Inc()

	families, err := reg.Gather()
	require.NoError(t, err)
	jobs := metricFamily(t, families, "chronicle_logparse_jobs_total")
	require.Equal(t, 1.0, counterValue(t, jobs, map[string]string{
		"process_role": ParseProcessRoleServer,
		"result":       "success",
	}))
}

func metricFamily(t *testing.T, families []*dto.MetricFamily, name string) *dto.MetricFamily {
	t.Helper()
	for _, family := range families {
		if family.GetName() == name {
			return family
		}
	}
	t.Fatalf("metric family %q not found", name)
	return nil
}

func counterValue(t *testing.T, family *dto.MetricFamily, labels map[string]string) float64 {
	t.Helper()
	for _, metric := range family.Metric {
		if maps.Equal(labels, metricLabels(metric)) {
			return metric.GetCounter().GetValue()
		}
	}
	t.Fatalf("metric with labels %v not found", labels)
	return 0
}

func metricLabels(metric *dto.Metric) map[string]string {
	labels := make(map[string]string, len(metric.Label))
	for _, label := range metric.Label {
		labels[label.GetName()] = label.GetValue()
	}
	return labels
}
