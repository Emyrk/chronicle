package chronicle

import (
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/require"
)

func TestLogParseMetrics(t *testing.T) {
	t.Parallel()

	reg := prometheus.NewRegistry()
	metrics := newLogParseMetrics(reg)
	metrics.jobsTotal.WithLabelValues("success").Inc()
	metrics.linesProcessed.Add(100)
	metrics.instancesParsed.Add(2)
	metrics.encountersParsed.Add(5)
	metrics.instanceFailures.Inc()
	metrics.consumerDuration.WithLabelValues("parser").Observe((2 * time.Second).Seconds())

	require.Equal(t, float64(1), prometheusCounterValue(t, metrics.jobsTotal.WithLabelValues("success")))
	require.Equal(t, float64(100), prometheusCounterValue(t, metrics.linesProcessed))
	require.Equal(t, float64(2), prometheusCounterValue(t, metrics.instancesParsed))
	require.Equal(t, float64(5), prometheusCounterValue(t, metrics.encountersParsed))
	require.Equal(t, float64(1), prometheusCounterValue(t, metrics.instanceFailures))

	families, err := reg.Gather()
	require.NoError(t, err)
	require.Contains(t, metricFamilyNames(families), "chronicle_logparse_consumer_duration_seconds")
}

func prometheusCounterValue(t *testing.T, counter prometheus.Counter) float64 {
	t.Helper()
	metric := &dto.Metric{}
	require.NoError(t, counter.Write(metric))
	return metric.GetCounter().GetValue()
}

func metricFamilyNames(families []*dto.MetricFamily) []string {
	names := make([]string, 0, len(families))
	for _, family := range families {
		names = append(names, family.GetName())
	}
	return names
}
