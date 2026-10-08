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
			Description:  `Everlook "raid" <script>`,
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
	require.Contains(t, body, `content="Everlook &#34;raid&#34; &lt;script&gt;"`)
	require.NotContains(t, body, `Everlook "raid" <script>`)
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
			}, nil)
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

func TestHandlerBlogFlavorFiltering(t *testing.T) {
	t.Parallel()

	siteFS := fstest.MapFS{
		"index.html":            &fstest.MapFile{Data: []byte(`<html><body>home</body></html>`)},
		"blog/index.html":       &fstest.MapFile{Data: []byte(`<html><body>blog</body></html>`)},
		"blog/global.html":      &fstest.MapFile{Data: []byte(`<html><body>global</body></html>`)},
		"blog/turtle-only.html": &fstest.MapFile{Data: []byte(`<html><body>turtle</body></html>`)},
		"blog-manifest.json": &fstest.MapFile{Data: []byte(`{
			"posts": [
				{"path":"/blog/global","flavor_sets":[]},
				{"path":"/blog/turtle-only","flavor_sets":[["vanilla","turtle"]]}
			]
		}`)},
	}

	tests := []struct {
		name       string
		path       string
		flavor     []string
		statusCode int
		body       string
	}{
		{name: "blog index", path: "/blog", flavor: []string{"wrath"}, statusCode: http.StatusOK, body: "blog"},
		{name: "global post", path: "/blog/global", flavor: []string{"wrath"}, statusCode: http.StatusOK, body: "global"},
		{name: "matching post", path: "/blog/turtle-only", flavor: []string{"vanilla", "turtle"}, statusCode: http.StatusOK, body: "turtle"},
		{name: "missing flavor", path: "/blog/turtle-only", flavor: []string{"vanilla"}, statusCode: http.StatusNotFound},
		{name: "unknown post", path: "/blog/unknown", flavor: []string{"vanilla", "turtle"}, statusCode: http.StatusNotFound},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			handler := Handler(siteFS, nil, nil, func(_ *http.Request) []string {
				return test.flavor
			})
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, test.path, nil))

			require.Equal(t, test.statusCode, recorder.Code)
			if test.body != "" {
				require.Contains(t, recorder.Body.String(), test.body)
			}
		})
	}
}
