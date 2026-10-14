package update_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/update"
)

func TestNewer(t *testing.T) {
	t.Parallel()
	require.True(t, update.Newer("0.1.0", "0.1.1"))
	require.True(t, update.Newer("v0.9.0", "0.10.0"))
	require.False(t, update.Newer("0.2.0", "0.2.0"))
	require.False(t, update.Newer("0.3.0", "0.2.9"))
	require.False(t, update.Newer("dev", "9.9.9"))
}

func TestLatest(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`[
			{"tag_name":"v1.0.0","html_url":"x"},
			{"tag_name":"uploader/v0.3.0","html_url":"pre","prerelease":true},
			{"tag_name":"uploader/v0.2.0","html_url":"https://example/r"}]`))
	}))
	t.Cleanup(srv.Close)
	rel, ok, err := update.Latest(context.Background(), srv.Client(), srv.URL)
	require.NoError(t, err)
	require.True(t, ok)
	require.Equal(t, update.Release{Version: "0.2.0", URL: "https://example/r"}, rel)
}

func TestCheckerConditionalGET(t *testing.T) {
	t.Parallel()
	var full, notModified int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("If-None-Match") == `"v1"` {
			notModified++
			w.WriteHeader(http.StatusNotModified)
			return
		}
		full++
		w.Header().Set("ETag", `"v1"`)
		_, _ = w.Write([]byte(`[{"tag_name":"uploader/v0.2.0","html_url":"u"}]`))
	}))
	t.Cleanup(srv.Close)
	c := &update.Checker{Client: srv.Client(), URL: srv.URL}
	for i := 0; i < 2; i++ {
		rel, ok, err := c.Check(context.Background())
		require.NoError(t, err)
		require.True(t, ok)
		require.Equal(t, "0.2.0", rel.Version)
	}
	require.Equal(t, 1, full)
	require.Equal(t, 1, notModified)
}
