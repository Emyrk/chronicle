package serviceseo_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/serviceseo"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

func tenant(slug string, discoverable bool) database.Tenant {
	return database.Tenant{Slug: pgtype.Text{String: slug, Valid: true}, Discoverable: discoverable}
}

// Tenant-owned pages are canonical on the owner's host only when search
// engines may index it; otherwise they keep the request host.
func TestCanonicalOwnerHost(t *testing.T) {
	t.Parallel()
	accessURL, err := url.Parse("https://legacy.chronicleclassic.com")
	require.NoError(t, err)
	canonical := serviceseo.NewCanonical(serviceseo.CanonicalOptions{
		SharedContentSlug: "forever",
		AccessURL:         accessURL,
		Tenant:            servicetenant.NewTestWithTenants(*accessURL, "chronicleclassic.com", tenant("open", true), tenant("hidden", false)),
	})
	ctx := context.Background()
	const requestHost = "legacy.chronicleclassic.com"

	require.Equal(t, "open.chronicleclassic.com", canonical.OwnerHost(ctx, "open", requestHost))
	require.Equal(t, requestHost, canonical.OwnerHost(ctx, "hidden", requestHost), "a non-discoverable owner keeps the request host")
	require.Equal(t, requestHost, canonical.OwnerHost(ctx, "", requestHost), "root-owned pages keep the request host")
	require.Equal(t, "uncached.chronicleclassic.com", canonical.OwnerHost(ctx, "uncached", requestHost), "an owner the cache does not know keeps its host")

	bare := serviceseo.NewCanonical(serviceseo.CanonicalOptions{})
	require.Equal(t, requestHost, bare.OwnerHost(ctx, "open", requestHost), "no primary domain, no tenant host")
}

func TestCanonicalSharedPages(t *testing.T) {
	t.Parallel()
	accessURL, err := url.Parse("http://legacy.chronicleclassic.com")
	require.NoError(t, err)
	canonical := serviceseo.NewCanonical(serviceseo.CanonicalOptions{
		SharedContentSlug: "forever",
		AccessURL:         accessURL,
		Tenant:            servicetenant.NewTestWithTenants(*accessURL, "chronicleclassic.com", tenant("forever", true)),
	})
	r := httptest.NewRequest(http.MethodGet, "http://legacy.chronicleclassic.com/privacy", nil)
	require.Equal(t, "http://forever.chronicleclassic.com/privacy", canonical.URL(r), "the scheme follows the access URL")

	shared := canonical.SharedPages(r)
	require.False(t, shared.IsCanonicalOn("legacy.chronicleclassic.com", "/privacy"))
	require.True(t, shared.IsCanonicalOn("forever.chronicleclassic.com", "/privacy"))
	require.True(t, shared.IsCanonicalOn("legacy.chronicleclassic.com", "/tools/developer-panels"), "shared paths match exactly")
	require.True(t, shared.IsCanonicalOn("legacy.chronicleclassic.com", "/recent"))

	r.Host = "bad host<"
	require.Equal(t, "legacy.chronicleclassic.com", canonical.RequestHost(r))
}

func TestCanonicalConfiguredHost(t *testing.T) {
	t.Parallel()
	accessURL, err := url.Parse("https://legacy.example.org")
	require.NoError(t, err)
	canonical := serviceseo.NewCanonical(serviceseo.CanonicalOptions{AccessURL: accessURL})
	for _, host := range []string{"", "bad host<", "host\"injection"} {
		t.Run(host, func(t *testing.T) {
			t.Parallel()
			r := httptest.NewRequest(http.MethodGet, "https://tenant.example.org/recent", nil)
			r.Host = host
			require.Equal(t, "legacy.example.org", canonical.RequestHost(r))
			require.Equal(t, "https://legacy.example.org/recent", canonical.URL(r))
			bare := serviceseo.NewCanonical(serviceseo.CanonicalOptions{})
			require.Empty(t, bare.RequestHost(r))
			require.Empty(t, bare.Origin(r))
			require.Empty(t, bare.URL(r))
		})
	}
	r := httptest.NewRequest(http.MethodGet, "https://tenant.example.org/recent", nil)
	require.Equal(t, "https://tenant.example.org/recent", canonical.URL(r))
}

func TestCanonicalSharedTenantConfiguration(t *testing.T) {
	t.Parallel()
	accessURL, err := url.Parse("https://legacy.example.org")
	require.NoError(t, err)
	tenants := servicetenant.NewTestWithTenants(*accessURL, "example.org", tenant("community", true), tenant("hidden", false))
	for _, slug := range []string{"community", "", "missing", "hidden"} {
		t.Run(slug, func(t *testing.T) {
			t.Parallel()
			canonical := serviceseo.NewCanonical(serviceseo.CanonicalOptions{
				AccessURL: accessURL, Tenant: tenants, SharedContentSlug: slug,
			})
			r := httptest.NewRequest(http.MethodGet, "https://legacy.example.org/privacy", nil)
			want := "https://legacy.example.org/privacy"
			if slug == "community" {
				want = "https://community.example.org/privacy"
				require.False(t, canonical.SharedPages(r).IsCanonicalOn("legacy.example.org", "/privacy"))
			}
			require.Equal(t, want, canonical.URL(r))
		})
	}
}
