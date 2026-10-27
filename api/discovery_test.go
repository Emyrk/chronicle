package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
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

func TestDiscoveryScopeAllFromTenant(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	db := servicedbstore.DatabaseStore(broker)

	insertTenant := func(name string, discoverable bool) database.Tenant {
		tenant, err := db.InsertTenant(ctx, database.InsertTenantParams{
			ID:               uuid.New(),
			Name:             name,
			Slug:             pgtype.Text{String: name, Valid: true},
			Branding:         []byte(`{"display_name":"` + name + `"}`),
			Discoverable:     discoverable,
			AvailableFormats: []string{},
		})
		require.NoError(t, err)
		return tenant
	}
	here := insertTenant("discovery-here", true)
	other := insertTenant("discovery-other", true)
	hidden := insertTenant("discovery-hidden", false)

	accessURL, err := url.Parse("https://chronicleclassic.com")
	require.NoError(t, err)
	api := &API{Opts: &Options{
		AccessURL: accessURL,
		Zed:       serviceauthz.Authz(broker),
		Tenant:    servicetenant.NewTest(*accessURL),
	}}

	discover := func(tenant database.Tenant, query string) map[string]bool {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/discovery"+query, nil)
		req = req.WithContext(servicetenant.WithTenant(ctx, tenant))
		rec := httptest.NewRecorder()
		api.Discovery(rec, req)
		require.Equal(t, http.StatusOK, rec.Code)

		var entries []chroniclesdk.DiscoveryEntry
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &entries))
		// Display name -> current flag.
		got := map[string]bool{}
		for _, e := range entries {
			got[e.Branding.DisplayName] = e.Current
		}
		return got
	}

	// Default: a tenant subdomain only describes itself.
	require.Equal(t, map[string]bool{"discovery-here": false}, discover(here, ""))

	// scope=all lists every discoverable tenant and flags the current one.
	all := discover(here, "?scope=all")
	require.True(t, all[here.Name])
	require.Contains(t, all, other.Name)
	require.False(t, all[other.Name])
	require.NotContains(t, all, hidden.Name)

	// A non-discoverable tenant still sees itself, flagged as current.
	fromHidden := discover(hidden, "?scope=all")
	require.True(t, fromHidden[hidden.Name])
	require.Contains(t, fromHidden, here.Name)
}
