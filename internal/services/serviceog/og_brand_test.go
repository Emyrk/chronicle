package serviceog

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

func TestBrandOGParams(t *testing.T) {
	t.Parallel()

	base, err := url.Parse("https://og.example.com")
	require.NoError(t, err)

	raw := signedOGImageURL(base, "k", "brand", "forever.chronicleclassic.com", "WoW Forever",
		brandOGParams("WoW Forever", database.SiteStatsRow{LogsParsed: 12480, BossKills: 1900000}))
	u, err := url.Parse(raw)
	require.NoError(t, err)
	q := u.Query()

	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	require.Equal(t, []string{"excerpt", "host", "product", "sig", "stat1", "stat2", "template", "title", "v"}, keys)
	require.Equal(t, "brand", q.Get("template"))
	require.Equal(t, "Every pull, every parse, every wipe.", q.Get("title"))
	require.Equal(t, "Free raid log analysis for WoW Forever", q.Get("excerpt"))
	require.Equal(t, "12480:raids logged", q.Get("stat1"))
	require.Equal(t, "1900000:bosses killed", q.Get("stat2"))
	require.Equal(t, "forever.chronicleclassic.com", q.Get("host"))
	require.Equal(t, "WoW Forever", q.Get("product"))
	require.Equal(t, ogSignature("k", q), q.Get("sig"))

	t.Run("NoCounts", func(t *testing.T) {
		t.Parallel()
		q := brandOGParams("", database.SiteStatsRow{})
		require.Equal(t, url.Values{
			"title":   {"Every pull, every parse, every wipe."},
			"excerpt": {"Free raid log analysis for World of Warcraft"},
		}, q)
		q = brandOGParams("", database.SiteStatsRow{LogsParsed: 3})
		require.Equal(t, "3:raids logged", q.Get("stat1"))
		require.False(t, q.Has("stat2"))
	})
}

func TestWithBrandOG(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "https://chronicleclassic.com/instances/missing", nil)
	failed := func(*http.Request) *frontend.OGData { return nil }
	noImage := func(*http.Request) *frontend.OGData { return &frontend.OGData{Title: "Recent Raids"} }
	ownImage := func(*http.Request) *frontend.OGData {
		return &frontend.OGData{Title: "Sidekick", ImageURL: "https://chronicleclassic.com/c/images/og/sidekick.jpg"}
	}

	t.Run("Unset", func(t *testing.T) {
		t.Parallel()
		api := testOGImageAPI(t, "")
		require.Nil(t, api.withBrandOG(failed)(req))
		require.Equal(t, &frontend.OGData{Title: "Recent Raids"}, api.withBrandOG(noImage)(req))
	})

	t.Run("Configured", func(t *testing.T) {
		t.Parallel()
		api := testOGImageAPI(t, "https://og.example.com")

		og := api.withBrandOG(failed)(req)
		require.NotNil(t, og)
		require.Empty(t, og.Title, "a failed lookup keeps the page's default title")
		u, err := url.Parse(og.ImageURL)
		require.NoError(t, err)
		require.Equal(t, "brand", u.Query().Get("template"))
		require.False(t, u.Query().Has("stat1"), "no cached counts → no pills")

		og = api.withBrandOG(noImage)(req)
		require.Equal(t, "Recent Raids", og.Title)
		require.Contains(t, og.ImageURL, "template=brand")

		require.Equal(t, ownImage(req), api.withBrandOG(ownImage)(req))
	})
}

type fakeSiteStats struct {
	calls atomic.Int32

	mu     sync.Mutex
	err    error
	row    database.SiteStatsRow
	panics bool
	tenant uuid.UUID // tenant seen by the last call
	ctxErr error     // ctx.Err() seen by the last call
}

func (f *fakeSiteStats) set(row database.SiteStatsRow, err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.row, f.err = row, err
}

func (f *fakeSiteStats) SiteStats(ctx context.Context) (database.SiteStatsRow, error) {
	f.calls.Add(1)
	f.mu.Lock()
	defer f.mu.Unlock()
	f.tenant = servicetenant.TenantIDFromContext(ctx)
	f.ctxErr = ctx.Err()
	if f.panics {
		panic("boom")
	}
	return f.row, f.err
}

// waitIdle waits until no refresh is running for the site entry.
func waitIdle(t *testing.T, c *ogSiteStatsCache, key uuid.UUID) {
	t.Helper()
	require.Eventually(t, func() bool {
		c.mu.Lock()
		defer c.mu.Unlock()
		e := c.entries[key]
		return e != nil && !e.refreshing
	}, 5*time.Second, 5*time.Millisecond)
}

// expire makes the entry due for a refresh now.
func expire(c *ogSiteStatsCache, key uuid.UUID) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[key].nextRefresh = time.Time{}
}

func TestOGSiteStatsCache(t *testing.T) {
	t.Parallel()

	t.Run("RefreshesInBackgroundAtMostHourly", func(t *testing.T) {
		t.Parallel()
		var c ogSiteStatsCache
		q := &fakeSiteStats{row: database.SiteStatsRow{LogsParsed: 7, BossKills: 2}}
		ctx := context.Background()

		require.Zero(t, c.get(ctx, nil, q), "first read never waits on the query")
		require.Eventually(t, func() bool { return c.get(ctx, nil, q).LogsParsed == 7 }, 5*time.Second, 5*time.Millisecond)
		for range 5 {
			require.Equal(t, int64(2), c.get(ctx, nil, q).BossKills)
		}
		require.Equal(t, int32(1), q.calls.Load())

		// Past the hour, the old counts are served while one refresh runs.
		c.mu.Lock()
		require.WithinDuration(t, time.Now().Add(brandOGRefresh), c.entries[uuid.Nil].nextRefresh, time.Minute)
		c.mu.Unlock()
		expire(&c, uuid.Nil)
		q.set(database.SiteStatsRow{LogsParsed: 8}, nil)
		require.Equal(t, int64(7), c.get(ctx, nil, q).LogsParsed)
		require.Eventually(t, func() bool { return c.get(ctx, nil, q).LogsParsed == 8 }, 5*time.Second, 5*time.Millisecond)
		require.Equal(t, int32(2), q.calls.Load())
	})

	t.Run("PerTenant", func(t *testing.T) {
		t.Parallel()
		var c ogSiteStatsCache
		site := &fakeSiteStats{row: database.SiteStatsRow{LogsParsed: 100}}
		tenant := &fakeSiteStats{row: database.SiteStatsRow{LogsParsed: 5}}
		tctx := servicetenant.WithTenantID(context.Background(), uuid.New())

		c.get(context.Background(), nil, site)
		c.get(tctx, nil, tenant)
		require.Eventually(t, func() bool {
			return c.get(context.Background(), nil, site).LogsParsed == 100 && c.get(tctx, nil, tenant).LogsParsed == 5
		}, 5*time.Second, 5*time.Millisecond)
	})

	t.Run("RefreshKeepsTenantButNotCancellation", func(t *testing.T) {
		t.Parallel()
		var c ogSiteStatsCache
		q := &fakeSiteStats{row: database.SiteStatsRow{LogsParsed: 5}}
		tenantID := uuid.New()
		ctx, cancel := context.WithCancel(servicetenant.WithTenantID(context.Background(), tenantID))
		cancel() // the request is already gone when the refresh runs

		c.get(ctx, nil, q)
		waitIdle(t, &c, tenantID)
		q.mu.Lock()
		defer q.mu.Unlock()
		require.Equal(t, tenantID, q.tenant, "the refresh must run under the request's tenant for RLS")
		require.NoError(t, q.ctxErr, "the refresh must not inherit the request's cancellation")
	})

	t.Run("ErrorKeepsLastCountsAndRetriesSooner", func(t *testing.T) {
		t.Parallel()
		var c ogSiteStatsCache
		q := &fakeSiteStats{row: database.SiteStatsRow{LogsParsed: 7}}
		ctx := context.Background()

		c.get(ctx, nil, q)
		waitIdle(t, &c, uuid.Nil)
		expire(&c, uuid.Nil)
		q.set(database.SiteStatsRow{}, errors.New("db down"))
		c.get(ctx, nil, q)
		waitIdle(t, &c, uuid.Nil)

		require.Equal(t, int64(7), c.get(ctx, nil, q).LogsParsed, "a failed query keeps the last counts")
		require.Equal(t, int32(2), q.calls.Load(), "no retry before brandOGRetry")
		c.mu.Lock()
		next := c.entries[uuid.Nil].nextRefresh
		c.mu.Unlock()
		require.WithinDuration(t, time.Now().Add(brandOGRetry), next, time.Minute)

		// After the retry wait, the next read retries and picks up new counts.
		expire(&c, uuid.Nil)
		q.set(database.SiteStatsRow{LogsParsed: 9}, nil)
		require.Eventually(t, func() bool { return c.get(ctx, nil, q).LogsParsed == 9 }, 5*time.Second, 5*time.Millisecond)
	})

	t.Run("PanicIsRecovered", func(t *testing.T) {
		t.Parallel()
		var c ogSiteStatsCache
		q := &fakeSiteStats{panics: true}
		ctx := context.Background()

		c.get(ctx, nil, q)
		waitIdle(t, &c, uuid.Nil)
		c.mu.Lock()
		require.WithinDuration(t, time.Now().Add(brandOGRetry), c.entries[uuid.Nil].nextRefresh, time.Minute)
		c.mu.Unlock()

		// The entry isn't wedged: once due, it refreshes again.
		q.mu.Lock()
		q.panics, q.row = false, database.SiteStatsRow{LogsParsed: 3}
		q.mu.Unlock()
		expire(&c, uuid.Nil)
		require.Eventually(t, func() bool { return c.get(ctx, nil, q).LogsParsed == 3 }, 5*time.Second, 5*time.Millisecond)
	})
}

func TestChooseOGImageURL(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "https://choose.chronicleclassic.com/instances/abc", nil)
	require.Empty(t, testOGImageAPI(t, "").ChooseOGImageURL(req, 9), "no OG service → no image")

	api := testOGImageAPI(t, "https://og.example.com")
	u, err := url.Parse(api.ChooseOGImageURL(req, 9))
	require.NoError(t, err)
	q := u.Query()
	require.Equal(t, "brand", q.Get("template"))
	require.Equal(t, brandOGTitle, q.Get("title"))
	require.Equal(t, "Raid logs for 9 World of Warcraft communities", q.Get("excerpt"))
	require.Equal(t, "choose.chronicleclassic.com", q.Get("host"))
	require.False(t, q.Has("product"), "the chooser has no tenant product")
	require.NotEmpty(t, q.Get("sig"))

	u, err = url.Parse(api.ChooseOGImageURL(req, 0))
	require.NoError(t, err)
	require.Equal(t, "Free raid log analysis for World of Warcraft", u.Query().Get("excerpt"))
}

func TestBrandOGCatchAll(t *testing.T) {
	t.Parallel()

	resolve := func(api *Service, target string) *frontend.OGData {
		r := chi.NewRouter()
		var got *frontend.OGData
		for _, route := range api.Routes() {
			resolve := route.Resolve
			r.Get(route.Pattern, func(_ http.ResponseWriter, r *http.Request) { got = resolve(r) })
		}
		r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, target, nil))
		return got
	}

	api := testOGImageAPI(t, "https://og.example.com")
	for _, page := range []string{"/blog/armory-refresh", "/blog", "/tools/some/deep/page", "/missing-page"} {
		og := resolve(api, "https://chronicleclassic.com"+page)
		require.NotNil(t, og, page)
		require.Contains(t, og.ImageURL, "template=brand", page)
		require.Empty(t, og.Title, "%s keeps its own rendered title", page)
		require.Empty(t, og.URL, "%s keeps its own canonical URL", page)
	}
	require.Nil(t, resolve(api, "https://chronicleclassic.com/c/assets/index-abc.js"), "static assets get no OG")
	require.Equal(t, "Leaderboards", resolve(api, "https://chronicleclassic.com/leaderboards").Title, "specific routes still win")
	require.Empty(t, resolve(testOGImageAPI(t, ""), "https://chronicleclassic.com/blog/armory-refresh").ImageURL,
		"no OG service → no image")
}
