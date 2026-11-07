package aikey

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestIsBrowser(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "/instances/x", nil)
	require.False(t, IsBrowser(req))
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	require.True(t, IsBrowser(req))
	req = httptest.NewRequest(http.MethodGet, "/instances/x", nil)
	req.Header.Set("Sec-Fetch-Site", "none")
	require.True(t, IsBrowser(req))
}

func TestStripKey(t *testing.T) {
	t.Parallel()

	t.Run("Keyed", func(t *testing.T) {
		t.Parallel()
		req := httptest.NewRequest(http.MethodGet, "/instances/x?a=1&ai_key=ck_secret&ai%5Fkey=ck_other", nil)
		require.True(t, HasKey(req))
		rec := httptest.NewRecorder()
		w := StripKey(rec, req)
		require.Equal(t, "a=1", req.URL.RawQuery)
		require.NotContains(t, req.RequestURI, "ck_")
		w.Header().Set("Cache-Control", "public, max-age=60")
		w.WriteHeader(http.StatusOK)
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		require.Equal(t, "no-referrer", rec.Header().Get("Referrer-Policy"))
		require.Equal(t, "noindex", rec.Header().Get("X-Robots-Tag"))
	})

	t.Run("Unkeyed", func(t *testing.T) {
		t.Parallel()
		req := httptest.NewRequest(http.MethodGet, "/instances/x?a=1", nil)
		require.False(t, HasKey(req))
		rec := httptest.NewRecorder()
		require.Same(t, http.ResponseWriter(rec), StripKey(rec, req))
		require.Equal(t, "a=1", req.URL.RawQuery)
	})
}
