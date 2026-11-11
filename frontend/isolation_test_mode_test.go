package frontend

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/require"
)

func TestInstanceIsolationDocument(t *testing.T) {
	t.Parallel()
	h := Handler(fstest.MapFS{
		"index.html":      &fstest.MapFile{Data: []byte(`<html><meta name="robots" content="{{.Robots}}"></html>`)},
		"assets/probe.js": &fstest.MapFile{Data: []byte(`export {};`)},
	}, nil, nil, nil)
	for _, tc := range []struct {
		method, target string
		enabled        bool
	}{
		{"GET", "/instances/raid-slug?isolationTest=1", true},
		{"HEAD", "/instances/123?isolationTest=1&other=2", true},
		{"GET", "/instances/123?isolationTest=0", false},
		{"GET", "/instances/123?isolationTest=true", false},
		{"GET", "/instances/123?isolationTest=1&isolationTest=1", false},
		{"GET", "/instances/123", false},
		{"GET", "/instances/123/?isolationTest=1", false},
		{"GET", "/instances/123/replay?isolationTest=1", false},
		{"GET", "/instances/123.js?isolationTest=1", false},
		{"GET", "/instances/?isolationTest=1", false},
		{"GET", "/?isolationTest=1", false},
		{"GET", "/api/v1/instances/123?isolationTest=1", false},
		{"GET", "/assets/probe.js?isolationTest=1", false},
		{"POST", "/instances/123?isolationTest=1", false},
	} {
		t.Run(tc.method+tc.target, func(t *testing.T) {
			t.Parallel()
			w := httptest.NewRecorder()
			r := httptest.NewRequest(tc.method, tc.target, nil)
			r.Header.Set("If-None-Match", `"old-shell"`)
			h.ServeHTTP(w, r)
			if tc.enabled {
				require.Equal(t, http.StatusOK, w.Code)
				require.Equal(t, "same-origin", w.Header().Get("Cross-Origin-Opener-Policy"))
				require.Equal(t, "require-corp", w.Header().Get("Cross-Origin-Embedder-Policy"))
				require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
				require.Equal(t, "noindex, nofollow", w.Header().Get("X-Robots-Tag"))
				require.Empty(t, w.Header().Get("ETag"))
				if tc.method == "GET" {
					require.Contains(t, w.Body.String(), `content="noindex, nofollow"`)
				}
			} else {
				require.Empty(t, w.Header().Get("Cross-Origin-Opener-Policy"))
				require.Empty(t, w.Header().Get("Cross-Origin-Embedder-Policy"))
				require.Empty(t, w.Header().Get("X-Robots-Tag"))
				require.NotEqual(t, "no-store", w.Header().Get("Cache-Control"))
			}
		})
	}
}
