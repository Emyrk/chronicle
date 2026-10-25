package billing

import (
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/require"
)

func TestMetricsObserveSuccessfulReconciliation(t *testing.T) {
	t.Parallel()

	metrics, err := NewMetrics(prometheus.NewRegistry())
	require.NoError(t, err)
	completedAt := time.Date(2026, time.October, 25, 1, 30, 0, 0, time.UTC)
	metrics.observeReconciliation("completed", completedAt, reconciliationCounts{
		entitlementCustomersFound:  3,
		entitlementCustomersSynced: 3,
	}, 0, 0)

	require.Equal(t, float64(1), metricValue(t, metrics.reconciliationRuns.WithLabelValues("completed")))
	require.Equal(t, float64(completedAt.Unix()), metricValue(t, metrics.reconciliationLastCompleted))
	require.Equal(t, float64(completedAt.Unix()), metricValue(t, metrics.reconciliationLastSuccess))
	require.Zero(t, metricValue(t, metrics.reconciliationSubscriptionErrors))
	require.Zero(t, metricValue(t, metrics.reconciliationEntitlementErrors))
	require.Equal(t, float64(3), metricValue(t, metrics.reconciliationCustomersFound))
	require.Equal(t, float64(3), metricValue(t, metrics.reconciliationCustomersSynced))
}

func metricValue(t testing.TB, metric prometheus.Metric) float64 {
	t.Helper()
	value := &dto.Metric{}
	require.NoError(t, metric.Write(value))
	if value.Counter != nil {
		return value.Counter.GetValue()
	}
	return value.Gauge.GetValue()
}
