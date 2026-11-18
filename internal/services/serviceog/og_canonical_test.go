package serviceog

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// Guild and character pages are canonical on the host of the tenant that owns
// their realm, whichever host serves them, as instance pages already are.
// Pages owned by the root site stay on the request host.
func TestTenantOwnedCanonicalHost(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	// seedRealm creates a server and realm owned by the tenant with slug, or
	// by the root site when slug is empty.
	seedRealm := func(slug string) uuid.UUID {
		t.Helper()
		serverID, realmID := uuid.New(), uuid.New()
		var tenantID *uuid.UUID
		if slug != "" {
			id := uuid.New()
			tenantID = &id
			_, err := conn.Exec(ctx, "INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)", id, "tenant "+slug, slug)
			require.NoError(t, err)
		}
		_, err := conn.Exec(ctx, "INSERT INTO wow_servers (id, name, tenant_id) VALUES ($1, $2, $3)", serverID, "server "+serverID.String()[:8], tenantID)
		require.NoError(t, err)
		_, err = conn.Exec(ctx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realmID, serverID, "realm "+realmID.String()[:8])
		require.NoError(t, err)
		return realmID
	}
	seedPages := func(realmID uuid.UUID, playerGUID string) (guildID uuid.UUID) {
		t.Helper()
		guild, err := store.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realmID, Name: "Guild " + realmID.String()[:8], CreatedAt: database.Timestamptz(time.Now())})
		require.NoError(t, err)
		_, err = conn.Exec(ctx, `INSERT INTO game_players (id, realm_id, name, class, gender, race)
			VALUES ($1, $2, $3, 'WARRIOR', 'Male', 'Orc')`, playerGUID, realmID, "Hero"+realmID.String()[:4])
		require.NoError(t, err)
		return guild.ID
	}

	ownerSlug := "owner" + uuid.NewString()[:8]
	ownedRealm := seedRealm(ownerSlug)
	ownedGuild := seedPages(ownedRealm, "0x0000000000000061")
	rootRealm := seedRealm("")
	rootGuild := seedPages(rootRealm, "0x0000000000000062")
	conn.Release()

	accessURL, err := url.Parse("https://legacy.chronicleclassic.com")
	require.NoError(t, err)
	svc := New(Options{
		Zed:    authz.NewDatabaseOnly(testutil.Logger(t), store),
		Tenant: servicetenant.NewTestWithTenants(*accessURL, "chronicleclassic.com"),
	})
	request := func(host, path string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, path, nil).WithContext(ctx)
		r.Host = host
		return r
	}
	ownerHost := ownerSlug + ".chronicleclassic.com"

	for _, host := range []string{"legacy.chronicleclassic.com", ownerHost} {
		og := svc.guildOG(request(host, "/g/"+ownedGuild.String()), ownedGuild.String())
		require.NotNil(t, og)
		require.Equal(t, "https://"+ownerHost+"/g/"+ownedGuild.String(), og.URL, "guild served on %s", host)

		og = svc.armoryOG(request(host, "/armory/x/y"), ownedRealm.String(), "0x0000000000000061")
		require.NotNil(t, og)
		require.Equal(t, "https://"+ownerHost+"/armory/"+ownedRealm.String()+"/0x0000000000000061", og.URL, "character served on %s", host)
	}

	og := svc.guildOG(request("legacy.chronicleclassic.com", "/g/"+rootGuild.String()), rootGuild.String())
	require.NotNil(t, og)
	require.Equal(t, "https://legacy.chronicleclassic.com/g/"+rootGuild.String(), og.URL, "root-owned pages stay on the request host")

	og = svc.armoryOG(request("legacy.chronicleclassic.com", "/armory/x/y"), rootRealm.String(), "0x0000000000000062")
	require.NotNil(t, og)
	require.Equal(t, "https://legacy.chronicleclassic.com/armory/"+rootRealm.String()+"/0x0000000000000062", og.URL)

	// Without a primary domain there is no tenant host to point at.
	bare := New(Options{Zed: authz.NewDatabaseOnly(testutil.Logger(t), store)})
	og = bare.guildOG(request("legacy.chronicleclassic.com", "/g/"+ownedGuild.String()), ownedGuild.String())
	require.NotNil(t, og)
	require.Equal(t, "https://legacy.chronicleclassic.com/g/"+ownedGuild.String(), og.URL)
}

// Static pages every host serves identically are canonical on the
// shared-content tenant's host; other static pages stay on the request host.
func TestSharedStaticPageCanonical(t *testing.T) {
	t.Parallel()
	accessURL, err := url.Parse("https://legacy.chronicleclassic.com")
	require.NoError(t, err)
	forever := database.Tenant{Slug: pgtype.Text{String: servicetenant.SharedContentSlug, Valid: true}, Discoverable: true}
	svc := New(Options{AccessURL: accessURL, Tenant: servicetenant.NewTestWithTenants(*accessURL, "chronicleclassic.com", forever)})

	resolve := func(path string) string {
		for _, route := range svc.Routes() {
			if route.Pattern == path {
				r := httptest.NewRequest(http.MethodGet, "https://legacy.chronicleclassic.com"+path, nil)
				return route.Resolve(r).URL
			}
		}
		t.Fatalf("no OG route for %s", path)
		return ""
	}
	require.Equal(t, "https://forever.chronicleclassic.com/privacy", resolve("/privacy"))
	require.Equal(t, "https://forever.chronicleclassic.com/tools", resolve("/tools"))
	require.Equal(t, "https://legacy.chronicleclassic.com/recent", resolve("/recent"))
}
