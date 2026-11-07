package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"sync/atomic"
	"testing"
	"time"

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
	err   error
	row   database.SiteStatsRow
}

func (f *fakeSiteStats) SiteStats(context.Context) (database.SiteStatsRow, error) {
	f.calls.Add(1)
	return f.row, f.err
}

func TestOGSiteStatsCache(t *testing.T) {
	t.Parallel()

	t.Run("RefreshesInBackgroundAtMostHourly", func(t *testing.T) {
		t.Parallel()
		var c ogSiteStatsCache
		q := &fakeSiteStats{row: database.SiteStatsRow{LogsParsed: 7, BossKills: 2}}
		ctx := context.Background()

		require.Zero(t, c.get(ctx, q), "first read never waits on the query")
		require.Eventually(t, func() bool { return c.get(ctx, q).LogsParsed == 7 }, 5*time.Second, 5*time.Millisecond)
		for range 5 {
			require.Equal(t, int64(2), c.get(ctx, q).BossKills)
		}
		require.Equal(t, int32(1), q.calls.Load())

		// Past the hour, the old counts are served while one refresh runs.
		c.mu.Lock()
		c.entries[uuid.Nil].fetchedAt = time.Now().Add(-brandOGRefresh)
		c.mu.Unlock()
		q.row = database.SiteStatsRow{LogsParsed: 8}
		require.Equal(t, int64(7), c.get(ctx, q).LogsParsed)
		require.Eventually(t, func() bool { return c.get(ctx, q).LogsParsed == 8 }, 5*time.Second, 5*time.Millisecond)
		require.Equal(t, int32(2), q.calls.Load())
	})

	t.Run("PerTenant", func(t *testing.T) {
		t.Parallel()
		var c ogSiteStatsCache
		site := &fakeSiteStats{row: database.SiteStatsRow{LogsParsed: 100}}
		tenant := &fakeSiteStats{row: database.SiteStatsRow{LogsParsed: 5}}
		tctx := servicetenant.WithTenantID(context.Background(), uuid.New())

		c.get(context.Background(), site)
		c.get(tctx, tenant)
		require.Eventually(t, func() bool {
			return c.get(context.Background(), site).LogsParsed == 100 && c.get(tctx, tenant).LogsParsed == 5
		}, 5*time.Second, 5*time.Millisecond)
	})

	t.Run("ErrorKeepsLastCountsAndWaits", func(t *testing.T) {
		t.Parallel()
		var c ogSiteStatsCache
		q := &fakeSiteStats{err: errors.New("db down")}
		ctx := context.Background()

		c.get(ctx, q)
		require.Eventually(t, func() bool {
			c.mu.Lock()
			defer c.mu.Unlock()
			return !c.entries[uuid.Nil].refreshing
		}, 5*time.Second, 5*time.Millisecond)
		require.Zero(t, c.get(ctx, q))
		require.Equal(t, int32(1), q.calls.Load(), "a failed query is not retried within the hour")
	})
}
