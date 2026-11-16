package servicestats_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"regexp"
	"sort"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicestats"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// snapshotStore answers snapshot reads only. Any other Store call panics on
// the nil embedded interface, so a page hit that ran an aggregate query (or
// any query but the snapshot read) fails the test.
type snapshotStore struct {
	database.Store
	rows  map[string]database.StatsSnapshot // by tenant/page key
	reads atomic.Int32
}

func (s *snapshotStore) GetStatsSnapshot(_ context.Context, arg database.GetStatsSnapshotParams) (database.StatsSnapshot, error) {
	s.reads.Add(1)
	row, ok := s.rows[arg.TenantID.String()+"/"+arg.PageKey]
	if !ok {
		return database.StatsSnapshot{}, pgx.ErrNoRows
	}
	return row, nil
}

func (s *snapshotStore) ListStatsSnapshotMeta(_ context.Context, tenantID uuid.UUID) ([]database.ListStatsSnapshotMetaRow, error) {
	var out []database.ListStatsSnapshotMetaRow
	for _, row := range s.rows {
		if row.TenantID == tenantID {
			out = append(out, database.ListStatsSnapshotMetaRow{
				PageKey: row.PageKey, ProducerKey: row.ProducerKey, SampleN: row.SampleN, MinSample: row.MinSample,
				ComputedAt: row.ComputedAt, PayloadChangedAt: row.PayloadChangedAt,
			})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].PageKey < out[j].PageKey })
	return out, nil
}

// put stores a page row. changedAt is when its payload last changed.
func (s *snapshotStore) put(tenantID uuid.UUID, producer, key, payload string, sampleN, minSample int32, at, changedAt time.Time) {
	if s.rows == nil {
		s.rows = map[string]database.StatsSnapshot{}
	}
	s.rows[tenantID.String()+"/"+key] = database.StatsSnapshot{
		TenantID: tenantID, PageKey: key, ProducerKey: producer, Payload: []byte(payload), SampleN: sampleN, MinSample: minSample,
		ComputedAt: pgtype.Timestamptz{Time: at, Valid: true}, PayloadChangedAt: pgtype.Timestamptz{Time: changedAt, Valid: true},
	}
}

// eligible stores the tenant's threshold check.
func (s *snapshotStore) eligible(tenantID uuid.UUID, ok bool) {
	s.put(tenantID, "_activity", "_activity", fmt.Sprintf(`{"raids":80,"window_days":180,"eligible":%t}`, ok), 80, 1<<31-1, computedAt, computedAt)
}

func (s *snapshotStore) about(tenantID uuid.UUID, payload string, sampleN int32) {
	s.put(tenantID, "about", "about", payload, sampleN, 10, computedAt, changedAt)
}

var (
	computedAt = time.Date(2026, 11, 14, 6, 30, 0, 0, time.UTC)
	changedAt  = time.Date(2026, 11, 12, 18, 0, 0, 0, time.UTC)
)

func newService(t *testing.T, store *snapshotStore, families ...servicestats.Family) *servicestats.Service {
	t.Helper()
	opts := servicestats.Options{Logger: testutil.Logger(t), Store: store}
	if len(families) > 0 {
		opts.Families = append(servicestats.DefaultFamilies(store, time.Now), families...)
	}
	svc, err := servicestats.New(opts)
	require.NoError(t, err)
	return svc
}

func handler(svc *servicestats.Service, site servicestats.Site) http.Handler {
	return svc.Handler(func(*http.Request) (servicestats.Site, error) { return site, nil })
}

func get(t *testing.T, h http.Handler, tenantID uuid.UUID, target string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, target, nil)
	if tenantID != uuid.Nil {
		req = req.WithContext(servicetenant.WithTenantID(req.Context(), tenantID))
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func jsonLD(t *testing.T, body string) map[string]any {
	t.Helper()
	ld := regexp.MustCompile(`(?s)<script type="application/ld\+json">(.*?)</script>`).FindStringSubmatch(body)
	require.Len(t, ld, 2)
	var page map[string]any
	require.NoError(t, json.Unmarshal([]byte(ld[1]), &page), ld[1])
	return page
}

var forever = servicestats.Site{Name: "WoW Forever", Origin: "https://forever.chronicleclassic.com", Discoverable: true}

// The placeholder page is complete HTML without JS and carries every
// page-spec element, and every hit reads only its snapshot row.
func TestAboutPageSpec(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	store.about(tenant, `{"raids":1234,"players":5678,"window_days":180}`, 1234)
	h := handler(newService(t, store), forever)

	rec := get(t, h, tenant, "/stats/about")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "text/html; charset=utf-8", rec.Header().Get("Content-Type"))
	require.Equal(t, "public, max-age=300, s-maxage=3600", rec.Header().Get("Cache-Control"))
	require.Empty(t, rec.Header().Get("X-Robots-Tag"))
	body := rec.Body.String()

	title := "How much raiding is logged on WoW Forever?"
	require.Contains(t, body, "<title>"+title+"</title>")
	require.Contains(t, body, "<h1>"+title+"</h1>")
	require.Contains(t, body, "As of 2026-11-14, players uploaded 1,234 raids with 5,678 distinct players from WoW Forever to Chronicle in the last 180 days.")
	require.Contains(t, body, `Updated <time datetime="2026-11-14T06:30:00Z">2026-11-14</time>`, "the visible date is the last computation")
	require.Contains(t, body, "Sample: 1,234 raids")
	require.Contains(t, body, "Window: last 180 days")
	require.Contains(t, body, `<a href="/stats/methodology">Methodology</a>`)
	require.Contains(t, body, "<table>")
	require.Contains(t, body, "<td>Raids logged</td><td>1,234</td>")
	require.Contains(t, body, `<a href="/recent">Recent raids</a>`, "links into the SPA")
	require.Contains(t, body, `<link rel="canonical" href="https://forever.chronicleclassic.com/stats/about">`)
	require.Contains(t, body, `<meta name="description" content="As of 2026-11-14, players uploaded 1,234 raids`)
	require.NotContains(t, body, "robots")
	require.NotContains(t, body, "nosnippet")
	require.NotContains(t, body, `id="root"`, "not the SPA shell")

	page := jsonLD(t, body)
	require.Equal(t, "WebPage", page["@type"])
	require.Equal(t, "2026-11-12T18:00:00Z", page["dateModified"], "dateModified is when the payload last changed")
	require.Equal(t, "https://forever.chronicleclassic.com/stats/about", page["url"])
	require.Equal(t, title, page["name"])

	require.Equal(t, http.StatusOK, get(t, h, tenant, "/stats/about").Code)
	require.EqualValues(t, 2, store.reads.Load(), "each hit is one snapshot read and nothing else")
}

func TestAboutWithoutPlayerCount(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	store.about(tenant, `{"raids":80,"window_days":180}`, 80)
	body := get(t, handler(newService(t, store), forever), tenant, "/stats/about").Body.String()
	require.Contains(t, body, "players uploaded 80 raids from WoW Forever to Chronicle in the last 180 days.")
	require.NotContains(t, body, "Distinct players")
}

func TestTurtleForkLabel(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	store.about(tenant, `{"raids":80,"players":400,"window_days":180}`, 80)
	site := servicestats.Site{Name: "Capybara", TurtleFork: true, Origin: "https://capybara.chronicleclassic.com", Discoverable: true}

	body := get(t, handler(newService(t, store), site), tenant, "/stats/about").Body.String()
	require.Contains(t, body, "<title>How much raiding is logged on Capybara (Turtle WoW fork)?</title>")
	require.Contains(t, body, `<meta name="description" content="As of 2026-11-14, players uploaded 80 raids with 400 distinct players from Capybara (Turtle WoW fork)`)

	require.Equal(t, "Turtle WoW", servicestats.Site{Name: "Turtle WoW", TurtleFork: true}.Label(), "no doubled suffix")
}

// A tenant below the activity threshold has no page snapshots (the job drops
// them), so every /stats URL is 404. Unknown paths are 404 too.
func TestStatsNotFound(t *testing.T) {
	t.Parallel()
	active, inactive := uuid.New(), uuid.New()
	store := &snapshotStore{}
	store.about(active, `{"raids":80,"window_days":180}`, 80)
	store.eligible(active, true)
	store.eligible(inactive, false)
	h := handler(newService(t, store), forever)

	require.Equal(t, http.StatusOK, get(t, h, active, "/stats/about").Code)
	require.Equal(t, http.StatusNotFound, get(t, h, inactive, "/stats/about").Code, "below-threshold tenant")
	require.Equal(t, http.StatusNotFound, get(t, h, inactive, "/stats/methodology").Code, "below-threshold tenant, static page")
	require.Equal(t, http.StatusNotFound, get(t, h, uuid.Nil, "/stats/about").Code, "root without snapshot")
	require.Equal(t, http.StatusNotFound, get(t, h, uuid.Nil, "/stats/methodology").Code, "root without activity check")
	require.Equal(t, http.StatusNotFound, get(t, h, active, "/stats/nope").Code, "unknown page")
	require.Equal(t, http.StatusNotFound, get(t, h, active, "/stats/about/").Code, "no path variants")
	require.Equal(t, http.StatusNotFound, get(t, h, active, "/stats/_activity").Code, "internal rows are never routed")
}

func TestStatsNoIndex(t *testing.T) {
	t.Parallel()
	tenant, small := uuid.New(), uuid.New()
	store := &snapshotStore{}
	store.about(tenant, `{"raids":80,"window_days":180}`, 80)
	store.about(small, `{"raids":3,"window_days":180}`, 3)
	h := handler(newService(t, store), forever)

	noindex := func(rec *httptest.ResponseRecorder) {
		t.Helper()
		require.Equal(t, http.StatusOK, rec.Code)
		require.Contains(t, rec.Body.String(), `<meta name="robots" content="noindex">`)
		require.Equal(t, "noindex", rec.Header().Get("X-Robots-Tag"))
		require.Contains(t, rec.Body.String(), `<link rel="canonical" href="https://forever.chronicleclassic.com/stats/about">`)
	}
	noindex(get(t, h, small, "/stats/about"))            // below the page's minimum sample
	noindex(get(t, h, tenant, "/stats/about?sort=desc")) // query-parameter variant

	require.NotContains(t, get(t, h, tenant, "/stats/about").Body.String(), "noindex")
}

func TestMethodologyPage(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	store.eligible(tenant, true)
	rec := get(t, handler(newService(t, store), forever), tenant, "/stats/methodology")
	require.Equal(t, http.StatusOK, rec.Code)
	body := rec.Body.String()
	require.Contains(t, body, "<h1>How does Chronicle compute its WoW Forever stats?</h1>")
	require.Contains(t, body, "not the server&#39;s population")
	require.Contains(t, body, `<link rel="canonical" href="https://forever.chronicleclassic.com/stats/methodology">`)
	require.NotContains(t, body, "Updated <time", "a static page has no snapshot date")
	require.NotContains(t, body, "noindex")
	require.NotContains(t, jsonLD(t, body), "dateModified")
	require.EqualValues(t, 1, store.reads.Load(), "a static page reads only the activity row")
}

// bossPayload is the probe family's payload in these tests.
type bossPayload struct {
	Boss string `json:"boss"`
}

type staticProducer struct {
	key     string
	outputs []servicestats.Output
}

func (p staticProducer) Key() string            { return p.key }
func (p staticProducer) Cadence() time.Duration { return time.Hour }
func (p staticProducer) Timeout() time.Duration { return 0 }
func (p staticProducer) Compute(context.Context, servicestats.Tenant) ([]servicestats.Output, error) {
	return p.outputs, nil
}

func bossFamily() servicestats.Family {
	return servicestats.Family{
		Pattern:  "/stats/{instance}/{boss}",
		Producer: staticProducer{key: "boss"},
		Render: func(site servicestats.Site, page servicestats.Page, snap servicestats.Snapshot) (servicestats.Content, error) {
			p, err := servicestats.Decode[bossPayload](snap)
			if err != nil {
				return servicestats.Content{}, err
			}
			return servicestats.Content{Title: fmt.Sprintf("%s in %s on %s (%s)", page.Params["boss"], page.Params["instance"], site.Label(), p.Boss)}, nil
		},
	}
}

func speedrunFamily() servicestats.Family {
	return servicestats.Family{
		Pattern:  "/stats/{instance}/speedruns",
		Producer: staticProducer{key: "speedruns"},
		Render: func(_ servicestats.Site, page servicestats.Page, _ servicestats.Snapshot) (servicestats.Content, error) {
			return servicestats.Content{Title: "Speedruns in " + page.Params["instance"]}, nil
		},
	}
}

// A parameterised family serves one page per stored key, a more literal
// sibling wins where both match, and the sitemap is built from stored keys.
func TestParameterizedFamily(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	for _, key := range []string{"boss/naxxramas/patchwerk", "boss/molten-core/ragnaros"} {
		store.put(tenant, "boss", key, `{"boss":"`+key+`"}`, 50, 5, computedAt, changedAt)
	}
	store.put(tenant, "boss", "boss/naxxramas/thaddius", `{}`, 2, 5, computedAt, changedAt) // below its minimum
	store.put(tenant, "speedruns", "speedruns/naxxramas", `{}`, 9, 1, computedAt, changedAt)
	store.put(tenant, "boss", "_ran:boss", `{}`, 0, 1<<31-1, computedAt, computedAt)
	store.put(tenant, "retired", "retired/x", `{}`, 99, 1, computedAt, changedAt)
	store.eligible(tenant, true)
	svc := newService(t, store, bossFamily(), speedrunFamily())
	h := handler(svc, forever)

	body := get(t, h, tenant, "/stats/naxxramas/patchwerk").Body.String()
	require.Contains(t, body, "<h1>patchwerk in naxxramas on WoW Forever (boss/naxxramas/patchwerk)</h1>")
	require.Contains(t, get(t, h, tenant, "/stats/molten-core/ragnaros").Body.String(), "<h1>ragnaros in molten-core")
	require.Contains(t, get(t, h, tenant, "/stats/naxxramas/speedruns").Body.String(), "<h1>Speedruns in naxxramas</h1>", "the literal segment wins")
	require.Equal(t, http.StatusNotFound, get(t, h, tenant, "/stats/naxxramas/loatheb").Code, "no snapshot for that key")
	require.Equal(t, http.StatusNotFound, get(t, h, tenant, "/stats/Naxxramas/patchwerk").Code, "parameters are lowercase slugs")

	entries, err := svc.SitemapEntries(servicetenant.WithTenantID(context.Background(), tenant))
	require.NoError(t, err)
	paths := map[string]time.Time{}
	for _, e := range entries {
		paths[e.Path] = e.LastMod
	}
	require.Equal(t, map[string]time.Time{
		"/stats/naxxramas/patchwerk":  changedAt,
		"/stats/molten-core/ragnaros": changedAt,
		"/stats/naxxramas/speedruns":  changedAt,
		"/stats/methodology":          {},
	}, paths, "stored indexable keys of registered families, lastmod = payload change, plus static pages")
}

func TestFamilyMatchAndPathForKey(t *testing.T) {
	t.Parallel()
	svc := newService(t, &snapshotStore{}, bossFamily())
	f := svc.Family("boss")
	require.NotNil(t, f)

	key, ok := f.Match("/stats/naxxramas/patchwerk")
	require.True(t, ok)
	require.Equal(t, servicestats.PageKey("boss", "naxxramas", "patchwerk"), key)
	path, ok := f.PathForKey(key)
	require.True(t, ok)
	require.Equal(t, "/stats/naxxramas/patchwerk", path)

	for _, bad := range []string{"/stats/naxxramas", "/stats/naxxramas/patchwerk/x", "/stats/naxx_ramas/patchwerk", "/stats/a//b"} {
		_, ok := f.Match(bad)
		require.False(t, ok, bad)
	}
	for _, bad := range []string{"boss", "boss/naxxramas", "boss/a/b/c", "speedruns/a/b", "_ran:boss", "boss/A/b"} {
		_, ok := f.PathForKey(bad)
		require.False(t, ok, bad)
	}

	about := svc.Family("about")
	key, ok = about.Match("/stats/about")
	require.True(t, ok)
	require.Equal(t, "about", key)
}

func TestSitemapEntries(t *testing.T) {
	t.Parallel()
	tenant, small, empty := uuid.New(), uuid.New(), uuid.New()
	store := &snapshotStore{}
	store.about(tenant, `{}`, 80)
	store.eligible(tenant, true)
	store.put(tenant, "about", "_ran:about", `{}`, 0, 1<<31-1, computedAt, computedAt)
	store.about(small, `{}`, 3)
	svc := newService(t, store)

	entries := func(id uuid.UUID) []servicestats.SitemapEntry {
		got, err := svc.SitemapEntries(servicetenant.WithTenantID(context.Background(), id))
		require.NoError(t, err)
		return got
	}
	require.Equal(t, []servicestats.SitemapEntry{{Path: "/stats/about", LastMod: changedAt}, {Path: "/stats/methodology"}}, entries(tenant))
	require.Empty(t, entries(small), "below the minimum sample, and no static pages without indexable pages")
	require.Empty(t, entries(empty))
}

func TestNewValidatesFamilies(t *testing.T) {
	t.Parallel()
	store := &snapshotStore{}
	family := func(pattern, key string) servicestats.Family {
		return servicestats.Family{Pattern: pattern, Producer: staticProducer{key: key}, Render: func(servicestats.Site, servicestats.Page, servicestats.Snapshot) (servicestats.Content, error) {
			return servicestats.Content{}, nil
		}}
	}
	for name, families := range map[string][]servicestats.Family{
		"outside /stats":      {family("/census", "a")},
		"trailing slash":      {family("/stats/a/", "a")},
		"reserved key":        {family("/stats/a", "_a")},
		"key with slash":      {family("/stats/a", "a/b")},
		"duplicate key":       {family("/stats/a", "a"), family("/stats/b", "a")},
		"same shape":          {family("/stats/{x}", "a"), family("/stats/{y}", "b")},
		"repeated parameter":  {family("/stats/{x}/{x}", "a")},
		"invalid segment":     {family("/stats/A", "a")},
		"missing render func": {{Pattern: "/stats/a", Producer: staticProducer{key: "a"}}},
	} {
		_, err := servicestats.New(servicestats.Options{Store: store, Families: families})
		require.Error(t, err, name)
	}
	_, err := servicestats.New(servicestats.Options{Store: store, IndexNowKey: "bad key!"})
	require.Error(t, err)
}

func TestFormatInt(t *testing.T) {
	t.Parallel()
	for in, want := range map[int64]string{0: "0", 999: "999", 1000: "1,000", 1234567: "1,234,567", -4200: "-4,200"} {
		require.Equal(t, want, servicestats.FormatInt(in))
	}
}
