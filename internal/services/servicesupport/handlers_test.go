package servicesupport

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/stretchr/testify/require"
)

func TestSupportAdminAndSummary(t *testing.T) {
	t.Parallel()

	db, _ := dbtestutil.NewDB(t)
	service := &Service{enabled: true, db: db}
	service.setupRoutes()

	settingsRequest := httptest.NewRequest(http.MethodPut, "/settings", strings.NewReader(`{
		"public_enabled": true,
		"currency": "usd",
		"monthly_goal_cents": 50000
	}`))
	settingsRecorder := httptest.NewRecorder()
	service.AdminRoutes().ServeHTTP(settingsRecorder, settingsRequest)
	require.Equal(t, http.StatusOK, settingsRecorder.Code, settingsRecorder.Body.String())

	createRequest := httptest.NewRequest(http.MethodPost, "/services", strings.NewReader(`{
		"provider": "patreon",
		"display_name": "Patreon",
		"public_url": "https://patreon.com/chronicle",
		"enabled": true,
		"received_cents": 12500,
		"recurring_cents": 10000
	}`))
	createRecorder := httptest.NewRecorder()
	service.AdminRoutes().ServeHTTP(createRecorder, createRequest)
	require.Equal(t, http.StatusCreated, createRecorder.Code, createRecorder.Body.String())

	summaryRequest := httptest.NewRequest(http.MethodGet, "/summary", nil)
	summaryRecorder := httptest.NewRecorder()
	service.PublicRoutes().ServeHTTP(summaryRecorder, summaryRequest)
	require.Equal(t, http.StatusOK, summaryRecorder.Code, summaryRecorder.Body.String())
	require.Equal(t, "public, max-age=300", summaryRecorder.Header().Get("Cache-Control"))

	var summary chroniclesdk.SupportSummary
	require.NoError(t, json.Unmarshal(summaryRecorder.Body.Bytes(), &summary))
	require.Equal(t, "USD", summary.Currency)
	require.Equal(t, int64(50000), summary.MonthlyGoalCents)
	require.Equal(t, int64(10000), summary.MonthlyRecurringCents)
	require.Equal(t, int64(12500), summary.ReceivedThisMonthCents)
	require.Equal(t, int64(40000), summary.RemainingMonthlyCents)
	require.Len(t, summary.Providers, 1)
	require.Equal(t, chroniclesdk.SupportProviderPatreon, summary.Providers[0].Provider)
}

func TestSupportSummaryCanBePrivate(t *testing.T) {
	t.Parallel()

	db, _ := dbtestutil.NewDB(t)
	service := &Service{enabled: true, db: db}
	service.setupRoutes()

	settingsRequest := httptest.NewRequest(http.MethodPut, "/settings", strings.NewReader(`{
		"public_enabled": false,
		"currency": "USD",
		"monthly_goal_cents": 0
	}`))
	settingsRecorder := httptest.NewRecorder()
	service.AdminRoutes().ServeHTTP(settingsRecorder, settingsRequest)
	require.Equal(t, http.StatusOK, settingsRecorder.Code, settingsRecorder.Body.String())

	summaryRecorder := httptest.NewRecorder()
	service.PublicRoutes().ServeHTTP(summaryRecorder, httptest.NewRequest(http.MethodGet, "/summary", nil))
	require.Equal(t, http.StatusNotFound, summaryRecorder.Code)
}

func TestValidateSupportServiceRequest(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		request chroniclesdk.CreateSupportServiceRequest
		wantErr bool
	}{
		{name: "valid", request: chroniclesdk.CreateSupportServiceRequest{Provider: chroniclesdk.SupportProviderManual, DisplayName: "Direct", PublicURL: "https://example.com"}},
		{name: "unknown provider", request: chroniclesdk.CreateSupportServiceRequest{Provider: "other", DisplayName: "Other"}, wantErr: true},
		{name: "missing name", request: chroniclesdk.CreateSupportServiceRequest{Provider: chroniclesdk.SupportProviderManual}, wantErr: true},
		{name: "invalid URL", request: chroniclesdk.CreateSupportServiceRequest{Provider: chroniclesdk.SupportProviderManual, DisplayName: "Direct", PublicURL: "/relative"}, wantErr: true},
		{name: "negative received", request: chroniclesdk.CreateSupportServiceRequest{Provider: chroniclesdk.SupportProviderManual, DisplayName: "Direct", ReceivedCents: -1}, wantErr: true},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			err := validateServiceRequest(test.request)
			if test.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}
