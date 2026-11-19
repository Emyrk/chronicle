package api

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"sync"
	"testing"
	"testing/fstest"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// canonicalDatasets serves datasets from memory.
type canonicalDatasets struct {
	servicedataset.DatasetStore
	byID map[uuid.UUID]database.Dataset
}

func (s canonicalDatasets) GetDataset(_ context.Context, id uuid.UUID) (database.Dataset, error) {
	return s.byID[id], nil
}

// canonicalPostHead is the prerendered blog post head: canonical, og:url and
// JSON-LD are filled in by the server.
const canonicalPostHead = `<!doctype html><html><head>
<!-- {{ if .CanonicalURL }} --><link rel="canonical" href="{{ .CanonicalURL }}" /><!-- {{ end }} -->
<!-- {{ if .CanonicalURL }} --><meta property="og:url" content="{{ .CanonicalURL }}" /><!-- {{ end }} -->
<!-- {{ if .JSONLD }} --><script type="application/ld+json">{{ .JSONLD }}</script><!-- {{ end }} -->
</head><body></body></html>`

type canonicalSite struct {
	api      *API
	siteFS   fstest.MapFS
	forever  database.Tenant
	everlook database.Tenant
}

// newCanonicalSite builds the root site at legacy.chronicleclassic.com with
// two tenants: forever (the shared-content home, vanilla) and everlook
// (vanilla + turtle). The blog has one post for every flavor and one only
// turtle sites serve.
func newCanonicalSite(t *testing.T, foreverDiscoverable bool) canonicalSite {
	t.Helper()
	vanilla, turtle := uuid.New(), uuid.New()
	forever := database.Tenant{
		ID: uuid.New(), Slug: pgtype.Text{String: "forever", Valid: true},
		Discoverable: foreverDiscoverable, DefaultDatasetID: uuid.NullUUID{UUID: vanilla, Valid: true},
	}
	everlook := database.Tenant{
		ID: uuid.New(), Slug: pgtype.Text{String: "everlook", Valid: true},
		Discoverable: true, DefaultDatasetID: uuid.NullUUID{UUID: turtle, Valid: true},
	}
	accessURL, err := url.Parse("https://legacy.chronicleclassic.com")
	require.NoError(t, err)

	manifest, err := json.Marshal(map[string]any{"posts": []map[string]any{
		{"path": "/blog/global", "title": "Global", "flavor_sets": [][]string{}, "published_at": "2026-11-09"},
		{"path": "/blog/turtle-only", "title": "Turtle", "flavor_sets": [][]string{{"turtle"}}, "published_at": "2026-11-01"},
	}})
	require.NoError(t, err)
	siteFS := fstest.MapFS{
		"index.html":            &fstest.MapFile{Data: []byte(`<html></html>`)},
		"blog-manifest.json":    &fstest.MapFile{Data: manifest},
		"blog/global.html":      &fstest.MapFile{Data: []byte(canonicalPostHead)},
		"blog/turtle-only.html": &fstest.MapFile{Data: []byte(canonicalPostHead)},
	}

	api := &API{Opts: &Options{
		SharedContentSlug: "forever",
		AccessURL:         accessURL,
		Tenant:            servicetenant.NewTestWithTenants(*accessURL, "chronicleclassic.com", forever, everlook),
		Dataset: servicedataset.NewTest(canonicalDatasets{byID: map[uuid.UUID]database.Dataset{
			vanilla: {ID: vanilla, DefaultFlavor: []string{"vanilla"}},
			turtle:  {ID: turtle, DefaultFlavor: []string{"vanilla", "turtle"}},
		}}),
	}}
	api.sitemapBlogFS = siteFS
	return canonicalSite{api: api, siteFS: siteFS, forever: forever, everlook: everlook}
}

func (s canonicalSite) request(tenant *database.Tenant, rawURL string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, rawURL, nil)
	if tenant != nil {
		r = r.WithContext(servicetenant.WithTenant(r.Context(), *tenant))
	}
	return r
}

// serve renders a page through the frontend handler and returns its
// canonical, og:url and JSON-LD nodes.
func (s canonicalSite) serve(t *testing.T, r *http.Request) (canonical, ogURL string, jsonLD []map[string]any) {
	t.Helper()
	handler := frontend.Handler(s.siteFS, nil, s.api.brandingResolver, s.api.blogFlavorResolver)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, r)
	require.Equal(t, http.StatusOK, res.Code, res.Body.String())
	body := res.Body.String()
	canonical = regexp.MustCompile(`<link rel="canonical" href="([^"]*)"`).FindStringSubmatch(body)[1]
	ogURL = regexp.MustCompile(`<meta property="og:url" content="([^"]*)"`).FindStringSubmatch(body)[1]
	script := regexp.MustCompile(`(?s)<script type="application/ld\+json">(.*?)</script>`).FindStringSubmatch(body)[1]
	require.NoError(t, json.Unmarshal([]byte(script), &jsonLD))
	return canonical, ogURL, jsonLD
}

// The optional OG service's fallback must use the same canonical policy as
// branding, since its URL replaces the branding canonical during rendering.
func TestSharedPageCanonicalWithFallbackOG(t *testing.T) {
	t.Parallel()
	for _, slug := range []string{"forever", "everlook", ""} {
		t.Run(slug, func(t *testing.T) {
			t.Parallel()
			site := newCanonicalSite(t, true)
			site.api.Opts.SharedContentSlug = slug
			require.Nil(t, site.api.Opts.OG)
			site.siteFS["index.html"] = &fstest.MapFile{Data: []byte(canonicalPostHead)}
			handler := frontend.Handler(site.siteFS, site.api.OGRoutes(), site.api.brandingResolver, site.api.blogFlavorResolver)
			for _, path := range []string{"/privacy", "/tools"} {
				r := site.request(&site.everlook, "https://everlook.chronicleclassic.com"+path)
				res := httptest.NewRecorder()
				handler.ServeHTTP(res, r)
				require.Equal(t, http.StatusOK, res.Code)
				host := "everlook.chronicleclassic.com"
				if slug != "" {
					host = slug + ".chronicleclassic.com"
				}
				want := "https://" + host + path
				require.Contains(t, res.Body.String(), `<link rel="canonical" href="`+want+`"`)
				require.Contains(t, res.Body.String(), `<meta property="og:url" content="`+want+`"`)
			}
		})
	}
}

func TestBlogPostCanonicalHost(t *testing.T) {
	t.Parallel()
	site := newCanonicalSite(t, true)

	t.Run("SharedPostOnTenantPointsAtForever", func(t *testing.T) {
		t.Parallel()
		canonical, ogURL, jsonLD := site.serve(t, site.request(&site.everlook, "https://everlook.chronicleclassic.com/blog/global"))
		require.Equal(t, "https://forever.chronicleclassic.com/blog/global", canonical)
		require.Equal(t, canonical, ogURL)
		require.Len(t, jsonLD, 2)
		require.Equal(t, "https://everlook.chronicleclassic.com/", jsonLD[0]["url"], "the WebSite entity stays the serving site")
		require.Equal(t, "BlogPosting", jsonLD[1]["@type"])
		require.Equal(t, canonical, jsonLD[1]["url"])
	})

	t.Run("PostForeverDoesNotServeStaysSelfCanonical", func(t *testing.T) {
		t.Parallel()
		canonical, ogURL, jsonLD := site.serve(t, site.request(&site.everlook, "https://everlook.chronicleclassic.com/blog/turtle-only"))
		require.Equal(t, "https://everlook.chronicleclassic.com/blog/turtle-only", canonical)
		require.Equal(t, canonical, ogURL)
		require.Equal(t, canonical, jsonLD[1]["url"])
	})

	t.Run("SharedPostOnForeverIsSelfCanonical", func(t *testing.T) {
		t.Parallel()
		canonical, _, _ := site.serve(t, site.request(&site.forever, "https://forever.chronicleclassic.com/blog/global"))
		require.Equal(t, "https://forever.chronicleclassic.com/blog/global", canonical)
	})

	t.Run("RootSite", func(t *testing.T) {
		t.Parallel()
		// The root (legacy) site resolves its canonical the same way. Its
		// branding needs a database, so check the URL directly.
		require.Equal(t, "https://forever.chronicleclassic.com/blog/global",
			site.api.canonical().URL(site.request(nil, "https://legacy.chronicleclassic.com/blog/global")))
		require.Equal(t, "https://legacy.chronicleclassic.com/blog",
			site.api.canonical().URL(site.request(nil, "https://legacy.chronicleclassic.com/blog")), "the blog index lists posts by flavor, so it is not shared")
		require.Equal(t, "https://forever.chronicleclassic.com/privacy",
			site.api.canonical().URL(site.request(nil, "https://legacy.chronicleclassic.com/privacy")))
		require.Equal(t, "https://legacy.chronicleclassic.com/recent",
			site.api.canonical().URL(site.request(nil, "https://legacy.chronicleclassic.com/recent")))
	})

	t.Run("UndiscoverableForeverIsNotCanonical", func(t *testing.T) {
		t.Parallel()
		hidden := newCanonicalSite(t, false)
		canonical, _, _ := hidden.serve(t, hidden.request(&hidden.everlook, "https://everlook.chronicleclassic.com/blog/global"))
		require.Equal(t, "https://everlook.chronicleclassic.com/blog/global", canonical)
		require.Equal(t, "https://legacy.chronicleclassic.com/privacy",
			hidden.api.canonical().URL(hidden.request(nil, "https://legacy.chronicleclassic.com/privacy")))
	})
}

// Each host's sitemap lists only the URLs canonical on that host.
func TestSitemapListsOnlySelfCanonicalURLs(t *testing.T) {
	t.Parallel()
	site := newCanonicalSite(t, true)

	locations := func(tenant *database.Tenant, base string) []string {
		t.Helper()
		raw, err := site.api.renderSitemap(site.request(tenant, base+"/sitemap.xml"), base, nil)
		require.NoError(t, err)
		var set sitemapURLSet
		require.NoError(t, xml.Unmarshal(raw, &set))
		locs := make([]string, 0, len(set.URLs))
		for _, u := range set.URLs {
			locs = append(locs, u.Location)
		}
		return locs
	}

	const legacy = "https://legacy.chronicleclassic.com"
	legacyLocs := locations(nil, legacy)
	require.NotContains(t, legacyLocs, legacy+"/blog/global", "a Forever-canonical post is left to Forever's sitemap")
	require.NotContains(t, legacyLocs, legacy+"/tools")
	require.Contains(t, legacyLocs, legacy+"/blog")
	require.Contains(t, legacyLocs, legacy+"/leaderboards")

	const everlook = "https://everlook.chronicleclassic.com"
	everlookLocs := locations(&site.everlook, everlook)
	require.NotContains(t, everlookLocs, everlook+"/blog/global")
	require.Contains(t, everlookLocs, everlook+"/blog/turtle-only", "a post Forever does not serve stays on its own host")

	const forever = "https://forever.chronicleclassic.com"
	foreverLocs := locations(&site.forever, forever)
	require.Contains(t, foreverLocs, forever+"/blog/global")
	require.Contains(t, foreverLocs, forever+"/tools")
	require.NotContains(t, foreverLocs, forever+"/blog/turtle-only")
}

// countingDatasets serves datasets from memory and counts lookups per ID.
type countingDatasets struct {
	servicedataset.DatasetStore
	byID  map[uuid.UUID]database.Dataset
	mu    *sync.Mutex
	calls map[uuid.UUID]int
}

func (s countingDatasets) GetDataset(_ context.Context, id uuid.UUID) (database.Dataset, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls[id]++
	return s.byID[id], nil
}

// A sitemap render resolves the shared-content tenant's flavor once, not once
// per blog post it checks.
func TestSitemapResolvesSharedContentOnce(t *testing.T) {
	t.Parallel()
	site := newCanonicalSite(t, true)
	home, own := site.forever.DefaultDatasetID.UUID, site.everlook.DefaultDatasetID.UUID
	datasets := countingDatasets{
		byID: map[uuid.UUID]database.Dataset{
			home: {ID: home, DefaultFlavor: []string{"vanilla"}},
			own:  {ID: own, DefaultFlavor: []string{"vanilla", "turtle"}},
		},
		mu:    &sync.Mutex{},
		calls: map[uuid.UUID]int{},
	}
	site.api.Opts.Dataset = servicedataset.NewTest(datasets)

	const everlook = "https://everlook.chronicleclassic.com"
	_, err := site.api.renderSitemap(site.request(&site.everlook, everlook+"/sitemap.xml"), everlook, nil)
	require.NoError(t, err)
	require.Equal(t, 1, datasets.calls[home], "the shared-content tenant's flavor")
	require.Equal(t, 1, datasets.calls[own], "the serving site's flavor, for its blog posts")
}

func TestCanonicalSharedTenantOverride(t *testing.T) {
	t.Parallel()
	site := newCanonicalSite(t, true)
	site.api.Opts.SharedContentSlug = "everlook"
	r := site.request(nil, "https://legacy.chronicleclassic.com/blog/turtle-only")
	require.Equal(t, "https://everlook.chronicleclassic.com/blog/turtle-only", site.api.canonical().URL(r))
	require.False(t, site.api.canonical().SharedPages(r).IsCanonicalOn("legacy.chronicleclassic.com", "/blog/turtle-only"))
	site.api.Opts.SharedContentSlug = ""
	require.Equal(t, "https://legacy.chronicleclassic.com/blog/turtle-only", site.api.canonical().URL(r))
}

func TestSitemapHostWithoutConfiguration(t *testing.T) {
	t.Parallel()
	api := &API{Opts: &Options{}}
	r := httptest.NewRequest(http.MethodGet, "https://arbitrary.example.org/sitemap.xml", nil)
	require.Empty(t, api.canonicalHosts(r), "unconfigured request hosts must not expand the sitemap cache key space")
	require.Empty(t, api.sitemapHost(r))
}
