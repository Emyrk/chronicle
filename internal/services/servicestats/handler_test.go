package servicestats_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
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
	rows  map[string]database.StatsSnapshot // by page key
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
			out = append(out, database.ListStatsSnapshotMetaRow{PageKey: row.PageKey, SampleN: row.SampleN, ComputedAt: row.ComputedAt})
		}
	}
	return out, nil
}

func (s *snapshotStore) put(tenantID uuid.UUID, key string, payload string, sampleN int32, at time.Time) {
	if s.rows == nil {
		s.rows = map[string]database.StatsSnapshot{}
	}
	s.rows[tenantID.String()+"/"+key] = database.StatsSnapshot{
		TenantID: tenantID, PageKey: key, Payload: []byte(payload), SampleN: sampleN,
		ComputedAt: pgtype.Timestamptz{Time: at, Valid: true},
	}
}

var computedAt = time.Date(2026, 11, 14, 6, 30, 0, 0, time.UTC)

func newHandler(t *testing.T, store *snapshotStore, site servicestats.Site) http.Handler {
	t.Helper()
	svc, err := servicestats.New(servicestats.Options{Logger: testutil.Logger(t), Store: store})
	require.NoError(t, err)
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

var forever = servicestats.Site{Name: "WoW Forever", Origin: "https://forever.chronicleclassic.com", Discoverable: true}

// The placeholder page is complete HTML without JS and carries every
// page-spec element, and every hit reads only its snapshot row.
func TestAboutPageSpec(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	store.put(tenant, "about", `{"raids":1234,"players":5678,"window_days":30}`, 1234, computedAt)
	h := newHandler(t, store, forever)

	rec := get(t, h, tenant, "/stats/about")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "text/html; charset=utf-8", rec.Header().Get("Content-Type"))
	require.Equal(t, "public, max-age=300, s-maxage=3600", rec.Header().Get("Cache-Control"))
	require.Empty(t, rec.Header().Get("X-Robots-Tag"))
	body := rec.Body.String()

	title := "How much raiding is logged on WoW Forever?"
	require.Contains(t, body, "<title>"+title+"</title>")
	require.Contains(t, body, "<h1>"+title+"</h1>")
	require.Contains(t, body, "As of 2026-11-14, players uploaded 1,234 raids with 5,678 distinct players from WoW Forever to Chronicle in the last 30 days.")
	require.Contains(t, body, `Updated <time datetime="2026-11-14T06:30:00Z">2026-11-14</time>`)
	require.Contains(t, body, "Sample: 1,234 raids")
	require.Contains(t, body, "Window: last 30 days")
	require.Contains(t, body, `<a href="/stats/about#methodology">Methodology</a>`)
	require.Contains(t, body, `<section id="methodology">`)
	require.Contains(t, body, "<table>")
	require.Contains(t, body, "<td>Raids logged</td><td>1,234</td>")
	require.Contains(t, body, `<a href="/recent">Recent raids</a>`, "links into the SPA")
	require.Contains(t, body, `<link rel="canonical" href="https://forever.chronicleclassic.com/stats/about">`)
	require.Contains(t, body, `<meta name="description" content="As of 2026-11-14, players uploaded 1,234 raids`)
	require.NotContains(t, body, "robots")
	require.NotContains(t, body, "nosnippet")
	require.NotContains(t, body, `id="root"`, "not the SPA shell")

	ld := regexp.MustCompile(`(?s)<script type="application/ld\+json">(.*?)</script>`).FindStringSubmatch(body)
	require.Len(t, ld, 2)
	var page map[string]any
	require.NoError(t, json.Unmarshal([]byte(ld[1]), &page), ld[1])
	require.Equal(t, "WebPage", page["@type"])
	require.Equal(t, "2026-11-14T06:30:00Z", page["dateModified"])
	require.Equal(t, "https://forever.chronicleclassic.com/stats/about", page["url"])
	require.Equal(t, title, page["name"])

	rec = get(t, h, tenant, "/stats/about")
	require.Equal(t, http.StatusOK, rec.Code)
	require.EqualValues(t, 2, store.reads.Load(), "each hit is one snapshot read and nothing else")
}

func TestTurtleForkLabel(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	store.put(tenant, "about", `{"raids":80,"players":400,"window_days":30}`, 80, computedAt)
	site := servicestats.Site{Name: "Capybara", TurtleFork: true, Origin: "https://capybara.chronicleclassic.com", Discoverable: true}

	body := get(t, newHandler(t, store, site), tenant, "/stats/about").Body.String()
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
	store.put(active, "about", `{"raids":80,"players":400,"window_days":30}`, 80, computedAt)
	h := newHandler(t, store, forever)

	require.Equal(t, http.StatusOK, get(t, h, active, "/stats/about").Code)
	require.Equal(t, http.StatusNotFound, get(t, h, inactive, "/stats/about").Code, "below-threshold tenant")
	require.Equal(t, http.StatusNotFound, get(t, h, uuid.Nil, "/stats/about").Code, "root without snapshot")
	require.Equal(t, http.StatusNotFound, get(t, h, active, "/stats/nope").Code, "unknown page")
	require.Equal(t, http.StatusNotFound, get(t, h, active, "/stats/about/").Code, "no path variants")
}

func TestStatsNoIndex(t *testing.T) {
	t.Parallel()
	tenant, small := uuid.New(), uuid.New()
	store := &snapshotStore{}
	store.put(tenant, "about", `{"raids":80,"players":400,"window_days":30}`, 80, computedAt)
	store.put(small, "about", `{"raids":3,"players":250,"window_days":30}`, 3, computedAt)
	h := newHandler(t, store, forever)

	noindex := func(rec *httptest.ResponseRecorder) {
		t.Helper()
		require.Equal(t, http.StatusOK, rec.Code)
		require.Contains(t, rec.Body.String(), `<meta name="robots" content="noindex">`)
		require.Equal(t, "noindex", rec.Header().Get("X-Robots-Tag"))
		require.Contains(t, rec.Body.String(), `<link rel="canonical" href="https://forever.chronicleclassic.com/stats/about">`)
	}
	noindex(get(t, h, small, "/stats/about"))            // below the page's minimum sample
	noindex(get(t, h, tenant, "/stats/about?sort=desc")) // query-parameter variant

	hidden := forever
	hidden.Discoverable = false
	noindex(get(t, newHandler(t, store, hidden), tenant, "/stats/about"))

	require.NotContains(t, get(t, h, tenant, "/stats/about").Body.String(), "noindex")
}

// The sitemap lists only pages with a snapshot at or above their minimum
// sample, with lastmod = computed_at.
func TestSitemapEntries(t *testing.T) {
	t.Parallel()
	tenant, small, empty := uuid.New(), uuid.New(), uuid.New()
	store := &snapshotStore{}
	store.put(tenant, "about", `{}`, 80, computedAt)
	store.put(tenant, "_activity", `{}`, 80, computedAt)
	store.put(tenant, "retired-page", `{}`, 80, computedAt)
	store.put(small, "about", `{}`, 3, computedAt)
	svc, err := servicestats.New(servicestats.Options{Logger: testutil.Logger(t), Store: store})
	require.NoError(t, err)

	entries := func(id uuid.UUID) []servicestats.SitemapEntry {
		ctx := servicetenant.WithTenantID(context.Background(), id)
		got, err := svc.SitemapEntries(ctx)
		require.NoError(t, err)
		return got
	}
	require.Equal(t, []servicestats.SitemapEntry{{Path: "/stats/about", LastMod: computedAt}}, entries(tenant))
	require.Empty(t, entries(small))
	require.Empty(t, entries(empty))
}

func TestNewValidatesPages(t *testing.T) {
	t.Parallel()
	store := &snapshotStore{}
	page := func(path, key string) servicestats.Page {
		return servicestats.Page{Path: path, Producer: fakeProducer{key: key}, Render: func(servicestats.Site, servicestats.Snapshot) (servicestats.Content, error) {
			return servicestats.Content{}, nil
		}}
	}
	for name, pages := range map[string][]servicestats.Page{
		"outside /stats": {page("/census", "a")},
		"reserved key":   {page("/stats/a", "_a")},
		"duplicate key":  {page("/stats/a", "a"), page("/stats/b", "a")},
		"duplicate path": {page("/stats/a", "a"), page("/stats/a", "b")},
	} {
		_, err := servicestats.New(servicestats.Options{Store: store, Pages: pages})
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

type fakeProducer struct {
	key     string
	cadence time.Duration
	payload func() any
	sample  int
	calls   *atomic.Int32
}

func (p fakeProducer) Key() string            { return p.key }
func (p fakeProducer) Cadence() time.Duration { return p.cadence }
func (p fakeProducer) Compute(context.Context, servicestats.Tenant) (any, int, error) {
	if p.calls != nil {
		p.calls.Add(1)
	}
	var payload any = map[string]any{}
	if p.payload != nil {
		payload = p.payload()
	}
	return payload, p.sample, nil
}
