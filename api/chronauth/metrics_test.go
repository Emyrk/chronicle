package chronauth

import (
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAuthMetrics(t *testing.T) {
	t.Parallel()

	metrics, err := newAuthMetrics(prometheus.NewRegistry())
	require.NoError(t, err)

	metrics.observeSignup(authMethodDiscord)
	metrics.observeSignup(authMethodEmailPassword)
	metrics.observeSignup(authMethodEmailPassword)
	metrics.observeLogin(authMethodDiscord)
	metrics.observeLogin(authMethodEmailPassword)
	metrics.observeRefresh(authMethodDiscord, nil)
	metrics.observeRefresh(authMethodDiscord, assert.AnError)

	require.Equal(t, float64(1), authMetricValue(t, metrics.signups.WithLabelValues(authMethodDiscord)))
	require.Equal(t, float64(2), authMetricValue(t, metrics.signups.WithLabelValues(authMethodEmailPassword)))
	require.Equal(t, float64(1), authMetricValue(t, metrics.logins.WithLabelValues(authMethodDiscord)))
	require.Equal(t, float64(1), authMetricValue(t, metrics.logins.WithLabelValues(authMethodEmailPassword)))
	require.Equal(t, float64(1), authMetricValue(t, metrics.refreshes.WithLabelValues(authMethodDiscord, authResultSuccess)))
	require.Equal(t, float64(1), authMetricValue(t, metrics.refreshes.WithLabelValues(authMethodDiscord, authResultError)))
}

func authMetricValue(t testing.TB, metric prometheus.Metric) float64 {
	t.Helper()
	value := &dto.Metric{}
	require.NoError(t, metric.Write(value))
	return value.GetCounter().GetValue()
}
