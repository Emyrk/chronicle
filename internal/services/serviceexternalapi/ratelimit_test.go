package serviceexternalapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/stretchr/testify/require"
)

func TestExternalIPLimiter(t *testing.T) {
	t.Parallel()

	limiter := newExternalIPLimiterWithConfig(1, 2)
	handler := limiter.middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	request := func(path, forwardedFor string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("X-Forwarded-For", forwardedFor)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}

	first := request("/openapi.json", "192.0.2.1")
	require.Equal(t, http.StatusNoContent, first.Code)
	require.Equal(t, "1", first.Header().Get("RateLimit-Limit"))
	require.Equal(t, "1", first.Header().Get("RateLimit-Remaining"))

	second := request("/openapi.json", "192.0.2.1")
	require.Equal(t, http.StatusNoContent, second.Code)
	require.Equal(t, "0", second.Header().Get("RateLimit-Remaining"))

	rejected := request("/openapi.json", "192.0.2.1")
	require.Equal(t, http.StatusTooManyRequests, rejected.Code)
	require.Equal(t, "1", rejected.Header().Get("Retry-After"))
	var response chroniclesdk.Response
	require.NoError(t, json.NewDecoder(rejected.Body).Decode(&response))
	require.Equal(t, "Rate limit exceeded.", response.Message)

	otherClient := request("/openapi.json", "192.0.2.2")
	require.Equal(t, http.StatusNoContent, otherClient.Code)

	healthHandler := limiter.statusMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	healthReq := httptest.NewRequest(http.MethodGet, "/api/external/v1/health", nil)
	healthReq.Header.Set("X-Forwarded-For", "192.0.2.1")
	health := httptest.NewRecorder()
	healthHandler.ServeHTTP(health, healthReq)
	require.Equal(t, http.StatusNoContent, health.Code)
	require.Equal(t, "1", health.Header().Get("RateLimit-Limit"))
	require.Equal(t, "0", health.Header().Get("RateLimit-Remaining"))

	stillRejected := request("/openapi.json", "192.0.2.1")
	require.Equal(t, http.StatusTooManyRequests, stillRejected.Code)
}

func TestExternalClientIP(t *testing.T) {
	t.Parallel()

	t.Run("forwarded", func(t *testing.T) {
		t.Parallel()
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("X-Forwarded-For", " 192.0.2.1, 198.51.100.2")
		require.Equal(t, "192.0.2.1", externalClientIP(req))
	})

	t.Run("remote address", func(t *testing.T) {
		t.Parallel()
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "192.0.2.3:1234"
		require.Equal(t, "192.0.2.3", externalClientIP(req))
	})
}
