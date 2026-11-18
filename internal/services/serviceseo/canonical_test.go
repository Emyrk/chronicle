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
		AccessURL: accessURL,
		Tenant:    servicetenant.NewTestWithTenants(*accessURL, "chronicleclassic.com", tenant("open", true), tenant("hidden", false)),
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
		AccessURL: accessURL,
		Tenant:    servicetenant.NewTestWithTenants(*accessURL, "chronicleclassic.com", tenant(serviceseo.SharedContentSlug, true)),
	})
	r := httptest.NewRequest(http.MethodGet, "http://legacy.chronicleclassic.com/privacy", nil)
	require.Equal(t, "http://forever.chronicleclassic.com/privacy", canonical.URL(r), "the scheme follows the access URL")

	shared := canonical.SharedPages(r)
	require.False(t, shared.IsCanonicalOn("legacy.chronicleclassic.com", "/privacy"))
	require.True(t, shared.IsCanonicalOn("forever.chronicleclassic.com", "/privacy"))
	require.True(t, shared.IsCanonicalOn("legacy.chronicleclassic.com", "/tools/developer-panels"), "shared paths match exactly")
	require.True(t, shared.IsCanonicalOn("legacy.chronicleclassic.com", "/recent"))

	r.Host = "bad host<"
	require.Equal(t, "chronicleclassic.com", serviceseo.RequestHost(r))
}
