package frontend

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/require"
)

func TestAggregationWorkerPolicy(t *testing.T) {
	t.Parallel()
	h := Handler(fstest.MapFS{
		"index.html":                            &fstest.MapFile{Data: []byte(`<html>normal</html>`)},
		"assets/aggregationPanelWorker-hash.js": &fstest.MapFile{Data: []byte(`self.onmessage = () => {};`)},
		"assets/panelWorker-lua.js":             &fstest.MapFile{Data: []byte(`self.onmessage = () => {};`)},
	}, nil, nil, nil)
	for _, tc := range []struct {
		target  string
		enabled bool
	}{
		{"/assets/aggregationPanelWorker-hash.js", true},
		{"/assets/aggregationPanelWorker-hash.js?isolationTest=0", true},
		{"/assets/panelWorker-lua.js", false},
		{"/assets/aggregationPanelWorker-hash.js.map", false},
		{"/assets/other.js", false},
		{"/nested/assets/aggregationPanelWorker-hash.js", false},
		{"/instances/raid", false},
		{"/api/v1/instances/raid", false},
	} {
		t.Run(tc.target, func(t *testing.T) {
			t.Parallel()
			for _, method := range []string{http.MethodGet, http.MethodHead} {
				w := httptest.NewRecorder()
				h.ServeHTTP(w, httptest.NewRequest(method, tc.target, nil))
				if tc.enabled {
					require.Equal(t, http.StatusOK, w.Code)
					require.Equal(t, "require-corp", w.Header().Get("Cross-Origin-Embedder-Policy"))
					require.Contains(t, w.Header().Get("Content-Type"), "javascript")
				} else {
					require.Empty(t, w.Header().Get("Cross-Origin-Embedder-Policy"))
				}
				require.Empty(t, w.Header().Get("Cross-Origin-Opener-Policy"))
			}
		})
	}
}
