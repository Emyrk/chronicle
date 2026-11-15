package servicestats_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicestats"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
)

const censusPayloadJSON = `{"windows":[
 {"days":30,"total":1000,
  "classes":[{"name":"Warrior","alliance":300,"horde":200,"unknown":8},{"name":"Unknown","unknown":250},{"name":"Mage","alliance":100,"horde":142}],
  "races":[{"name":"Human","alliance":400},{"name":"Orc","horde":342},{"name":"Skyborne","unknown":258}]},
 {"days":90,"total":2500,
  "classes":[{"name":"Warrior","alliance":900,"horde":600},{"name":"Mage","alliance":400,"horde":600}],
  "races":[{"name":"Human","alliance":1300},{"name":"Orc","horde":1200}]}
]}`

// The census page answers first, then shows class and race tables for both
// windows, and says what the numbers count.
func TestCensusPage(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	store.put(tenant, "census", "census", censusPayloadJSON, 1000, 100, computedAt, changedAt)
	h := handler(newService(t, store), forever)

	rec := get(t, h, tenant, "/stats/census")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Empty(t, rec.Header().Get("X-Robots-Tag"), "indexable at the minimum sample")
	body := rec.Body.String()

	title := "Which classes and races are most common on WoW Forever?"
	require.Contains(t, body, "<title>"+title+"</title>")
	require.Contains(t, body, "<h1>"+title+"</h1>")
	// Answer first: top class by total (Warrior 508 of 1,000), with the date, N, window and share.
	require.Contains(t, body, "As of 2026-11-14, Warrior is the most common class among 1,000 characters seen in WoW Forever raid logs (last 30 days) at 50.8%.")
	require.Contains(t, body, "By faction, ")
	require.Contains(t, body, "These are characters seen in uploaded combat logs, not the server&#39;s population.")
	require.Contains(t, body, "Sample: 1,000 characters")
	require.Contains(t, body, "Window: last 30 and 90 days")
	require.Contains(t, body, `<link rel="canonical" href="https://forever.chronicleclassic.com/stats/census">`)
	require.NotContains(t, body, "robots")

	// Class by faction, then race by faction, for both windows, as real tables.
	require.Equal(t, 4, strings.Count(body, "<table>"))
	for _, caption := range []string{
		"Class by faction, last 30 days", "Race by faction, last 30 days",
		"Class by faction, last 90 days", "Race by faction, last 90 days",
	} {
		require.Contains(t, body, "<caption>"+caption+"</caption>")
	}
	require.Contains(t, body, `<th scope="col">Class</th><th scope="col">Alliance</th><th scope="col">Horde</th><th scope="col">Unknown faction</th><th scope="col">Total</th><th scope="col">Share</th>`)
	require.Contains(t, body, "<td>Warrior</td><td>300</td><td>200</td><td>8</td><td>508</td><td>50.8%</td>")
	require.Contains(t, body, "<td>Mage</td><td>100</td><td>142</td><td>0</td><td>242</td><td>24.2%</td>")
	require.Contains(t, body, "<td>Skyborne</td><td>0</td><td>0</td><td>258</td><td>258</td><td>25.8%</td>")
	// The 90-day tables have no unknown faction, so no such column.
	last := body[strings.Index(body, "<caption>Class by faction, last 90 days"):]
	require.NotContains(t, last[:strings.Index(last, "</table>")], "Unknown faction")
	require.Contains(t, last, "<td>Warrior</td><td>900</td><td>600</td><td>1,500</td><td>60.0%</td>")

	require.Contains(t, body, "characters seen only in unlisted logs or in invalidated logs are left out")
	require.Contains(t, body, `<a href="/census">Interactive census</a>`)
	require.EqualValues(t, 1, store.reads.Load(), "a hit reads only its snapshot")
}

// Below the minimum sample the page still renders but stays out of search.
func TestCensusNoIndexBelowMinimum(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	store.put(tenant, "census", "census", censusPayloadJSON, 99, 100, computedAt, changedAt)
	h := handler(newService(t, store), forever)

	rec := get(t, h, tenant, "/stats/census")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "noindex", rec.Header().Get("X-Robots-Tag"))
	require.Contains(t, rec.Body.String(), `<meta name="robots" content="noindex">`)
}

func TestCensusSitemapEntry(t *testing.T) {
	t.Parallel()
	big, small := uuid.New(), uuid.New()
	store := &snapshotStore{}
	store.put(big, "census", "census", censusPayloadJSON, 1000, 100, computedAt, changedAt)
	store.put(small, "census", "census", censusPayloadJSON, 99, 100, computedAt, changedAt)
	svc := newService(t, store)
	entries := func(id uuid.UUID) []servicestats.SitemapEntry {
		got, err := svc.SitemapEntries(servicetenant.WithTenantID(testutil.Context(t, testutil.WaitShort), id))
		require.NoError(t, err)
		return got
	}
	require.Contains(t, entries(big), servicestats.SitemapEntry{Path: "/stats/census", LastMod: changedAt})
	require.Empty(t, entries(small), "noindex pages stay out of the sitemap")
}

// Characters seen only in unlisted (or invalidated) logs are not counted; a
// character any listed log shows within the window is, and so is one whose
// latest sighting is listed.
func TestCensusCountsExcludeUnlistedOnlyCharacters(t *testing.T) {
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
		exec("INSERT INTO tenants (id, slug, name, include_in_all, discoverable) VALUES ($1, $2, $3, false, true)", tenant, slug, "tenant "+slug)
		exec("INSERT INTO wow_servers (id, name, tenant_id) VALUES ($1, $2, $3)", server, "server "+slug, tenant)
		exec("INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realm, server, slug+"-realm")
		return tenant, realm
	}
	day := 24 * time.Hour
	instance := func(realm uuid.UUID, unlisted bool, invalid bool, startedAgo time.Duration) uuid.UUID {
		lg, id := uuid.New(), uuid.New()
		exec("INSERT INTO wow_log_groups (id, owner, created_at, updated_at, unlisted) VALUES ($1, $2, now(), now(), $3)", lg, user, unlisted)
		exec("INSERT INTO parsed_log_group (id, finalized_at) VALUES ($1, now())", lg)
		exec(`INSERT INTO log_instances (id, realm_id, log_group_id, name, start_time, category, invalidated_at)
			VALUES ($1, $2, $3, 'Molten Core', $4, 'raid', CASE WHEN $5 THEN now() ELSE NULL END)`, id, realm, lg, time.Now().Add(-startedAgo), invalid)
		return id
	}
	guid := 0
	// character adds a game_players row of one class, with its latest sighting in
	// `from`, last updated `updatedAgo` ago, and the extra sightings given.
	character := func(realm uuid.UUID, class string, from uuid.UUID, updatedAgo time.Duration, sightings ...uuid.UUID) {
		guid++
		id := fmt.Sprintf("0x%016x", 0x1000+guid)
		exec(`INSERT INTO game_players (id, realm_id, name, class, gender, race, updated_at, updated_from_instance)
			VALUES ($1, $2, $3, $4, 'Male', 'Human', $5, $6)`, id, realm, "char"+class, class, time.Now().Add(-updatedAgo), from)
		for _, s := range sightings {
			exec(`INSERT INTO log_instance_players (instance_id, unit_guid, name, level, class, race) VALUES ($1, $2, $3, 60, $4, 'Human')`, s, id, "char"+class, class)
		}
	}

	tenant, realm := tenantRealm("census")
	otherTenant, otherRealm := tenantRealm("other")
	listed := instance(realm, false, false, 5*day)
	unlisted := instance(realm, true, false, 4*day)
	invalid := instance(realm, false, true, 3*day)
	listedOlder := instance(realm, false, false, 60*day)
	_ = otherTenant

	character(realm, "MAGE", listed, 5*day)                                           // latest sighting is listed: counted
	character(realm, "WARLOCK", unlisted, 4*day)                                      // only unlisted: excluded
	character(realm, "PRIEST", unlisted, 4*day, listed)                               // unlisted latest, but a listed sighting in the window: counted
	character(realm, "ROGUE", invalid, 3*day)                                         // only an invalidated log: excluded
	character(realm, "HUNTER", unlisted, 4*day, listedOlder)                          // listed sighting 60 days ago: excluded at 30 days, counted at 90
	character(realm, "DRUID", listed, 40*day)                                         // updated before the 30-day window: not in 30 days, counted at 90
	character(otherRealm, "SHAMAN", instance(otherRealm, false, false, 5*day), 5*day) // another tenant's: never seen

	pool, err := database.NewPostgresDB(ctx, testutil.Logger(t), connURL)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	store := database.New(pool)
	tenantCtx := servicetenant.WithTenantID(ctx, tenant)
	counts := func(days int) map[string]int64 {
		t.Helper()
		rows, err := store.StatsCensusCounts(tenantCtx, pgtype.Timestamptz{Time: time.Now().Add(-time.Duration(days) * day), Valid: true})
		require.NoError(t, err)
		got := map[string]int64{}
		for _, r := range rows {
			got[string(r.Class)] += r.Count
		}
		return got
	}

	require.Equal(t, map[string]int64{"MAGE": 1, "PRIEST": 1}, counts(30))
	require.Equal(t, map[string]int64{"MAGE": 1, "PRIEST": 1, "HUNTER": 1, "DRUID": 1}, counts(90))
}
