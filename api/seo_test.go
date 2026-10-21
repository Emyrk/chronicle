package api

import (
	"context"
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
	return &API{Opts: &Options{AccessURL: accessURL}}
}

func tenantSEORequest(t *testing.T, path string, discoverable bool) *http.Request {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "https://everlook.chronicleclassic.com"+path, nil)
	tenant := database.Tenant{
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
	require.Empty(t, api.brandingResolver(tenantSEORequest(t, "/guides/chronicle.onyxia", true)).Robots)
	require.Empty(t, api.brandingResolver(tenantSEORequest(t, "/guides/onyxia", true)).Robots)
	require.Equal(t, "noindex, nofollow", api.brandingResolver(tenantSEORequest(t, "/guides/unknown", true)).Robots)
	require.Equal(t, "noindex, nofollow", api.brandingResolver(tenantSEORequest(t, "/recent", false)).Robots)
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
	require.Contains(t, sitemap.Body.String(), "https://everlook.chronicleclassic.com/leaderboards/statistics")
	require.Contains(t, sitemap.Body.String(), "https://everlook.chronicleclassic.com/wowdb")
	require.Contains(t, sitemap.Body.String(), "https://everlook.chronicleclassic.com/talents/warrior")
	require.Contains(t, sitemap.Body.String(), "https://everlook.chronicleclassic.com/guides/chronicle.onyxia")
	require.NotContains(t, sitemap.Body.String(), "/wowdb/item")
	require.NotContains(t, sitemap.Body.String(), "/wowdb/spell")

	hidden := httptest.NewRecorder()
	api.sitemapXML(hidden, tenantSEORequest(t, "/sitemap.xml", false))
	require.Equal(t, http.StatusNotFound, hidden.Code)
}
