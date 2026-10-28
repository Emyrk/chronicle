package api

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestBrowserOnlyMiddlewareAllowsOAuthCallbacks(t *testing.T) {
	t.Parallel()

	accessURL, err := url.Parse("https://chronicleclassic.com")
	require.NoError(t, err)

	handler := browserOnlyMiddleware(accessURL)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for _, path := range []string{discordInstallCallbackPath, openRouterCallbackPath} {
		t.Run(path, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequest(http.MethodGet, path, nil)
			req.Header.Set("Sec-Fetch-Site", "cross-site")
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			require.Equal(t, http.StatusOK, rec.Code)
		})
	}
}
