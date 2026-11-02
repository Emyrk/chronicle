package chronauth

import (
	"net/http"
	"net/http/httptest"
	"net/url"
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

	metrics.observeSignup(authMethodDiscord, "turtle")
	metrics.observeSignup(authMethodEmailPassword, authTenantRoot)
	metrics.observeSignup(authMethodEmailPassword, authTenantRoot)
	metrics.observeLogin(authMethodDiscord, "turtle")
	metrics.observeLogin(authMethodEmailPassword, authTenantRoot)
	metrics.observeRefresh(authMethodDiscord, "turtle", nil)
	metrics.observeRefresh(authMethodDiscord, "turtle", assert.AnError)

	require.Equal(t, float64(1), authMetricValue(t, metrics.signups.WithLabelValues(authMethodDiscord, "turtle")))
	require.Equal(t, float64(2), authMetricValue(t, metrics.signups.WithLabelValues(authMethodEmailPassword, authTenantRoot)))
	require.Equal(t, float64(1), authMetricValue(t, metrics.logins.WithLabelValues(authMethodDiscord, "turtle")))
	require.Equal(t, float64(1), authMetricValue(t, metrics.logins.WithLabelValues(authMethodEmailPassword, authTenantRoot)))
	require.Equal(t, float64(1), authMetricValue(t, metrics.refreshes.WithLabelValues(authMethodDiscord, authResultSuccess, "turtle")))
	require.Equal(t, float64(1), authMetricValue(t, metrics.refreshes.WithLabelValues(authMethodDiscord, authResultError, "turtle")))
}

func TestAuthMetricTenant(t *testing.T) {
	t.Parallel()

	accessURL, err := url.Parse("https://chronicle.example.com")
	require.NoError(t, err)
	service := &Service{
		Store:     testCookieStore(t),
		accessURL: accessURL,
		tenantChecker: func(host string) *TenantInfo {
			if host == "turtle.chronicle.example.com" {
				return &TenantInfo{Slug: "turtle", Name: "Turtle WoW"}
			}
			return nil
		},
	}

	rootRequest := httptest.NewRequest(http.MethodGet, "https://chronicle.example.com/login", nil)
	require.Equal(t, authTenantRoot, service.authMetricTenant(rootRequest))

	tenantRequest := httptest.NewRequest(http.MethodGet, "https://turtle.chronicle.example.com/login", nil)
	require.Equal(t, "turtle", service.authMetricTenant(tenantRequest))

	startRequest := httptest.NewRequest(http.MethodGet, "https://chronicle.example.com/auth/discord", nil)
	redirect, err := service.Store.New(startRequest, "from")
	require.NoError(t, err)
	redirect.Values["from"] = "https://turtle.chronicle.example.com/raids"
	response := httptest.NewRecorder()
	require.NoError(t, redirect.Save(startRequest, response))

	callbackRequest := httptest.NewRequest(http.MethodGet, "https://chronicle.example.com/auth/discord/callback", nil)
	for _, cookie := range response.Result().Cookies() {
		callbackRequest.AddCookie(cookie)
	}
	require.Equal(t, "turtle", service.authMetricTenant(callbackRequest))
}

func authMetricValue(t testing.TB, metric prometheus.Metric) float64 {
	t.Helper()
	value := &dto.Metric{}
	require.NoError(t, metric.Write(value))
	return value.GetCounter().GetValue()
}
