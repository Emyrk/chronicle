package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
	"github.com/stretchr/testify/require"
)

func TestRecordUIUsage(t *testing.T) {
	t.Parallel()

	metrics := newUIUsageMetrics(prometheus.NewRegistry())
	api := &API{uiUsageMetrics: metrics}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/ui-usage", strings.NewReader(`{
		"preset":"summary",
		"selected":["lua","custom"],
		"panels":["damage_done","custom","lua","not-a-panel"]
	}`))
	request.Header.Set("Content-Type", "application/json")

	api.RecordUIUsage(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
	require.Equal(t, float64(1), counterValue(t, metrics.presetViews.WithLabelValues("summary")))
	require.Equal(t, float64(1), counterValue(t, metrics.panelChoices.WithLabelValues("lua", uiUsageRootTenant)))
	require.Equal(t, float64(1), counterValue(t, metrics.panelChoices.WithLabelValues("custom", uiUsageRootTenant)))
	require.Equal(t, float64(1), counterValue(t, metrics.panelViews.WithLabelValues("damage_done", uiUsageRootTenant)))
	require.Equal(t, float64(1), counterValue(t, metrics.panelViews.WithLabelValues("custom", uiUsageRootTenant)))
	require.Equal(t, float64(1), counterValue(t, metrics.panelViews.WithLabelValues("lua", uiUsageRootTenant)))
	require.Equal(t, float64(1), counterValue(t, metrics.panelViews.WithLabelValues("unknown", uiUsageRootTenant)))
}

func TestRecordUIUsageTenant(t *testing.T) {
	t.Parallel()

	metrics := newUIUsageMetrics(prometheus.NewRegistry())
	api := &API{uiUsageMetrics: metrics}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/ui-usage", strings.NewReader(`{
		"selected":["damage_done"],
		"panels":["healing_done"]
	}`))
	request.Header.Set("Content-Type", "application/json")
	request = request.WithContext(servicetenant.WithTenant(request.Context(), database.Tenant{
		Slug: pgtype.Text{String: "turtle", Valid: true},
	}))

	api.RecordUIUsage(recorder, request)

	require.Equal(t, http.StatusNoContent, recorder.Code)
	require.Equal(t, float64(1), counterValue(t, metrics.panelChoices.WithLabelValues("damage_done", "turtle")))
	require.Equal(t, float64(1), counterValue(t, metrics.panelViews.WithLabelValues("healing_done", "turtle")))
}

func TestRecordUIUsageBoundsPanelCount(t *testing.T) {
	t.Parallel()

	metrics := newUIUsageMetrics(prometheus.NewRegistry())
	api := &API{uiUsageMetrics: metrics}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/ui-usage", strings.NewReader(`{
		"panels":["damage_done","damage_done","damage_done","damage_done","damage_done","damage_done","damage_done","damage_done","damage_done"]
	}`))
	request.Header.Set("Content-Type", "application/json")

	api.RecordUIUsage(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Equal(t, float64(0), counterValue(t, metrics.panelViews.WithLabelValues("damage_done", uiUsageRootTenant)))
}

func TestRecordUIUsageBoundsSelectionCount(t *testing.T) {
	t.Parallel()

	metrics := newUIUsageMetrics(prometheus.NewRegistry())
	api := &API{uiUsageMetrics: metrics}
	selected := strings.Repeat(`"damage_done",`, maxUIUsageSelections) + `"damage_done"`
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/ui-usage", strings.NewReader(`{"selected":[`+selected+`]}`))
	request.Header.Set("Content-Type", "application/json")

	api.RecordUIUsage(recorder, request)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Equal(t, float64(0), counterValue(t, metrics.panelChoices.WithLabelValues("damage_done", uiUsageRootTenant)))
}

func counterValue(t testing.TB, metric prometheus.Metric) float64 {
	t.Helper()
	value := &dto.Metric{}
	require.NoError(t, metric.Write(value))
	return value.GetCounter().GetValue()
}
