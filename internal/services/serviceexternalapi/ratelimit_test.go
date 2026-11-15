package serviceexternalapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/internal/clientip"
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

func TestExternalIPLimiterCloudflare(t *testing.T) {
	t.Parallel()

	newHandler := func(trust bool) http.Handler {
		limiter := newExternalIPLimiterWithConfig(1, 1)
		limiter.clientIP = clientip.Resolver{TrustCloudflare: trust}
		return limiter.middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		}))
	}
	request := func(handler http.Handler, cfIP, forwardedFor string) int {
		req := httptest.NewRequest(http.MethodGet, "/openapi.json", nil)
		req.Header.Set("CF-Connecting-IP", cfIP)
		req.Header.Set("X-Forwarded-For", forwardedFor)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec.Code
	}

	t.Run("forged forwarded-for shares the cloudflare bucket", func(t *testing.T) {
		t.Parallel()
		handler := newHandler(true)
		require.Equal(t, http.StatusNoContent, request(handler, "203.0.113.7", "192.0.2.1"))
		require.Equal(t, http.StatusTooManyRequests, request(handler, "203.0.113.7", "192.0.2.99"))
		require.Equal(t, http.StatusNoContent, request(handler, "203.0.113.8", "192.0.2.1"))
	})

	t.Run("cloudflare header ignored when untrusted", func(t *testing.T) {
		t.Parallel()
		handler := newHandler(false)
		require.Equal(t, http.StatusNoContent, request(handler, "203.0.113.7", "192.0.2.1"))
		require.Equal(t, http.StatusTooManyRequests, request(handler, "203.0.113.8", "192.0.2.1"))
	})
}
