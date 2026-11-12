package api

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"testing/fstest"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// The sitemap lists the tenant's listed raids, guilds and characters plus the
// blog posts its flavor serves, and nothing unlisted or from another tenant.
func TestSitemapDynamicURLs(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitLong)
	connURL := dbtestutil.NewConnectionURL(t)

	// Seed with RLS bypassed.
	seedCfg, err := pgxpool.ParseConfig(connURL)
	require.NoError(t, err)
	seedCfg.ConnConfig.RuntimeParams["app.tenant_bypass"] = "true"
	seedPool, err := pgxpool.NewWithConfig(ctx, seedCfg)
	require.NoError(t, err)
	t.Cleanup(seedPool.Close)
	seed := database.New(seedPool)

	ownerID := uuid.New()
	_, err = seed.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "sitemap-owner-" + ownerID.String()[:8]})
	require.NoError(t, err)

	// seedRealm creates a tenant with one server and realm.
	seedRealm := func(name string) (tenantID, realmID uuid.UUID) {
		t.Helper()
		tenantID, serverID, realmID := uuid.New(), uuid.New(), uuid.New()
		_, err := seedPool.Exec(ctx, "INSERT INTO tenants (id, name, include_in_all) VALUES ($1, $2, true)", tenantID, "sitemap-"+tenantID.String()[:8])
		require.NoError(t, err)
		_, err = seed.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: serverID, Name: "sitemap-server-" + serverID.String()[:8]})
		require.NoError(t, err)
		_, err = seedPool.Exec(ctx, "UPDATE wow_servers SET tenant_id = $1 WHERE id = $2", tenantID, serverID)
		require.NoError(t, err)
		_, err = seed.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realmID, ServerID: serverID, Name: name})
		require.NoError(t, err)
		return tenantID, realmID
	}
	// seedInstance uploads one parsed raid log.
	seedInstance := func(realmID uuid.UUID, slug string, unlisted bool, start time.Time) uuid.UUID {
		t.Helper()
		logID, instanceID := uuid.New(), uuid.New()
		now := database.Timestamptz(start)
		_, err := seed.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID: logID, Owner: ownerID, LogType: database.LogTypeV2, Unlisted: unlisted, CreatedAt: now, UpdatedAt: now,
		})
		require.NoError(t, err)
		require.NoError(t, seed.InsertParsedLogGroup(ctx, logID))
		_, err = seed.InsertInstance(ctx, database.InsertInstanceParams{
			ID: instanceID, RealmID: realmID, LogGroupID: logID, Name: "Molten Core",
			HashedSlug: pgtype.Text{String: slug, Valid: true}, Capabilities: []string{},
			DifficultyName: "Normal", MaxPlayers: 40,
			StartTime: database.Timestamptz(start), EndTime: database.Timestamptz(start.Add(time.Hour)),
		})
		require.NoError(t, err)
		return instanceID
	}
	seedCharacter := func(realmID uuid.UUID, guid, name string, fromInstance uuid.UUID) {
		t.Helper()
		_, err := seedPool.Exec(ctx, `INSERT INTO game_players (id, realm_id, name, class, gender, race, updated_from_instance)
			VALUES ($1, $2, $3, 'WARRIOR', 'Male', 'Orc', $4)`, guid, realmID, name, fromInstance)
		require.NoError(t, err)
	}
	seedGuild := func(realmID uuid.UUID) uuid.UUID {
		t.Helper()
		id := uuid.New()
		_, err := seedPool.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1, $2, $3)", id, realmID, "Guild "+id.String()[:8])
		require.NoError(t, err)
		return id
	}

	start := time.Date(2026, 10, 20, 20, 0, 0, 0, time.UTC)
	ourTenant, ourRealm := seedRealm("Sitemap Realm " + uuid.NewString()[:8])
	listed := seedInstance(ourRealm, "sitemap-listed-"+uuid.NewString()[:8], false, start)
	unlisted := seedInstance(ourRealm, "sitemap-unlisted-"+uuid.NewString()[:8], true, start.Add(time.Hour))
	ourGuild := seedGuild(ourRealm)
	seedCharacter(ourRealm, "0x0000000000000051", "Listedhero", listed)
	seedCharacter(ourRealm, "0x0000000000000052", "Hiddenhero", unlisted)

	_, theirRealm := seedRealm("Other Realm " + uuid.NewString()[:8])
	theirs := seedInstance(theirRealm, "sitemap-theirs-"+uuid.NewString()[:8], false, start.Add(2*time.Hour))
	theirGuild := seedGuild(theirRealm)

	var listedSlug, unlistedSlug, theirSlug string
	for id, slug := range map[uuid.UUID]*string{listed: &listedSlug, unlisted: &unlistedSlug, theirs: &theirSlug} {
		require.NoError(t, seedPool.QueryRow(ctx, "SELECT hashed_slug FROM log_instances WHERE id = $1", id).Scan(slug))
	}
	var realmName string
	require.NoError(t, seedPool.QueryRow(ctx, "SELECT name FROM wow_server_realms WHERE id = $1", ourRealm).Scan(&realmName))

	// Query as production does: app.tenant_id on the connection, as the chronicle role so RLS applies.
	cfg, err := pgxpool.ParseConfig(connURL)
	require.NoError(t, err)
	cfg.ConnConfig.RuntimeParams["app.tenant_id"] = ourTenant.String()
	cfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, "SET ROLE chronicle")
		return err
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	api := testSEOAPI(t)
	api.AppContext = ctx
	api.Opts.Logger = testutil.Logger(t)
	api.Opts.Zed = authz.NewDatabaseOnly(testutil.Logger(t), database.New(pool))

	// Pin the site's flavor with a tenant dataset. Without one it falls back to
	// the build's server identity, which differs by build tag (CI builds with
	// -tags azerothcore, a wrath build).
	dataset, err := seed.InsertDataset(ctx, database.InsertDatasetParams{
		Name: "Sitemap Turtle", Slug: "sitemap-turtle-" + uuid.NewString()[:8], WowVersion: "1.12.1",
		BuildVersion: 5875, DefaultFlavor: []string{"vanilla", "turtle"},
	})
	require.NoError(t, err)
	api.Opts.Dataset = servicedataset.NewTest(seed)

	request := func(discoverable bool) *http.Request {
		req := httptest.NewRequest(http.MethodGet, "https://everlook.chronicleclassic.com/sitemap.xml", nil)
		return req.WithContext(servicetenant.WithTenant(ctx, database.Tenant{
			ID: ourTenant, Slug: pgtype.Text{String: "everlook", Valid: true}, Discoverable: discoverable,
			DefaultDatasetID: uuid.NullUUID{UUID: dataset.ID, Valid: true},
		}))
	}

	// One post for every flavor, one bound to this site's flavor, one bound to another.
	siteFlavor := api.blogFlavorResolver(request(true))
	require.Equal(t, []string{"vanilla", "turtle"}, siteFlavor)
	manifest, err := json.Marshal(map[string]any{"posts": []map[string]any{
		{"path": "/blog/global", "flavor_sets": [][]string{}, "published_at": "2026-11-09"},
		{"path": "/blog/this-flavor", "flavor_sets": [][]string{siteFlavor}, "published_at": "2026-11-01"},
		{"path": "/blog/wrath-only", "flavor_sets": [][]string{{"wrath"}}, "published_at": "2026-10-01"},
	}})
	require.NoError(t, err)
	api.sitemapBlogFS = fstest.MapFS{"blog-manifest.json": &fstest.MapFile{Data: manifest}}

	res := httptest.NewRecorder()
	api.sitemapXML(res, request(true))
	require.Equal(t, http.StatusOK, res.Code, res.Body.String())

	var set sitemapURLSet
	require.NoError(t, xml.Unmarshal(res.Body.Bytes(), &set))
	lastmods := make(map[string]string, len(set.URLs))
	for _, u := range set.URLs {
		lastmods[u.Location] = u.LastMod
	}
	const base = "https://everlook.chronicleclassic.com"

	require.Contains(t, lastmods, base+"/leaderboards", "static paths stay")
	require.Equal(t, "2026-11-09", lastmods[base+"/blog/global"])
	require.Contains(t, lastmods, base+"/blog/this-flavor")
	require.NotContains(t, lastmods, base+"/blog/wrath-only", "a post bound to another flavor is excluded")

	require.Contains(t, lastmods, base+"/instances/"+listedSlug)
	require.NotEmpty(t, lastmods[base+"/instances/"+listedSlug])
	require.NotContains(t, lastmods, base+"/instances/"+unlistedSlug, "unlisted instances are excluded")
	require.NotContains(t, lastmods, base+"/instances/"+unlisted.String())
	require.NotContains(t, lastmods, base+"/instances/"+theirSlug, "another tenant's instances are excluded")

	require.Contains(t, lastmods, base+"/g/"+ourGuild.String())
	require.NotContains(t, lastmods, base+"/g/"+theirGuild.String())

	armory := base + "/armory/" + url.PathEscape(realmName) + "/"
	require.Contains(t, lastmods, armory+"0x0000000000000051")
	require.NotEmpty(t, lastmods[armory+"0x0000000000000051"])
	require.NotContains(t, lastmods, armory+"0x0000000000000052", "a character last seen in an unlisted log is excluded")

	hidden := httptest.NewRecorder()
	api.sitemapXML(hidden, request(false))
	require.Equal(t, http.StatusNotFound, hidden.Code, "a non-discoverable tenant has no sitemap")
}
