package httpmw

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/require"
)

func TestPrometheusMWLabelsRequestsByTenant(t *testing.T) {
	t.Parallel()

	registry := prometheus.NewRegistry()
	router := chi.NewRouter()
	router.Use(PrometheusMW(registry, func(*http.Request) string { return "epoch" }))
	router.Get("/api/external/v1/raidlogs/recent", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/external/v1/raidlogs/recent", nil)
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusNoContent, response.Code)

	families, err := registry.Gather()
	require.NoError(t, err)
	for _, familyName := range []string{
		"chronicle_api_requests_processed_total",
		"chronicle_api_request_latencies_seconds",
	} {
		family := metricFamily(t, families, familyName)
		require.Len(t, family.Metric, 1)
		labels := make(map[string]string, len(family.Metric[0].Label))
		for _, label := range family.Metric[0].Label {
			labels[label.GetName()] = label.GetValue()
		}
		require.Equal(t, map[string]string{
			"method": http.MethodGet,
			"path":   "/api/external/v1/raidlogs/recent",
			"tenant": "epoch",
		}, labels)
	}
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
