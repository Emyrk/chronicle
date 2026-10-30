package chronicle

import (
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/require"
)

func TestAccountMetricsObserveDeletion(t *testing.T) {
	t.Parallel()

	metrics := newAccountMetrics(prometheus.NewRegistry())
	metrics.observeDeletion()
	metrics.observeDeletion()

	require.Equal(t, float64(2), prometheusCounterValue(t, metrics.deleted))
}
