package api

import (
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func testSEOAPI(t *testing.T) *API {
	t.Helper()
	accessURL, err := url.Parse("https://chronicleclassic.com")
	require.NoError(t, err)
	return &API{Opts: &Options{
		AccessURL: accessURL,
		Tenant:    servicetenant.NewTestWithTenants(*accessURL, "chronicleclassic.com"),
	}}
}

func tenantSEORequest(t *testing.T, path string, discoverable bool) *http.Request {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "https://everlook.chronicleclassic.com"+path, nil)
	tenant := database.Tenant{
		Slug:         pgtype.Text{String: "everlook", Valid: true},
		Discoverable: discoverable,
		Branding:     []byte(`{"display_name":"Everlook","description":"Everlook raid analytics","favicon":"/favicon.ico","background_banner":"/banner.png"}`),
	}
	return req.WithContext(servicetenant.WithTenant(context.Background(), tenant))
}

func TestBrandingResolverTenantSEO(t *testing.T) {
	t.Parallel()
	api := testSEOAPI(t)

	metadata := api.brandingResolver(tenantSEORequest(t, "/recent?tab=all", true))
	require.Equal(t, "Everlook by Chronicle", metadata.Title)
	require.Equal(t, "Everlook", metadata.SiteName)
	require.Equal(t, "Everlook raid analytics", metadata.Description)
	require.Equal(t, "https://everlook.chronicleclassic.com/recent", metadata.CanonicalURL)
	require.Equal(t, "https://everlook.chronicleclassic.com/banner.png", metadata.ImageURL)
	require.Empty(t, metadata.Robots)
	require.JSONEq(t, `{"@context":"https://schema.org","@type":"WebSite","name":"Everlook","url":"https://everlook.chronicleclassic.com/","description":"Everlook raid analytics","image":"https://everlook.chronicleclassic.com/banner.png","publisher":{"@type":"Organization","name":"Chronicle","url":"https://chronicleclassic.com/"}}`, metadata.JSONLD)
}

func TestBrandingResolverGoogleAnalytics(t *testing.T) {
	t.Parallel()
	api := testSEOAPI(t)
	request := tenantSEORequest(t, "/recent", true)

	require.Empty(t, api.brandingResolver(request).GA4ID)

	api.Opts.GA4ID = "G-G0Q1B9GRC0"
	require.Equal(t, "G-G0Q1B9GRC0", api.brandingResolver(request).GA4ID)
}

func TestBrandingResolverNoIndex(t *testing.T) {
	t.Parallel()
	api := testSEOAPI(t)

	require.Equal(t, "noindex, nofollow", api.brandingResolver(tenantSEORequest(t, "/admin/users", true)).Robots)
	require.Equal(t, "noindex, nofollow", api.brandingResolver(tenantSEORequest(t, "/g/guild-id/edit", true)).Robots)
	require.Equal(t, "noindex, nofollow", api.brandingResolver(tenantSEORequest(t, "/made-up-route", true)).Robots)
	require.Empty(t, api.brandingResolver(tenantSEORequest(t, "/blog", true)).Robots)
	require.Empty(t, api.brandingResolver(tenantSEORequest(t, "/blog/instance-search", true)).Robots)
	require.Equal(t, "noindex, nofollow", api.brandingResolver(tenantSEORequest(t, "/recent", false)).Robots)
}

func TestBrandingResolverIndexablePaths(t *testing.T) {
	t.Parallel()
	api := testSEOAPI(t)

	indexable := []string{
		"/download", "/supported", "/search/guide", "/guilds", "/contact", "/privacy", "/terms",
		"/disclaimer", "/refund-policy",
		"/modules", "/modules/api", "/modules/someone", "/modules/someone/cool-panel",
		"/gear", "/gear/weights", "/gear/trends", "/gear/progression",
	}
	for _, path := range indexable {
		require.Empty(t, api.brandingResolver(tenantSEORequest(t, path, true)).Robots, path)
		// Non-discoverable tenants stay fully noindex.
		require.Equal(t, "noindex, nofollow", api.brandingResolver(tenantSEORequest(t, path, false)).Robots, path)
	}

	noIndex := []string{
		"/supported-instances",
		"/guilds/zzz-not-a-guild", "/download/extra", "/supported/extra", "/contact/extra", "/search",
		"/modules/new", "/modules/someone/cool-panel/edit",
		// Served by ID whether or not the project is published.
		"/modules/id/project-id", "/modules/id/project-id/edit",
		// Gear lists and progressions are shared by link.
		"/gear/lists/list-id", "/gear/lists", "/gear/progression/progression-id", "/gear/unknown",
	}
	for _, path := range noIndex {
		require.Equal(t, "noindex, nofollow", api.brandingResolver(tenantSEORequest(t, path, true)).Robots, path)
	}
}

func TestBrandingResolverNoIndexesUnlistedInstances(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	db := servicedbstore.DatabaseStore(broker)

	ownerID := uuid.New()
	serverID := uuid.New()
	realmID := uuid.New()
	logID := uuid.New()
	instanceID := uuid.New()
	const slug = "unlisted-seo-instance"

	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "unlisted-seo-owner-" + ownerID.String()})
	require.NoError(t, err)
	_, err = db.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: serverID, Name: "unlisted-seo-server-" + serverID.String()})
	require.NoError(t, err)
	_, err = db.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realmID, ServerID: serverID, Name: "Unlisted SEO Realm"})
	require.NoError(t, err)

	now := database.Timestamptz(time.Now())
	_, err = zed.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logID, Owner: ownerID, LogType: database.LogTypeV2, Unlisted: true,
		CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	require.NoError(t, zed.InsertParsedLogGroup(ctx, logID))
	_, err = zed.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logID, Name: "Molten Core",
		HashedSlug: pgtype.Text{String: slug, Valid: true}, Capabilities: []string{},
		DifficultyName: "Normal", MaxPlayers: 40,
	})
	require.NoError(t, err)

	api := testSEOAPI(t)
	api.Zed = zed
	for _, identifier := range []string{instanceID.String(), slug} {
		request := httptest.NewRequest(http.MethodGet, "https://everlook.chronicleclassic.com/instances/"+identifier, nil)
		request = request.WithContext(servicetenant.WithTenant(ctx, database.Tenant{Discoverable: true}))
		require.Equal(t, "noindex, nofollow", api.brandingResolver(request).Robots)
	}
}

func TestTenantRobotsAndSitemap(t *testing.T) {
	t.Parallel()
	api := testSEOAPI(t)

	robots := httptest.NewRecorder()
	api.robotsTXT(robots, tenantSEORequest(t, "/robots.txt", true))
	require.Equal(t, http.StatusOK, robots.Code)
	require.Contains(t, robots.Body.String(), "Disallow: /admin/")
	require.Contains(t, robots.Body.String(), "Sitemap: https://everlook.chronicleclassic.com/sitemap.xml")

	sitemap := httptest.NewRecorder()
	api.sitemapXML(sitemap, tenantSEORequest(t, "/sitemap.xml", true))
	require.Equal(t, http.StatusOK, sitemap.Code)
	require.Contains(t, sitemap.Body.String(), "<loc>https://everlook.chronicleclassic.com/leaderboards</loc>")
	require.Contains(t, sitemap.Body.String(), "https://everlook.chronicleclassic.com/leaderboards/statistics")
	require.Contains(t, sitemap.Body.String(), "https://everlook.chronicleclassic.com/wowdb")
	require.Contains(t, sitemap.Body.String(), "https://everlook.chronicleclassic.com/talents/warrior")
	require.Contains(t, sitemap.Body.String(), "https://everlook.chronicleclassic.com/blog")
	require.NotContains(t, sitemap.Body.String(), "/wowdb/item")
	require.NotContains(t, sitemap.Body.String(), "/wowdb/spell")

	hidden := httptest.NewRecorder()
	api.sitemapXML(hidden, tenantSEORequest(t, "/sitemap.xml", false))
	require.Equal(t, http.StatusNotFound, hidden.Code)
}

// The sitemap renders once per tenant and canonical host and is served from
// the cached bytes until the URL cache refreshes. Unknown Host headers reuse
// a canonical host's entry, so they cannot grow the cache.
func TestSitemapRenderedCache(t *testing.T) {
	t.Parallel()
	api := testSEOAPI(t)

	get := func(host, acceptEncoding string) *httptest.ResponseRecorder {
		t.Helper()
		req := tenantSEORequest(t, "/sitemap.xml", true)
		req.Host = host
		if acceptEncoding != "" {
			req.Header.Set("Accept-Encoding", acceptEncoding)
		}
		res := httptest.NewRecorder()
		api.sitemapXML(res, req)
		require.Equal(t, http.StatusOK, res.Code)
		return res
	}

	first := get("everlook.chronicleclassic.com", "")
	require.Empty(t, first.Header().Get("Content-Encoding"))
	require.Contains(t, first.Body.String(), "<loc>https://everlook.chronicleclassic.com/leaderboards</loc>")
	require.Equal(t, 1, api.sitemapRendered.renders)

	second := get("everlook.chronicleclassic.com", "")
	require.Equal(t, first.Body.Bytes(), second.Body.Bytes())
	require.Equal(t, 1, api.sitemapRendered.renders, "a second request serves the cached render")

	zipped := get("everlook.chronicleclassic.com", "br, gzip;q=0.8")
	require.Equal(t, "gzip", zipped.Header().Get("Content-Encoding"))
	require.Contains(t, zipped.Header().Values("Vary"), "Accept-Encoding")
	zr, err := gzip.NewReader(zipped.Body)
	require.NoError(t, err)
	unzipped, err := io.ReadAll(zr)
	require.NoError(t, err)
	require.Equal(t, first.Body.Bytes(), unzipped)
	require.Less(t, zipped.Body.Len(), first.Body.Len())

	require.Empty(t, get("everlook.chronicleclassic.com", "gzip;q=0").Header().Get("Content-Encoding"))
	require.Equal(t, 1, api.sitemapRendered.renders, "gzip is served from the same render")

	// Hosts that are not the tenant's canonical host get its sitemap.
	for i, host := range []string{"attacker.example", "everlook.chronicleclassic.com:8443", "EVERLOOK.chronicleclassic.com.evil"} {
		res := get(host, "")
		require.Equal(t, first.Body.Bytes(), res.Body.Bytes(), "host %d", i)
	}
	require.Equal(t, 1, api.sitemapRendered.renders)
	require.Len(t, api.sitemapRendered.entries, 1)

	// A refreshed URL load re-renders.
	refreshed := &sitemapDynamic{urls: []sitemapURL{{Location: "/g/refreshed"}}}
	key := sitemapRenderKey{tenant: uuid.Nil, host: "everlook.chronicleclassic.com"}
	rendered, err := api.sitemapRendered.get(key, refreshed, func() ([]byte, error) {
		return api.renderSitemap(tenantSEORequest(t, "/sitemap.xml", true), "https://everlook.chronicleclassic.com", refreshed)
	})
	require.NoError(t, err)
	require.Contains(t, string(rendered.raw), "https://everlook.chronicleclassic.com/g/refreshed")
	require.Equal(t, 2, api.sitemapRendered.renders)
}

// A slow render (including its database lookup) must not hold up cache hits
// or other tenants. A late render must also not replace a newer publication.
func TestSitemapRenderDoesNotBlockCache(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	var cache sitemapRenderCache
	key := sitemapRenderKey{tenant: uuid.New(), host: "one.example"}
	otherKey := sitemapRenderKey{tenant: uuid.New(), host: "two.example"}
	initial := &sitemapDynamic{}
	warm, err := cache.get(key, initial, func() ([]byte, error) { return []byte("initial"), nil })
	require.NoError(t, err)

	started := make(chan struct{})
	release := make(chan struct{})
	type result struct {
		rendered *sitemapRendered
		err      error
	}
	slowDone := make(chan result, 1)
	slowSource := &sitemapDynamic{}
	go func() {
		rendered, err := cache.get(key, slowSource, func() ([]byte, error) {
			close(started)
			<-release
			return []byte("slow"), nil
		})
		slowDone <- result{rendered, err}
	}()
	// Always release the worker, including on a failed assertion.
	defer func() {
		close(release)
		got := <-slowDone
		require.NoError(t, got.err)
		require.Equal(t, "slow", string(got.rendered.raw))
		cache.mu.Lock()
		defer cache.mu.Unlock()
		require.Equal(t, "newer", string(cache.entries[key].raw), "late render must not overwrite newer publication")
	}()
	select {
	case <-started:
	case <-ctx.Done():
		t.Fatal("slow render did not start")
	}

	newer := &sitemapDynamic{}
	fastDone := make(chan error, 1)
	go func() {
		_, err := cache.get(key, initial, func() ([]byte, error) {
			return nil, fmt.Errorf("cache hit unexpectedly rendered")
		})
		if err == nil {
			_, err = cache.get(otherKey, initial, func() ([]byte, error) { return []byte("other"), nil })
		}
		if err == nil {
			_, err = cache.get(key, newer, func() ([]byte, error) { return []byte("newer"), nil })
		}
		fastDone <- err
	}()
	select {
	case err := <-fastDone:
		require.NoError(t, err)
	case <-ctx.Done():
		t.Fatal("cache hit or independent render blocked behind slow render")
	}
	require.Equal(t, "initial", string(warm.raw), "published renders stay immutable")
}

func TestSitemapCanonicalHosts(t *testing.T) {
	t.Parallel()
	api := testSEOAPI(t)
	site := func(host string) *http.Request {
		req := httptest.NewRequest(http.MethodGet, "https://chronicleclassic.com/sitemap.xml", nil)
		req.Host = host
		return req
	}

	require.Equal(t, []string{"chronicleclassic.com"}, api.canonicalHosts(site("chronicleclassic.com")))
	require.Equal(t, "chronicleclassic.com", api.sitemapHost(site("anything.example")))

	legacy, err := url.Parse("https://legacy.chronicleclassic.com")
	require.NoError(t, err)
	api.Opts.AccessURL = legacy
	require.Equal(t, []string{"legacy.chronicleclassic.com", "chronicleclassic.com"}, api.canonicalHosts(site("chronicleclassic.com")))
	require.Equal(t, "chronicleclassic.com", api.sitemapHost(site("chronicleclassic.com")))
	require.Equal(t, "legacy.chronicleclassic.com", api.sitemapHost(site("legacy.chronicleclassic.com")))
	require.Equal(t, "legacy.chronicleclassic.com", api.sitemapHost(site("not-a-tenant.example")))

	require.Equal(t, []string{"everlook.chronicleclassic.com"}, api.canonicalHosts(tenantSEORequest(t, "/sitemap.xml", true)))
}

func TestAcceptsGzip(t *testing.T) {
	t.Parallel()
	for header, want := range map[string]bool{
		"": false, "gzip": true, "GZIP": true, "deflate, gzip;q=0.5": true, "br": false,
		"gzip;q=0": false, "gzip; q=0.0": false, "*": true, "identity": false,
	} {
		req := httptest.NewRequest(http.MethodGet, "/sitemap.xml", nil)
		if header != "" {
			req.Header.Set("Accept-Encoding", header)
		}
		require.Equal(t, want, acceptsGzip(req), header)
	}
}
