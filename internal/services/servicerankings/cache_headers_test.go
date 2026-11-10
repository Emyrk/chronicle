package servicerankings

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
)

func TestRankingsCacheHeaders(t *testing.T) {
	t.Parallel()

	service := &Service{router: chi.NewRouter()}
	service.setupRoutes()
	service.router.Get("/cache-test", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	t.Run("successful GET responses share a common half-hour boundary", func(t *testing.T) {
		t.Parallel()

		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/cache-test", nil)
		service.ServeHTTP(recorder, request)

		require.Equal(t, "public, max-age=60", recorder.Header().Get("Cache-Control"))
		require.Contains(t, recorder.Header().Get("Cloudflare-CDN-Cache-Control"), "stale-while-revalidate=30")
		require.Equal(t, "leaderboards", recorder.Header().Get("Cache-Tag"))
	})

	t.Run("error responses are not cached", func(t *testing.T) {
		t.Parallel()

		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/missing", nil)
		service.ServeHTTP(recorder, request)

		require.Equal(t, http.StatusNotFound, recorder.Code)
		require.Empty(t, recorder.Header().Get("Cache-Control"))
		require.Empty(t, recorder.Header().Get("Cloudflare-CDN-Cache-Control"))
		require.Empty(t, recorder.Header().Get("Cache-Tag"))
	})
}
