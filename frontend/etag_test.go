package frontend

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/internal/version"
)

func TestETagMiddlewareCachesFontAssets(t *testing.T) {
	originalGitTag := version.GitTag
	originalGitCommit := version.GitCommit
	originalBuildTime := version.BuildTime
	version.GitTag = "v1.0.0"
	version.GitCommit = "commit"
	version.BuildTime = "build"
	t.Cleanup(func() {
		version.GitTag = originalGitTag
		version.GitCommit = originalGitCommit
		version.BuildTime = originalBuildTime
	})

	handler := etagMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for _, requestPath := range []string{
		"/assets/inter-latin-400-normal-hash.woff2",
		"/assets/legacy-font-hash.woff",
	} {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, requestPath, nil))

		require.Equal(t, "public, max-age=86400", recorder.Header().Get("Cache-Control"), requestPath)
		require.NotEmpty(t, recorder.Header().Get("ETag"), requestPath)
	}
}
