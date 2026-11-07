package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOGRoutesFallsBackToStaticMetadata(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "https://octo.chronicleclassic.com/download", nil)
	for _, route := range (&API{Opts: &Options{}}).OGRoutes() {
		if route.Pattern != "/download" {
			continue
		}
		og := route.Resolve(req)
		require.Equal(t, "Chronicle Sidekick", og.Title)
		require.Equal(t, "https://octo.chronicleclassic.com/download", og.URL)
		require.Equal(t, "https://octo.chronicleclassic.com/c/images/og/sidekick.jpg", og.ImageURL)
		return
	}
	t.Fatal("no /download OG route")
}
