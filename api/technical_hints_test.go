package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeTechnicalHintsStore struct {
	totals          database.TechnicalHintActivityTotalsRow
	mostActive      []database.TechnicalHintMostActiveInstancesRow
	totalsParams    database.TechnicalHintActivityTotalsParams
	mostParams      database.TechnicalHintMostActiveInstancesParams
	totalsCalls     int
	mostActiveCalls int
}

func (f *fakeTechnicalHintsStore) TechnicalHintActivityTotals(_ context.Context, params database.TechnicalHintActivityTotalsParams) (database.TechnicalHintActivityTotalsRow, error) {
	f.totalsCalls++
	f.totalsParams = params
	return f.totals, nil
}

func (f *fakeTechnicalHintsStore) TechnicalHintMostActiveInstances(_ context.Context, params database.TechnicalHintMostActiveInstancesParams) ([]database.TechnicalHintMostActiveInstancesRow, error) {
	f.mostActiveCalls++
	f.mostParams = params
	return f.mostActive, nil
}

func TestTechnicalHintsResponseAndCache(t *testing.T) {
	t.Parallel()

	store := &fakeTechnicalHintsStore{
		totals: database.TechnicalHintActivityTotalsRow{
			LogsProcessed: 4,
			InstanceRuns:  3,
		},
		mostActive: []database.TechnicalHintMostActiveInstancesRow{
			{InstanceName: "Molten Core", RunCount: 2},
		},
	}
	api := &API{technicalHintsStore: store}

	first := httptest.NewRecorder()
	api.TechnicalHints(first, httptest.NewRequest(http.MethodGet, "/api/v1/technical-hints", nil))
	second := httptest.NewRecorder()
	api.TechnicalHints(second, httptest.NewRequest(http.MethodGet, "/api/v1/technical-hints", nil))

	require.Equal(t, http.StatusOK, first.Code)
	require.Equal(t, technicalHintsCacheControl, first.Header().Get("Cache-Control"))
	require.Equal(t, 1, store.totalsCalls)
	require.Equal(t, 1, store.mostActiveCalls)
	require.JSONEq(t, first.Body.String(), second.Body.String())

	var response chroniclesdk.TechnicalHintsResponse
	require.NoError(t, json.Unmarshal(first.Body.Bytes(), &response))
	require.Equal(t, technicalHintsVersion, response.Version)
	require.Equal(t, response.GeneratedAt.Add(technicalHintsCacheTTL), response.RefreshAfter)
	require.Len(t, response.Payloads, 3)
	require.Equal(t, []string{
		"activity-logs-processed-24h",
		"activity-instance-runs-24h",
		"activity-most-active-instances-24h",
	}, []string{response.Payloads[0].ID, response.Payloads[1].ID, response.Payloads[2].ID})
	for _, payload := range response.Payloads {
		require.Equal(t, chroniclesdk.TechnicalHintKindCommunityFact, payload.Kind)
		require.NotEmpty(t, payload.Title)
		require.NotEmpty(t, payload.Body)
		require.NotNil(t, payload.GeneratedAt)
		require.NotNil(t, payload.ExpiresAt)
	}
}

func TestTechnicalHintsCacheIsTenantScoped(t *testing.T) {
	t.Parallel()

	store := &fakeTechnicalHintsStore{}
	api := &API{technicalHintsStore: store}
	for range 2 {
		tenant := database.Tenant{ID: uuid.New()}
		req := httptest.NewRequest(http.MethodGet, "/api/v1/technical-hints", nil)
		req = req.WithContext(servicetenant.WithTenant(req.Context(), tenant))
		api.TechnicalHints(httptest.NewRecorder(), req)
	}

	require.Equal(t, 2, store.totalsCalls)
	require.Equal(t, 2, store.mostActiveCalls)
}

func TestBuildDynamicTechnicalHintsOmitsEmptyFactsAndUses24HourWindow(t *testing.T) {
	t.Parallel()

	generatedAt := time.Date(2026, 10, 23, 16, 0, 0, 0, time.UTC)
	store := &fakeTechnicalHintsStore{}

	payloads, err := buildDynamicTechnicalHints(context.Background(), store, generatedAt)
	require.NoError(t, err)
	require.Empty(t, payloads)
	require.Equal(t, generatedAt.Add(-24*time.Hour), store.totalsParams.StartTime.Time)
	require.Equal(t, generatedAt, store.totalsParams.EndTime.Time)
	require.Equal(t, store.totalsParams.StartTime, store.mostParams.StartTime)
	require.Equal(t, store.totalsParams.EndTime, store.mostParams.EndTime)
	require.EqualValues(t, technicalHintsTopLimit, store.mostParams.LimitCount)
}

func TestMostActiveInstancesBodyOmitsZeroRows(t *testing.T) {
	t.Parallel()

	body := mostActiveInstancesBody([]database.TechnicalHintMostActiveInstancesRow{
		{InstanceName: "Molten Core", RunCount: 2},
		{InstanceName: "", RunCount: 5},
		{InstanceName: "Blackwing Lair", RunCount: 0},
	})
	require.Equal(t, "Molten Core (2 runs) in the last 24 hours.", body)
}
