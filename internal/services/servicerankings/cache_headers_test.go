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

	for _, tt := range []struct {
		name                string
		method              string
		wantCacheControl    string
		wantCloudflareCache string
	}{
		{
			name:                "GET responses are shared at the edge for fifteen minutes",
			method:              http.MethodGet,
			wantCacheControl:    "public, max-age=300",
			wantCloudflareCache: "public, max-age=900, stale-while-revalidate=60",
		},
		{
			name:   "non-GET responses are not cached",
			method: http.MethodPost,
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(tt.method, "/missing", nil)
			service.ServeHTTP(recorder, request)

			require.Equal(t, tt.wantCacheControl, recorder.Header().Get("Cache-Control"))
			require.Equal(t, tt.wantCloudflareCache, recorder.Header().Get("Cloudflare-CDN-Cache-Control"))
		})
	}
}
