package frontend

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/internal/version"
)

func TestETagMiddlewareCachesStaticAssets(t *testing.T) {
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

	for _, test := range []struct {
		requestPath  string
		cacheControl string
	}{
		{requestPath: "/assets/app-hash.js", cacheControl: "public, max-age=86400"},
		{requestPath: "/assets/app-hash.css", cacheControl: "public, max-age=86400"},
		{requestPath: "/assets/inter-latin-400-normal-hash.woff2", cacheControl: "public, max-age=604800"},
		{requestPath: "/assets/legacy-font-hash.woff", cacheControl: "public, max-age=604800"},
	} {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, test.requestPath, nil))

		require.Equal(t, test.cacheControl, recorder.Header().Get("Cache-Control"), test.requestPath)
		require.NotEmpty(t, recorder.Header().Get("ETag"), test.requestPath)
	}
}
