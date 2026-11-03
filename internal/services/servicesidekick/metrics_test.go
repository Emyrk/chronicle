package servicesidekick

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/require"
)

func TestSidekickMetrics(t *testing.T) {
	t.Parallel()

	metrics, err := newSidekickMetrics(prometheus.NewRegistry())
	require.NoError(t, err)

	metrics.observeHeartbeat(sidekickHeartbeatResultSuccess, 100*time.Millisecond)
	metrics.observeHeartbeat(sidekickHeartbeatResultSuccess, 200*time.Millisecond)
	metrics.observeHeartbeat(sidekickHeartbeatResultBadRequest, 50*time.Millisecond)
	metrics.observeConfigUpdate()
	metrics.observeConfigUpdate()
	metrics.observeUpload(sidekickUploadKindNew)
	metrics.observeUpload(sidekickUploadKindAppend)
	metrics.observeUpload(sidekickUploadKindAppend)

	require.Equal(t, float64(2), sidekickCounterValue(t, metrics.heartbeats.WithLabelValues(sidekickHeartbeatResultSuccess)))
	require.Equal(t, float64(1), sidekickCounterValue(t, metrics.heartbeats.WithLabelValues(sidekickHeartbeatResultBadRequest)))
	require.Equal(t, uint64(2), sidekickHistogramCount(t, metrics.heartbeatTime.WithLabelValues(sidekickHeartbeatResultSuccess)))
	require.Equal(t, uint64(1), sidekickHistogramCount(t, metrics.heartbeatTime.WithLabelValues(sidekickHeartbeatResultBadRequest)))
	require.Equal(t, float64(2), sidekickCounterValue(t, metrics.configUpdates))
	require.Equal(t, float64(1), sidekickCounterValue(t, metrics.uploads.WithLabelValues(sidekickUploadKindNew)))
	require.Equal(t, float64(2), sidekickCounterValue(t, metrics.uploads.WithLabelValues(sidekickUploadKindAppend)))
}

func TestSidekickOnlineInstallations(t *testing.T) {
	t.Parallel()

	metrics, err := newSidekickMetrics(prometheus.NewRegistry())
	require.NoError(t, err)

	now := time.Date(2026, time.November, 3, 12, 0, 0, 0, time.UTC)
	metrics.now = func() time.Time { return now }
	first := uuid.New()
	second := uuid.New()
	metrics.observeOnline(first)
	metrics.observeOnline(second)
	metrics.observeOnline(first)
	require.Equal(t, float64(2), sidekickGaugeValue(t, metrics.online))

	now = now.Add(sidekickOnlineWindow)
	require.Equal(t, float64(0), sidekickGaugeValue(t, metrics.online))
}

func TestNewSidekickMetricsRejectsDuplicateRegistration(t *testing.T) {
	t.Parallel()

	registry := prometheus.NewRegistry()
	_, err := newSidekickMetrics(registry)
	require.NoError(t, err)
	_, err = newSidekickMetrics(registry)
	require.Error(t, err)
}

func sidekickCounterValue(t testing.TB, metric prometheus.Metric) float64 {
	t.Helper()
	value := &dto.Metric{}
	require.NoError(t, metric.Write(value))
	return value.GetCounter().GetValue()
}

func sidekickGaugeValue(t testing.TB, metric prometheus.Metric) float64 {
	t.Helper()
	value := &dto.Metric{}
	require.NoError(t, metric.Write(value))
	return value.GetGauge().GetValue()
}

func sidekickHistogramCount(t testing.TB, observer prometheus.Observer) uint64 {
	t.Helper()
	metric, ok := observer.(prometheus.Metric)
	require.True(t, ok)
	value := &dto.Metric{}
	require.NoError(t, metric.Write(value))
	return value.GetHistogram().GetSampleCount()
}
