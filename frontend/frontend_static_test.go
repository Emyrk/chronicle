//go:build static

package frontend

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEmbeddedBlogPages(t *testing.T) {
	t.Parallel()

	handler := Handler(FS(), nil, nil, func(_ *http.Request) []string {
		return []string{"vanilla", "turtle"}
	})

	for _, requestPath := range []string{
		"/blog",
		"/blog/welcome-to-the-chronicle-blog",
		"/blog/replay-map-panel",
	} {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, requestPath, nil))
		require.Equal(t, http.StatusOK, recorder.Code, requestPath)
		require.Contains(t, recorder.Body.String(), "Chronicle Journal", requestPath)
	}
}
