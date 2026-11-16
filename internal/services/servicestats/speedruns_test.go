package servicestats_test

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicestats"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
)

const speedrunsPayloadJSON = `{"instance":"Molten Core","boards":[
 {"difficulty":"","max_players":40,"ranked":31,"runs":[
  {"rank":1,"guild":"Nightfall","guild_id":"11111111-1111-1111-1111-111111111111","duration_ms":2292000,"completed_at":"2026-11-10T20:00:00Z","raid_id":"abc123"},
  {"rank":2,"guild":"Dawn <b>Patrol</b>","duration_ms":3725000,"completed_at":"2026-11-11T21:30:00Z","raid_id":"def456"}]},
 {"difficulty":"Hard","max_players":20,"ranked":4,"runs":[
  {"rank":1,"guild":"Small Fry","duration_ms":1900000,"completed_at":"2026-11-09T19:00:00Z","raid_id":"ghi789"}]}
]}`

// The page answers first, ranks guilds by time with a link to each raid, and
// shows guild names only.
func TestSpeedrunsPage(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	store.put(tenant, "speedruns-raids", "speedruns-raids/molten-core", speedrunsPayloadJSON, 31, 3, computedAt, changedAt)
	h := handler(newService(t, store), forever)

	rec := get(t, h, tenant, "/stats/raids/molten-core/speedruns")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Empty(t, rec.Header().Get("X-Robots-Tag"))
	body := rec.Body.String()

	title := "What is the fastest Molten Core clear on WoW Forever?"
	require.Contains(t, body, "<title>"+title+"</title>")
	require.Contains(t, body, "<h1>"+title+"</h1>")
	// Two boards: the lead names the main one (most ranked guilds).
	require.Contains(t, body, "The fastest Molten Core (40 players) clear on WoW Forever is 38:12 by Nightfall, set 2026-11-10.")
	require.Contains(t, body, "As of 2026-11-14, 31 guilds are ranked, each with its best valid full-raid clear.")
	require.Contains(t, body, "Sample: 31 ranked guilds")
	require.Contains(t, body, `<link rel="canonical" href="https://forever.chronicleclassic.com/stats/raids/molten-core/speedruns">`)

	require.Contains(t, body, `<th scope="col">Rank</th><th scope="col">Guild</th><th scope="col">Time</th><th scope="col">Date</th><th scope="col">Raid</th>`)
	require.Contains(t, body, `<td>1</td><td><a href="/g/11111111-1111-1111-1111-111111111111">Nightfall</a></td><td>38:12</td><td>2026-11-10</td><td><a href="/instances/abc123">View raid</a></td>`)
	require.Contains(t, body, `<td>2</td><td>Dawn &lt;b&gt;Patrol&lt;/b&gt;</td><td>62:05</td><td>2026-11-11</td><td><a href="/instances/def456">View raid</a></td>`, "names are escaped; minutes run past 60 like the app's speedrun hub")
	require.Equal(t, 2, strings.Count(body, "<table>"), "the main board and the second board")
	require.Contains(t, body, "<caption>Fastest clears: Hard, 20 players</caption>")
	require.Contains(t, body, `<td><a href="/instances/ghi789">View raid</a></td>`)
	require.Contains(t, body, `<a href="/leaderboards/Molten-Core/speedruns">Interactive speedrun leaderboards</a>`)
	require.NotContains(t, body, "player_count")
	require.EqualValues(t, 1, store.reads.Load(), "a hit reads only its snapshot")
}

func TestSpeedrunsSingleBoardLead(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	store.put(tenant, "speedruns-raids", "speedruns-raids/zul-gurub", `{"instance":"Zul'Gurub","boards":[{"difficulty":"","max_players":20,"ranked":1,"runs":[{"rank":1,"guild":"G","duration_ms":1500000,"completed_at":"2026-11-01T00:00:00Z","raid_id":"x"}]}]}`, 1, 3, computedAt, changedAt)
	body := get(t, handler(newService(t, store), forever), tenant, "/stats/raids/zul-gurub/speedruns").Body.String()
	require.Contains(t, body, "The fastest Zul&#39;Gurub clear on WoW Forever is 25:00 by G, set 2026-11-01.")
	require.Contains(t, body, "1 guild is ranked")
	require.Contains(t, body, `/leaderboards/Zul%27Gurub/speedruns`)
}

// Fewer ranked guilds than the minimum: the page renders but stays out of search.
func TestSpeedrunsNoIndexAndSitemap(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	store.put(tenant, "speedruns-raids", "speedruns-raids/molten-core", speedrunsPayloadJSON, 2, 3, computedAt, changedAt)
	store.put(tenant, "speedruns-raids", "speedruns-raids/naxxramas", speedrunsPayloadJSON, 20, 3, computedAt, changedAt)
	store.put(tenant, "speedruns-dungeons", "speedruns-dungeons/deadmines", speedrunsPayloadJSON, 20, 3, computedAt, changedAt)
	svc := newService(t, store)

	rec := get(t, handler(svc, forever), tenant, "/stats/raids/molten-core/speedruns")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "noindex", rec.Header().Get("X-Robots-Tag"))

	entries, err := svc.SitemapEntries(servicetenant.WithTenantID(testutil.Context(t, testutil.WaitShort), tenant))
	require.NoError(t, err)
	var paths []string
	for _, e := range entries {
		paths = append(paths, e.Path)
	}
	require.Contains(t, paths, "/stats/raids/naxxramas/speedruns")
	require.Contains(t, paths, "/stats/dungeons/deadmines/speedruns")
	require.NotContains(t, paths, "/stats/raids/molten-core/speedruns")
}

// An instance with no snapshot, or a path that is not a family page, is a 404.
func TestSpeedrunsNotFound(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	h := handler(newService(t, store), forever)
	require.Equal(t, http.StatusNotFound, get(t, h, tenant, "/stats/raids/blackwing-lair/speedruns").Code)
	require.Equal(t, http.StatusNotFound, get(t, h, tenant, "/stats/raids/Molten%20Core/speedruns").Code)
	require.Equal(t, http.StatusNotFound, get(t, h, tenant, "/stats/raids/molten-core/speedruns/extra").Code)
	require.Equal(t, http.StatusNotFound, get(t, h, tenant, "/stats/molten-core/speedruns").Code, "instance pages live under raids or dungeons")
	require.Equal(t, http.StatusNotFound, get(t, h, tenant, "/stats/dungeons/molten-core/speedruns").Code)
}

// The producer, run against a real database through the service, ranks the
// leaderboard's valid clears: one per guild, listed logs only, qualified runs
// only, duplicate uploads once, and no page for an instance with no valid run.
func TestSpeedrunsProducerAgainstDatabase(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	connURL := dbtestutil.NewConnectionURL(t)

	seedCfg, err := pgxpool.ParseConfig(connURL)
	require.NoError(t, err)
	seedCfg.ConnConfig.RuntimeParams["app.tenant_bypass"] = "true"
	seed, err := pgxpool.NewWithConfig(ctx, seedCfg)
	require.NoError(t, err)
	t.Cleanup(seed.Close)
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := seed.Exec(ctx, sql, args...)
		require.NoError(t, err, sql)
	}

	user := uuid.New()
	exec("INSERT INTO users (id, username, email) VALUES ($1, $2, $3)", user, "u-"+user.String()[:8], user.String()+"@example.com")
	tenant, server, realm := uuid.New(), uuid.New(), uuid.New()
	exec("INSERT INTO tenants (id, slug, name, include_in_all, discoverable) VALUES ($1, 'speed', 'speed', false, true)", tenant)
	exec("INSERT INTO wow_servers (id, name, tenant_id) VALUES ($1, 'speed server', $2)", server, tenant)
	exec("INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, 'speed-realm')", realm, server)
	// A second tenant, with faster clears of the same raid: it must never leak in.
	otherTenant, otherServer, otherRealm := uuid.New(), uuid.New(), uuid.New()
	exec("INSERT INTO tenants (id, slug, name, include_in_all, discoverable) VALUES ($1, 'elsewhere', 'elsewhere', false, true)", otherTenant)
	exec("INSERT INTO wow_servers (id, name, tenant_id) VALUES ($1, 'other server', $2)", otherServer, otherTenant)
	exec("INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, 'other-realm')", otherRealm, otherServer)

	// The threshold: 50 listed raids make the tenant eligible.
	lg := uuid.New()
	exec("INSERT INTO wow_log_groups (id, owner, created_at, updated_at, unlisted) VALUES ($1, $2, now(), now(), false)", lg, user)
	exec("INSERT INTO parsed_log_group (id, finalized_at) VALUES ($1, now())", lg)
	exec(`INSERT INTO log_instances (id, realm_id, log_group_id, name, start_time, category)
		SELECT gen_random_uuid(), $1, $2, 'Filler', now() - interval '5 days', 'raid' FROM generate_series(1, $3::int)`, realm, lg, servicestats.MinTenantRaids)

	guildIn := func(r uuid.UUID, name string) uuid.UUID {
		id := uuid.New()
		exec("INSERT INTO guilds (id, realm_id, name) VALUES ($1, $2, $3)", id, r, name)
		return id
	}
	guild := func(name string) uuid.UUID { return guildIn(realm, name) }
	// category is the log_instances.category of each seeded instance.
	category := map[string]string{"Molten Core": "raid", "Naxxramas": "raid", "Onyxia's Lair": "raid", "Deadmines": "dungeon"}
	// clearIn seeds one speedrun of instanceName on a realm, of the given raid size.
	clearIn := func(r uuid.UUID, size int, instanceName string, g uuid.UUID, ms int64, qualified, unlisted bool, dup any, slug any) {
		group, inst := uuid.New(), uuid.New()
		exec("INSERT INTO wow_log_groups (id, owner, created_at, updated_at, unlisted) VALUES ($1, $2, now(), now(), $3)", group, user, unlisted)
		exec("INSERT INTO parsed_log_group (id, finalized_at) VALUES ($1, now())", group)
		start := time.Now().Add(-48 * time.Hour)
		exec(`INSERT INTO log_instances (id, realm_id, log_group_id, name, start_time, category, difficulty_name, max_players, hashed_slug, duplicate_group_id)
			VALUES ($1, $2, $3, $4, $5, $9, '', $8, $6, $7)`, inst, r, group, instanceName, start, slug, dup, size, category[instanceName])
		exec(`INSERT INTO instance_speedruns (instance_id, instance_name, realm_id, guild_id, qualified, start_time, completion_time, duration_ms,
				ranked_start_time, ranked_completion_time, ranked_duration_ms, boss_to_boss_start_time, boss_to_boss_completion_time, boss_to_boss_duration_ms, proof)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $6, $7, $8, $6, $7, $8, '{}'::jsonb)`,
			inst, instanceName, r, g, qualified, start, start.Add(time.Duration(ms)*time.Millisecond), ms)
	}
	clear := func(instanceName string, g uuid.UUID, ms int64, qualified, unlisted bool, dup any, slug any) {
		clearIn(realm, 40, instanceName, g, ms, qualified, unlisted, dup, slug)
	}

	fast, mid, hidden, invalid := guild("Fast Guild"), guild("Mid Guild"), guild("Unlisted Guild"), guild("Unqualified Guild")
	dupGroup := uuid.New()
	clear("Molten Core", fast, 2_292_000, true, false, nil, "slug-fast")
	clear("Molten Core", fast, 2_300_000, true, false, dupGroup, nil) // a second, slower run by the same guild: only its best counts
	clear("Molten Core", mid, 2_400_000, true, false, nil, nil)
	clear("Molten Core", mid, 2_900_000, true, false, nil, nil)      // the guild's slower run
	clear("Molten Core", hidden, 1_000_000, true, true, nil, nil)    // unlisted log: never ranked
	clear("Molten Core", invalid, 1_100_000, false, false, nil, nil) // not a qualified clear
	// One raid uploaded twice, by the log of two guilds: a single logical run, ranked once
	// for the faster copy.
	raidTwice := uuid.New()
	dupA, dupB := guild("Duplicate A"), guild("Duplicate B")
	clear("Molten Core", dupA, 2_330_000, true, false, raidTwice, nil)
	clear("Molten Core", dupB, 2_340_000, true, false, raidTwice, nil)
	// A second raid size is its own board on the same page.
	clearIn(realm, 20, "Molten Core", guild("Small Guild"), 3_000_000, true, false, nil, "slug-small")
	// Another tenant's faster clears are invisible here.
	clearIn(otherRealm, 40, "Molten Core", guildIn(otherRealm, "Foreign Guild"), 900_000, true, false, nil, "slug-foreign")
	clearIn(otherRealm, 40, "Naxxramas", guildIn(otherRealm, "Foreign Naxx"), 900_000, true, false, nil, nil)
	// A dungeon clear lives in the dungeons namespace, not the raids one.
	clearIn(realm, 5, "Deadmines", guild("Dungeon Guild"), 1_200_000, true, false, nil, "slug-dm")
	clear("Onyxia's Lair", invalid, 900_000, false, false, nil, nil) // an instance with no valid run
	clear("Onyxia's Lair", hidden, 800_000, true, true, nil, nil)

	pool, err := database.NewPostgresDB(ctx, testutil.Logger(t), connURL)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	store := database.New(pool)
	accessURL, _ := url.Parse("https://chronicleclassic.com")
	svc, err := servicestats.New(servicestats.Options{
		Logger: testutil.Logger(t), Store: store, AccessURL: accessURL, PrimaryDomain: "chronicleclassic.com",
	})
	require.NoError(t, err)

	_, err = svc.RefreshTenant(ctx, &recordingQueue{}, tenant, true)
	require.NoError(t, err)
	_, err = svc.RefreshProducer(ctx, tenant, "speedruns-raids", time.Time{})
	require.NoError(t, err)
	_, err = svc.RefreshProducer(ctx, tenant, "speedruns-dungeons", time.Time{})
	require.NoError(t, err)

	tenantCtx := servicetenant.WithTenantID(ctx, tenant)
	meta, err := store.ListStatsSnapshotMeta(tenantCtx, tenant)
	require.NoError(t, err)
	var keys []string
	for _, m := range meta {
		if strings.HasPrefix(m.ProducerKey, "speedruns-") && !strings.HasPrefix(m.PageKey, "_") {
			keys = append(keys, m.PageKey)
		}
	}
	require.ElementsMatch(t, []string{"speedruns-raids/molten-core", "speedruns-dungeons/deadmines"}, keys,
		"no page for Onyxia's Lair (unlisted or unqualified runs) or Naxxramas (another tenant's); the dungeon is in its own namespace")

	snap, err := store.GetStatsSnapshot(tenantCtx, database.GetStatsSnapshotParams{TenantID: tenant, PageKey: "speedruns-raids/molten-core"})
	require.NoError(t, err)
	var payload struct {
		Instance string `json:"instance"`
		Boards   []struct {
			MaxPlayers int `json:"max_players"`
			Ranked     int `json:"ranked"`
			Runs       []struct {
				Rank       int    `json:"rank"`
				Guild      string `json:"guild"`
				DurationMs int64  `json:"duration_ms"`
				RaidID     string `json:"raid_id"`
			} `json:"runs"`
		} `json:"boards"`
	}
	require.NoError(t, json.Unmarshal(snap.Payload, &payload))
	require.Equal(t, "Molten Core", payload.Instance)
	require.Len(t, payload.Boards, 2, "one board per raid size")

	main := payload.Boards[0]
	require.Equal(t, 40, main.MaxPlayers, "the board with the most ranked guilds leads")
	require.Equal(t, 3, main.Ranked, "one run per guild; unlisted, unqualified and other-tenant guilds are not ranked, and a raid uploaded twice ranks once")
	var guilds []string
	for _, r := range main.Runs {
		guilds = append(guilds, r.Guild)
	}
	require.Equal(t, []string{"Fast Guild", "Duplicate A", "Mid Guild"}, guilds, "fastest first; the slower copy of the duplicated raid (Duplicate B) is gone")
	require.EqualValues(t, 2_292_000, main.Runs[0].DurationMs, "the guild's fastest run")
	require.Equal(t, "slug-fast", main.Runs[0].RaidID)
	require.EqualValues(t, 2_400_000, main.Runs[2].DurationMs)

	small := payload.Boards[1]
	require.Equal(t, 20, small.MaxPlayers)
	require.Len(t, small.Runs, 1)
	require.Equal(t, "Small Guild", small.Runs[0].Guild)
	require.Equal(t, "slug-small", small.Runs[0].RaidID)
	require.EqualValues(t, 3, snap.SampleN, "the sample is the main board's ranked guilds")
	require.NotContains(t, string(snap.Payload), "Foreign")

	// The dungeon page is served at /stats/dungeons/..., and only there.
	dungeon, err := store.GetStatsSnapshot(tenantCtx, database.GetStatsSnapshotParams{TenantID: tenant, PageKey: "speedruns-dungeons/deadmines"})
	require.NoError(t, err)
	require.Contains(t, string(dungeon.Payload), "Dungeon Guild")
	require.Contains(t, string(dungeon.Payload), "slug-dm")
}
