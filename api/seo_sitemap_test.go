package api

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
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

// The sitemap lists the tenant's substantial raids, guilds and characters plus
// the blog posts its flavor serves, and nothing thin, unlisted or from another
// tenant. Hubs that list instances or posts carry the newest one's lastmod.
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
	// instanceOpts describes one seeded instance log. The zero value is a
	// listed hour-long clear with one boss kill and three players.
	type instanceOpts struct {
		unlisted bool
		minutes  int // default 60
		noKill   bool
		players  int // default 3, counting characters
		chars    []string
		guild    uuid.NullUUID
	}
	fillerGUID := 0x1000
	seedInstance := func(realmID uuid.UUID, slug string, start time.Time, o instanceOpts) uuid.UUID {
		t.Helper()
		if o.minutes == 0 {
			o.minutes = 60
		}
		if o.players == 0 {
			o.players = 3
		}
		logID, instanceID := uuid.New(), uuid.New()
		now := database.Timestamptz(start)
		_, err := seed.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID: logID, Owner: ownerID, LogType: database.LogTypeV2, Unlisted: o.unlisted, CreatedAt: now, UpdatedAt: now,
		})
		require.NoError(t, err)
		require.NoError(t, seed.InsertParsedLogGroup(ctx, logID))
		end := start.Add(time.Duration(o.minutes) * time.Minute)
		_, err = seed.InsertInstance(ctx, database.InsertInstanceParams{
			ID: instanceID, RealmID: realmID, LogGroupID: logID, Name: "Molten Core", GuildID: o.guild,
			HashedSlug: pgtype.Text{String: slug, Valid: true}, Capabilities: []string{},
			DifficultyName: "Normal", MaxPlayers: 40,
			StartTime: database.Timestamptz(start), EndTime: database.Timestamptz(end),
		})
		require.NoError(t, err)
		killType := "clean"
		if o.noKill {
			killType = "wipe"
		}
		_, err = seedPool.Exec(ctx, `INSERT INTO log_instance_encounters (id, instance_id, name, remaining, boss, start_time, end_time, kill_type)
			VALUES ($1, $2, 'Lucifron', '{}', true, $3, $4, $5)`, uuid.New(), instanceID, start, end, killType)
		require.NoError(t, err)
		guids := append([]string{}, o.chars...)
		for len(guids) < o.players {
			fillerGUID++
			guids = append(guids, fmt.Sprintf("0x%016X", fillerGUID))
		}
		for _, guid := range guids {
			_, err = seedPool.Exec(ctx, `INSERT INTO log_instance_players (instance_id, unit_guid, name, level, class, race)
				VALUES ($1, $2, 'Player', 60, 'WARRIOR', 'Orc')`, instanceID, guid)
			require.NoError(t, err)
		}
		return instanceID
	}
	seedCharacter := func(realmID uuid.UUID, guid, name, class string, fromInstance uuid.UUID, updatedAt time.Time) {
		t.Helper()
		_, err := seedPool.Exec(ctx, `INSERT INTO game_players (id, realm_id, name, class, gender, race, updated_from_instance, updated_at)
			VALUES ($1, $2, $3, $4, 'Male', 'Orc', $5, $6)`, guid, realmID, name, class, fromInstance, updatedAt)
		require.NoError(t, err)
	}
	seedGuild := func(realmID uuid.UUID, page bool) uuid.UUID {
		t.Helper()
		id := uuid.New()
		_, err := seedPool.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1, $2, $3)", id, realmID, "Guild "+id.String()[:8])
		require.NoError(t, err)
		if page {
			_, err = seed.UpsertGuildPage(ctx, database.UpsertGuildPageParams{GuildID: id, Theme: []byte("{}")})
			require.NoError(t, err)
		}
		return id
	}
	slug := func(name string) string { return "sitemap-" + name + "-" + uuid.NewString()[:8] }

	const (
		richHero    = "0x0000000000000051" // known class, three listed instances, seen today
		hiddenHero  = "0x0000000000000052" // last seen in an unlisted log
		fewHero     = "0x0000000000000053" // only two listed instances
		staleHero   = "0x0000000000000054" // not seen for 100 days
		unknownHero = "0x0000000000000055" // unknown class
	)
	start := time.Date(2026, 10, 20, 20, 0, 0, 0, time.UTC)
	nowTime := time.Now()
	ourTenant, ourRealm := seedRealm("Sitemap Realm " + uuid.NewString()[:8])
	ourGuild := seedGuild(ourRealm, true)    // edited page, no runs
	busyGuild := seedGuild(ourRealm, false)  // three listed runs
	quietGuild := seedGuild(ourRealm, false) // two listed runs
	busy := uuid.NullUUID{UUID: busyGuild, Valid: true}
	quiet := uuid.NullUUID{UUID: quietGuild, Valid: true}

	everyone := []string{richHero, fewHero, staleHero, unknownHero}
	listed := seedInstance(ourRealm, slug("listed"), start, instanceOpts{chars: everyone, guild: busy})
	listed2 := seedInstance(ourRealm, slug("listed2"), start.Add(-24*time.Hour), instanceOpts{chars: everyone, guild: busy})
	listed3 := seedInstance(ourRealm, slug("listed3"), start.Add(-48*time.Hour), instanceOpts{chars: []string{richHero, staleHero, unknownHero}, guild: busy})
	quiet1 := seedInstance(ourRealm, slug("quiet1"), start.Add(-72*time.Hour), instanceOpts{guild: quiet})
	quiet2 := seedInstance(ourRealm, slug("quiet2"), start.Add(-96*time.Hour), instanceOpts{guild: quiet})
	unlisted := seedInstance(ourRealm, slug("unlisted"), start.Add(time.Hour), instanceOpts{unlisted: true, chars: []string{hiddenHero}})
	noKill := seedInstance(ourRealm, slug("nokill"), start.Add(-time.Hour), instanceOpts{noKill: true})
	short := seedInstance(ourRealm, slug("short"), start.Add(-2*time.Hour), instanceOpts{minutes: 5})
	tiny := seedInstance(ourRealm, slug("tiny"), start.Add(-3*time.Hour), instanceOpts{players: 2})
	seedCharacter(ourRealm, richHero, "Richhero", "WARRIOR", listed, nowTime)
	seedCharacter(ourRealm, hiddenHero, "Hiddenhero", "WARRIOR", unlisted, nowTime)
	seedCharacter(ourRealm, fewHero, "Fewhero", "WARRIOR", listed, nowTime)
	seedCharacter(ourRealm, staleHero, "Stalehero", "WARRIOR", listed, nowTime.Add(-100*24*time.Hour))
	seedCharacter(ourRealm, unknownHero, "Unknownhero", "UNKNOWN", listed, nowTime)

	_, theirRealm := seedRealm("Other Realm " + uuid.NewString()[:8])
	theirs := seedInstance(theirRealm, slug("theirs"), start.Add(2*time.Hour), instanceOpts{})
	theirGuild := seedGuild(theirRealm, true)

	slugs := make(map[uuid.UUID]string)
	for _, id := range []uuid.UUID{listed, listed2, listed3, quiet1, quiet2, unlisted, noKill, short, tiny, theirs} {
		var s string
		require.NoError(t, seedPool.QueryRow(ctx, "SELECT hashed_slug FROM log_instances WHERE id = $1", id).Scan(&s))
		slugs[id] = s
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

	require.Contains(t, lastmods, base+"/talents", "static paths stay")
	require.Empty(t, lastmods[base+"/"], "truly static pages carry no lastmod")
	require.Empty(t, lastmods[base+"/talents"])
	require.Equal(t, "2026-11-09", lastmods[base+"/blog"], "the blog hub's lastmod is its newest post")

	require.Equal(t, "2026-11-09", lastmods[base+"/blog/global"])
	require.Contains(t, lastmods, base+"/blog/this-flavor")
	require.NotContains(t, lastmods, base+"/blog/wrath-only", "a post bound to another flavor is excluded")

	newestInstance := ""
	for _, id := range []uuid.UUID{listed, listed2, listed3, quiet1, quiet2} {
		loc := base + "/instances/" + slugs[id]
		require.Contains(t, lastmods, loc, "real clears are listed")
		require.NotEmpty(t, lastmods[loc])
		newestInstance = max(newestInstance, lastmods[loc])
	}
	for _, hub := range []string{"/recent", "/guilds", "/armory", "/leaderboards", "/leaderboards/statistics", "/leaderboards/speedruns"} {
		require.Equal(t, newestInstance, lastmods[base+hub], "%s's lastmod is the newest listed instance", hub)
	}
	for id, why := range map[uuid.UUID]string{
		unlisted: "unlisted instances are excluded",
		noKill:   "instances without a boss kill are excluded",
		short:    "very short instances are excluded",
		tiny:     "instances with too few players are excluded",
		theirs:   "another tenant's instances are excluded",
	} {
		require.NotContains(t, lastmods, base+"/instances/"+slugs[id], why)
		require.NotContains(t, lastmods, base+"/instances/"+id.String(), why)
	}

	require.Contains(t, lastmods, base+"/g/"+ourGuild.String(), "a guild with an edited page is listed")
	require.Contains(t, lastmods, base+"/g/"+busyGuild.String(), "a guild with enough listed runs is listed")
	require.Equal(t, start.Format(time.RFC3339), lastmods[base+"/g/"+busyGuild.String()], "a guild without a page dates from its newest run")
	require.NotContains(t, lastmods, base+"/g/"+quietGuild.String(), "a guild with too few runs and no page is excluded")
	require.NotContains(t, lastmods, base+"/g/"+theirGuild.String(), "another tenant's guilds are excluded")

	armory := base + "/armory/" + url.PathEscape(realmName) + "/"
	require.Contains(t, lastmods, armory+richHero)
	require.NotEmpty(t, lastmods[armory+richHero])
	require.NotContains(t, lastmods, armory+hiddenHero, "a character last seen in an unlisted log is excluded")
	require.NotContains(t, lastmods, armory+fewHero, "a character in too few listed instances is excluded")
	require.NotContains(t, lastmods, armory+staleHero, "a character not seen recently is excluded")
	require.NotContains(t, lastmods, armory+unknownHero, "a character of unknown class is excluded")

	hidden := httptest.NewRecorder()
	api.sitemapXML(hidden, request(false))
	require.Equal(t, http.StatusNotFound, hidden.Code, "a non-discoverable tenant has no sitemap")
}
