package frontend

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/require"
)

func TestHomeTenantSelectionAndPathGating(t *testing.T) {
	t.Parallel()
	manifest := homeManifest{
		Products: [][2]string{{"wow-forever", "WoW Forever"}, {"epoch", "Epoch Reborn"}},
		Pages: map[string]string{
			"generic-open":        "<h1>Generic open</h1>",
			"generic-closed":      "<h1>Generic closed</h1>",
			"generic-root-closed": "<h1>Generic choose community</h1>",
			"named-open":          "<h1>CHRONICLE_HOME_PRODUCT_TOKEN open</h1>",
			"named-closed":        "<h1>CHRONICLE_HOME_PRODUCT_TOKEN closed</h1>",
			"named-root-closed":   "<h1>CHRONICLE_HOME_PRODUCT_TOKEN choose community</h1>",
			"forever":             "<h1>Forever replay</h1>",
		},
	}
	data, err := json.Marshal(manifest)
	require.NoError(t, err)
	siteFS := fstest.MapFS{
		"index.html":         {Data: []byte(`<title>{{ .Title }}</title><div id="root"></div>`)},
		"blog/index.html":    {Data: []byte(`<h1>Blog retained</h1>`)},
		"home-manifest.json": {Data: data},
	}
	configs := map[string]*HomeConfig{
		"epoch.test":    {Flavor: []string{"epoch"}},
		"forever.test":  {Flavor: []string{"wow-forever"}, ForeverLandingEnabled: true},
		"disabled.test": {Flavor: []string{"wow-forever"}, UploadsDisabled: true},
		"root.test":     {Flavor: []string{"epoch"}, UploadsDisabled: true, RootUploadsDisabled: true},
		"unknown.test":  {Flavor: []string{"unrecognized"}},
	}
	handler := Handler(siteFS, nil, func(r *http.Request) *HTMLBranding {
		return &HTMLBranding{Title: "Existing SEO title", Home: configs[r.Host]}
	}, nil)
	for _, tc := range []struct{ host, path, want string }{
		{"epoch.test", "/", "Epoch Reborn open"},
		{"forever.test", "/?campaign=1", "Forever replay"},
		{"disabled.test", "/", "WoW Forever closed"},
		{"root.test", "/", "Epoch Reborn choose community"},
		{"unknown.test", "/", "Generic open"},
		{"epoch.test", "/download", `<div id="root"></div>`},
		{"forever.test", "/recent", `<div id="root"></div>`},
		{"forever.test", "/blog", "Blog retained"},
		{"forever.test", "/index.html", `<div id="root"></div>`},
	} {
		t.Run(tc.host+tc.path, func(t *testing.T) {
			t.Parallel()
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "https://"+tc.host+tc.path, nil))
			require.Equal(t, http.StatusOK, recorder.Code)
			require.Contains(t, recorder.Body.String(), tc.want)
			if tc.path != "/blog" {
				require.Contains(t, recorder.Body.String(), "Existing SEO title")
			}
		})
	}
}

func TestHomeBootstrapEscaping(t *testing.T) {
	t.Parallel()
	name := `</script><script>alert("x")</script>&{{ .Title }}`
	manifest := &homeManifest{Products: [][2]string{{"hostile", name}}, Pages: map[string]string{
		"named-open": "<h1>CHRONICLE_HOME_PRODUCT_TOKEN</h1>",
	}}
	markup, encoded := manifest.render(&HomeConfig{Flavor: []string{"hostile"}})
	require.NotContains(t, markup, "<script>")
	require.Contains(t, markup, "&lt;/script&gt;")
	require.NotContains(t, encoded, "</script>")
	var bootstrap homeBootstrap
	require.NoError(t, json.Unmarshal([]byte(encoded), &bootstrap))
	require.Equal(t, name, bootstrap.ProductName)

	data, err := json.Marshal(manifest)
	require.NoError(t, err)
	handler := Handler(fstest.MapFS{
		"index.html":         {Data: []byte(`<div id="root"></div>`)},
		"home-manifest.json": {Data: data},
	}, nil, func(*http.Request) *HTMLBranding {
		return &HTMLBranding{Title: "must not evaluate", Home: &HomeConfig{Flavor: []string{"hostile"}}}
	}, nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))
	require.NotContains(t, recorder.Body.String(), "<script>alert")
	require.Contains(t, recorder.Body.String(), "{{ .Title }}")
	require.NotContains(t, recorder.Body.String(), "must not evaluate")
}

func TestHomeManifestOptionalForDevelopment(t *testing.T) {
	t.Parallel()
	manifest, err := loadHomeManifest(fstest.MapFS{})
	require.NoError(t, err)
	markup, bootstrap := manifest.render(&HomeConfig{})
	require.Empty(t, markup)
	require.Empty(t, bootstrap)
}
