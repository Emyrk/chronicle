package frontend

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/require"
)

func TestHandlerRendersSEOMetadata(t *testing.T) {
	t.Parallel()

	indexHTML, err := os.ReadFile("chronicle/index.html")
	require.NoError(t, err)
	siteFS := fstest.MapFS{"index.html": &fstest.MapFile{Data: indexHTML}}
	handler := Handler(siteFS, nil, func(_ *http.Request) *HTMLBranding {
		return &HTMLBranding{
			Title:        "Everlook by Chronicle",
			SiteName:     "Everlook",
			Description:  "Everlook raid analytics",
			CanonicalURL: "https://everlook.example/recent",
			ImageURL:     "https://everlook.example/banner.png",
			Robots:       "noindex, nofollow",
			JSONLD:       `{"@context":"https://schema.org","@type":"WebSite"}`,
		}
	})
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/recent", nil))

	body := recorder.Body.String()
	require.Contains(t, body, `<link rel="canonical" href="https://everlook.example/recent"`)
	require.Contains(t, body, `property="og:image" content="https://everlook.example/banner.png"`)
	require.Contains(t, body, `name="robots" content="noindex, nofollow"`)
	require.Equal(t, "noindex, nofollow", recorder.Header().Get("X-Robots-Tag"))
	require.Contains(t, body, `type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite"}</script>`)
}

func TestHandlerAdSenseVerificationMetadata(t *testing.T) {
	t.Parallel()

	indexHTML, err := os.ReadFile("chronicle/index.html")
	require.NoError(t, err)
	siteFS := fstest.MapFS{
		"index.html": &fstest.MapFile{Data: indexHTML},
	}

	tests := []struct {
		name       string
		clientID   string
		shouldEmit bool
	}{
		{name: "enabled", clientID: "ca-pub-8208259743822818", shouldEmit: true},
		{name: "disabled", shouldEmit: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			handler := Handler(siteFS, nil, func(_ *http.Request) *HTMLBranding {
				if test.clientID == "" {
					return nil
				}
				return &HTMLBranding{AdSenseClientID: test.clientID}
			})
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))

			if test.shouldEmit {
				require.Contains(t, recorder.Body.String(), `name="google-adsense-account" content="ca-pub-8208259743822818"`)
			} else {
				require.NotContains(t, recorder.Body.String(), "google-adsense-account")
			}
		})
	}
}
