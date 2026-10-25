package frontend

import (
	"bytes"
	"image"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/require"
)

func TestHandlerServesCroppedOGLoadingScreen(t *testing.T) {
	t.Parallel()

	handler := Handler(os.DirFS("chronicle/public"), nil, nil, nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(
		recorder,
		httptest.NewRequest(http.MethodGet, "/c/images/og/loadingscreens/LoadScreenBlackWingLair.jpg", nil),
	)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "image/jpeg", recorder.Header().Get("Content-Type"))
	require.Equal(t, "public, max-age=31536000, immutable", recorder.Header().Get("Cache-Control"))

	config, format, err := image.DecodeConfig(bytes.NewReader(recorder.Body.Bytes()))
	require.NoError(t, err)
	require.Equal(t, "jpeg", format)
	require.Equal(t, 512, config.Width)
	require.Equal(t, 341, config.Height)
}

func TestHandlerRedirectsLegacyYouTubeSyncRoutes(t *testing.T) {
	t.Parallel()

	siteFS := fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte(`<html></html>`)}}
	handler := Handler(siteFS, nil, nil, nil)

	for _, requestPath := range []string{
		"/youtube-sync",
		"/youtube-sync-v2?session=test-session",
	} {
		requestPath := requestPath
		t.Run(requestPath, func(t *testing.T) {
			t.Parallel()

			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, requestPath, nil))

			require.Equal(t, http.StatusMovedPermanently, recorder.Code)
			expectedLocation := "/youtube-sync-v3"
			if requestPath == "/youtube-sync-v2?session=test-session" {
				expectedLocation += "?session=test-session"
			}
			require.Equal(t, expectedLocation, recorder.Header().Get("Location"))
		})
	}
}

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
	}, nil)
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

func TestHandlerRouteMetadataOverridesSocialImage(t *testing.T) {
	t.Parallel()

	indexHTML, err := os.ReadFile("chronicle/index.html")
	require.NoError(t, err)
	siteFS := fstest.MapFS{"index.html": &fstest.MapFile{Data: indexHTML}}
	handler := Handler(siteFS, []OGRoute{{
		Pattern: "/instances/{id}",
		Resolve: func(_ *http.Request) *OGData {
			return &OGData{ImageURL: "https://everlook.example/molten-core.webp"}
		},
	}}, func(_ *http.Request) *HTMLBranding {
		return &HTMLBranding{ImageURL: "https://everlook.example/banner.png"}
	}, nil)

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/instances/example", nil))

	body := recorder.Body.String()
	require.Contains(t, body, `property="og:image" content="https://everlook.example/molten-core.webp"`)
	require.Contains(t, body, `name="twitter:image" content="https://everlook.example/molten-core.webp"`)
	require.NotContains(t, body, `content="https://everlook.example/banner.png"`)
}

func TestHandlerGoogleAnalyticsMetadata(t *testing.T) {
	t.Parallel()

	indexHTML, err := os.ReadFile("chronicle/index.html")
	require.NoError(t, err)
	siteFS := fstest.MapFS{"index.html": &fstest.MapFile{Data: indexHTML}}

	tests := []struct {
		name          string
		measurementID string
		shouldEmit    bool
	}{
		{name: "configured", measurementID: "G-G0Q1B9GRC0", shouldEmit: true},
		{name: "disabled", shouldEmit: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			handler := Handler(siteFS, nil, func(_ *http.Request) *HTMLBranding {
				return &HTMLBranding{GA4ID: test.measurementID}
			}, nil)
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))

			body := recorder.Body.String()
			if test.shouldEmit {
				require.Contains(t, body, "googletagmanager.com/gtag/js?id=G-G0Q1B9GRC0")
				require.Contains(t, body, "gtag('config', 'G-G0Q1B9GRC0', chronicleAttribution)")
			} else {
				require.NotContains(t, body, "googletagmanager.com/gtag/js")
				require.NotContains(t, body, "gtag('config'")
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
