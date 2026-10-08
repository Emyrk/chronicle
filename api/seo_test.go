package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
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

func TestBrandingResolverNoIndex(t *testing.T) {
	t.Parallel()
	api := testSEOAPI(t)

	require.Equal(t, "noindex, nofollow", api.brandingResolver(tenantSEORequest(t, "/admin/users", true)).Robots)
	require.Equal(t, "noindex, nofollow", api.brandingResolver(tenantSEORequest(t, "/g/guild-id/edit", true)).Robots)
	require.Equal(t, "noindex, nofollow", api.brandingResolver(tenantSEORequest(t, "/made-up-route", true)).Robots)
	require.Equal(t, "noindex, nofollow", api.brandingResolver(tenantSEORequest(t, "/recent", false)).Robots)
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
	require.NotContains(t, sitemap.Body.String(), "/wowdb/item")
	require.NotContains(t, sitemap.Body.String(), "/wowdb/spell")

	hidden := httptest.NewRecorder()
	api.sitemapXML(hidden, tenantSEORequest(t, "/sitemap.xml", false))
	require.Equal(t, http.StatusNotFound, hidden.Code)
}
