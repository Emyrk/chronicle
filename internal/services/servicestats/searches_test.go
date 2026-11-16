package servicestats_test

import (
	"context"
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

const searchPayloadJSON = `{
 "slug":"fastest-molten-core-clears",
 "title":"Fastest Molten Core clears on {server}",
 "answer":"The fastest Molten Core clear on {server} is {value} {by}, set {date}.",
 "about":"Qualified full clears of Molten Core, fastest first.",
 "value_header":"Clear time",
 "as_of":"2026-11-14T03:00:00Z",
 "search_href":"/search?order=asc&q=eyJmaWVsZCI6IngifQ&sort=instance.clear_time_ms",
 "more":true,
 "results":[
  {"rank":1,"guild":"Nightfall","raid":"Molten Core","date":"2026-11-10T20:00:00Z","max_players":40,"players":38,"bosses":10,"value":"38:12","raid_id":"abc123"},
  {"rank":2,"raid":"Molten Core","date":"2026-11-11T20:00:00Z","difficulty":"Hard","max_players":20,"players":19,"bosses":10,"value":"1:02:05","raid_id":"def456"}
 ]}`

func TestSearchPage(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	store.put(tenant, "searches", "searches/fastest-molten-core-clears", searchPayloadJSON, 2, 1, computedAt, changedAt)
	h := handler(newService(t, store), forever)

	rec := get(t, h, tenant, "/stats/searches/fastest-molten-core-clears")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Empty(t, rec.Header().Get("X-Robots-Tag"))
	body := rec.Body.String()

	title := "Fastest Molten Core clears on WoW Forever"
	require.Contains(t, body, "<title>"+title+"</title>")
	require.Contains(t, body, "<h1>"+title+"</h1>")
	require.Contains(t, body, "The fastest Molten Core clear on WoW Forever is 38:12 by Nightfall, set 2026-11-10. As of 2026-11-14, it lists the first 2 runs of more matches.")
	require.Contains(t, body, "These are runs from combat logs uploaded to Chronicle, not every raid on the server.")
	require.Contains(t, body, "Sample: 2 runs")
	require.Contains(t, body, `<th scope="col">Rank</th><th scope="col">Guild</th><th scope="col">Raid</th><th scope="col">Date</th><th scope="col">Players</th><th scope="col">Clear time</th><th scope="col">Log</th>`)
	require.Contains(t, body, `<td>1</td><td>Nightfall</td><td>Molten Core (40 players)</td><td>2026-11-10</td><td>38</td><td>38:12</td><td><a href="/instances/abc123">View raid</a></td>`)
	require.Contains(t, body, `<td>2</td><td>Pickup raid</td><td>Molten Core (Hard, 20 players)</td>`, "a run with no guild is a pickup raid")
	require.Contains(t, body, `<a href="/search?order=asc&amp;q=eyJmaWVsZCI6IngifQ&amp;sort=instance.clear_time_ms">Open this search in Chronicle</a>`)
	require.Contains(t, body, `<a href="/stats/searches">All curated searches</a>`)
	require.Contains(t, body, `<link rel="canonical" href="https://forever.chronicleclassic.com/stats/searches/fastest-molten-core-clears">`)
	require.EqualValues(t, 1, store.reads.Load())
}

func TestSearchPageEmptyIsNoIndex(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	store.put(tenant, "searches", "searches/fastest-ulduar-clears",
		`{"slug":"fastest-ulduar-clears","title":"Fastest Ulduar clears on {server}","answer":"x {server}","about":"About.","as_of":"2026-11-14T03:00:00Z","search_href":"/search","results":[]}`,
		0, 1, computedAt, changedAt)
	store.put(tenant, "searches", "searches/fastest-naxxramas-clears", searchPayloadJSON, 2, 1, computedAt, changedAt)
	svc := newService(t, store)

	rec := get(t, handler(svc, forever), tenant, "/stats/searches/fastest-ulduar-clears")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "noindex", rec.Header().Get("X-Robots-Tag"))
	body := rec.Body.String()
	require.Contains(t, body, "As of 2026-11-14, no run on WoW Forever matches this search yet.")
	require.NotContains(t, body, "<table>")
	require.Contains(t, body, "Open this search in Chronicle")

	entries, err := svc.SitemapEntries(servicetenant.WithTenantID(testutil.Context(t, testutil.WaitShort), tenant))
	require.NoError(t, err)
	var paths []string
	for _, e := range entries {
		paths = append(paths, e.Path)
	}
	require.Contains(t, paths, "/stats/searches/fastest-naxxramas-clears")
	require.NotContains(t, paths, "/stats/searches/fastest-ulduar-clears", "an empty search stays out of the sitemap")
}

func TestSearchIndexPage(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	store.put(tenant, "searches-index", "searches-index",
		`{"entries":[{"slug":"fastest-molten-core-clears","title":"Fastest Molten Core clears on {server}","about":"Fastest first.","runs":25},{"slug":"deathless-ragnaros-kills","title":"Deathless Ragnaros kills on {server}","about":"No deaths.","runs":4}]}`,
		2, 1, computedAt, changedAt)
	h := handler(newService(t, store), forever)

	rec := get(t, h, tenant, "/stats/searches")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Empty(t, rec.Header().Get("X-Robots-Tag"))
	body := rec.Body.String()
	require.Contains(t, body, "<title>Which raid searches does Chronicle publish for WoW Forever?</title>")
	require.Contains(t, body, "As of 2026-11-14, Chronicle publishes 2 curated searches of WoW Forever raid logs, such as Fastest Molten Core clears on WoW Forever.")
	require.Contains(t, body, `<td><a href="/stats/searches/fastest-molten-core-clears">Fastest Molten Core clears on WoW Forever</a></td><td>Fastest first.</td><td>25</td>`)
	require.Contains(t, body, `<td><a href="/stats/searches/deathless-ragnaros-kills">Deathless Ragnaros kills on WoW Forever</a></td><td>No deaths.</td><td>4</td>`)

	// No snapshot for the tenant, or an unknown slug: 404.
	other := uuid.New()
	require.Equal(t, http.StatusNotFound, get(t, h, other, "/stats/searches").Code)
	require.Equal(t, http.StatusNotFound, get(t, h, tenant, "/stats/searches/not-a-search").Code)
	require.Equal(t, http.StatusNotFound, get(t, h, tenant, "/stats/searches/Fastest-MC").Code)
}

// Run against a real database through the service: the producer compiles each
// curated search for the tenant and runs it in a read-only transaction. A
// qualified clear of a listed log is found, fastest first; an unlisted log, an
// unqualified run and another tenant's run are not. A raid the flavor does not
// register gets no page.
func TestSearchesProducerAgainstDatabase(t *testing.T) {
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
	tenantRealm := func(slug string) (uuid.UUID, uuid.UUID) {
		tenant, server, realm := uuid.New(), uuid.New(), uuid.New()
		exec("INSERT INTO tenants (id, slug, name, include_in_all, discoverable) VALUES ($1, $2, $2, false, true)", tenant, slug)
		exec("INSERT INTO wow_servers (id, name, tenant_id) VALUES ($1, $2, $3)", server, "server "+slug, tenant)
		exec("INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realm, server, slug+"-realm")
		return tenant, realm
	}
	tenant, realm := tenantRealm("searches")
	_, otherRealm := tenantRealm("elsewhere")

	// The threshold: 50 listed raids make the tenant eligible.
	lg := uuid.New()
	exec("INSERT INTO wow_log_groups (id, owner, created_at, updated_at, unlisted) VALUES ($1, $2, now(), now(), false)", lg, user)
	exec("INSERT INTO parsed_log_group (id, finalized_at) VALUES ($1, now())", lg)
	exec(`INSERT INTO log_instances (id, realm_id, log_group_id, name, start_time, category)
		SELECT gen_random_uuid(), $1, $2, 'Filler', now() - interval '5 days', 'raid' FROM generate_series(1, $3::int)`, realm, lg, servicestats.MinTenantRaids)

	guild := func(r uuid.UUID, name string) uuid.UUID {
		id := uuid.New()
		exec("INSERT INTO guilds (id, realm_id, name) VALUES ($1, $2, $3)", id, r, name)
		return id
	}
	clear := func(r uuid.UUID, instanceName string, g uuid.UUID, ms int64, qualified, unlisted bool, slug string) {
		group, inst := uuid.New(), uuid.New()
		exec("INSERT INTO wow_log_groups (id, owner, created_at, updated_at, unlisted) VALUES ($1, $2, now(), now(), $3)", group, user, unlisted)
		exec("INSERT INTO parsed_log_group (id, finalized_at) VALUES ($1, now())", group)
		start := time.Now().Add(-48 * time.Hour)
		exec(`INSERT INTO log_instances (id, realm_id, log_group_id, name, start_time, category, difficulty_name, max_players, hashed_slug, guild_id)
			VALUES ($1, $2, $3, $4, $5, 'raid', '', 40, $6, $7)`, inst, r, group, instanceName, start, slug, g)
		exec(`INSERT INTO instance_speedruns (instance_id, instance_name, realm_id, guild_id, qualified, start_time, completion_time, duration_ms,
				ranked_start_time, ranked_completion_time, ranked_duration_ms, proof)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $6, $7, $8, '{}'::jsonb)`,
			inst, instanceName, r, g, qualified, start, start.Add(time.Duration(ms)*time.Millisecond), ms)
	}
	fast, slow, hidden, invalid, foreign := guild(realm, "Fast Guild"), guild(realm, "Slow Guild"), guild(realm, "Hidden Guild"), guild(realm, "Invalid Guild"), guild(otherRealm, "Foreign Guild")
	clear(realm, "Molten Core", slow, 2_700_000, true, false, "slow-slug")
	clear(realm, "Molten Core", fast, 2_292_000, true, false, "fast-slug")
	clear(realm, "Molten Core", hidden, 1_000_000, true, true, "hidden-slug")  // unlisted log
	clear(realm, "Molten Core", invalid, 1_100_000, false, false, "bad-slug")  // not a qualified clear
	clear(otherRealm, "Molten Core", foreign, 900_000, true, false, "foreign") // another tenant

	pool, err := database.NewPostgresDB(ctx, testutil.Logger(t), connURL)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	store := database.New(pool)
	accessURL, _ := url.Parse("https://chronicleclassic.com")
	svc, err := servicestats.New(servicestats.Options{
		Logger: testutil.Logger(t), Store: store, AccessURL: accessURL, PrimaryDomain: "chronicleclassic.com",
		// A vanilla flavor, whatever the build's: it has Molten Core and no Ulduar.
		SiteFlavor: func(context.Context, *database.Tenant) database.WoWFlavor {
			return database.WoWFlavor{database.FlavorVanilla}
		},
	})
	require.NoError(t, err)

	_, err = svc.RefreshTenant(ctx, &recordingQueue{}, tenant, true)
	require.NoError(t, err)
	_, err = svc.RefreshProducer(ctx, tenant, "searches")
	require.NoError(t, err)
	_, err = svc.RefreshProducer(ctx, tenant, "searches-index")
	require.NoError(t, err)

	tenantCtx := servicetenant.WithTenantID(ctx, tenant)
	meta, err := store.ListStatsSnapshotMeta(tenantCtx, tenant)
	require.NoError(t, err)
	sample := map[string]int32{}
	for _, m := range meta {
		if m.ProducerKey == "searches" || m.ProducerKey == "searches-index" {
			sample[m.PageKey] = m.SampleN
		}
	}
	require.Contains(t, sample, "searches/fastest-molten-core-clears")
	require.EqualValues(t, 2, sample["searches/fastest-molten-core-clears"])
	require.NotContains(t, sample, "searches/fastest-ulduar-clears", "Ulduar is not in a vanilla flavor")
	require.EqualValues(t, 0, sample["searches/fastest-blackwing-lair-clears"], "no such clear: an empty page, below the minimum")
	require.Contains(t, sample, "searches-index")

	snap, err := store.GetStatsSnapshot(tenantCtx, database.GetStatsSnapshotParams{TenantID: tenant, PageKey: "searches/fastest-molten-core-clears"})
	require.NoError(t, err)
	var payload struct {
		SearchHref string `json:"search_href"`
		Results    []struct {
			Rank   int    `json:"rank"`
			Guild  string `json:"guild"`
			Value  string `json:"value"`
			RaidID string `json:"raid_id"`
		} `json:"results"`
	}
	require.NoError(t, json.Unmarshal(snap.Payload, &payload))
	require.Len(t, payload.Results, 2, "unlisted, unqualified and other-tenant runs are not found")
	require.Equal(t, "Fast Guild", payload.Results[0].Guild)
	require.Equal(t, "38:12", payload.Results[0].Value)
	require.Equal(t, "fast-slug", payload.Results[0].RaidID)
	require.Equal(t, "Slow Guild", payload.Results[1].Guild)
	require.Equal(t, "45:00", payload.Results[1].Value)
	require.True(t, strings.HasPrefix(payload.SearchHref, "/search?"))
}
