package tenantcache

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

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
func waitIdle(t *testing.T, c *Cache[database.SiteStatsRow], key uuid.UUID) {
	t.Helper()
	require.Eventually(t, func() bool {
		c.mu.Lock()
		defer c.mu.Unlock()
		e := c.entries[key]
		return e != nil && !e.refreshing
	}, 5*time.Second, 5*time.Millisecond)
}

// expire makes the entry due for a refresh now.
func expire(c *Cache[database.SiteStatsRow], key uuid.UUID) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[key].nextRefresh = time.Time{}
}

func TestGet(t *testing.T) {
	t.Parallel()

	t.Run("RefreshesInBackgroundAtMostHourly", func(t *testing.T) {
		t.Parallel()
		var c Cache[database.SiteStatsRow]
		q := &fakeSiteStats{row: database.SiteStatsRow{LogsParsed: 7, BossKills: 2}}
		ctx := context.Background()

		require.Zero(t, c.Get(ctx, nil, q.SiteStats), "first read never waits on the query")
		require.Eventually(t, func() bool { return c.Get(ctx, nil, q.SiteStats).LogsParsed == 7 }, 5*time.Second, 5*time.Millisecond)
		for range 5 {
			require.Equal(t, int64(2), c.Get(ctx, nil, q.SiteStats).BossKills)
		}
		require.Equal(t, int32(1), q.calls.Load())

		// Past the hour, the old counts are served while one refresh runs.
		c.mu.Lock()
		require.WithinDuration(t, time.Now().Add(DefaultRefresh), c.entries[uuid.Nil].nextRefresh, time.Minute)
		c.mu.Unlock()
		expire(&c, uuid.Nil)
		q.set(database.SiteStatsRow{LogsParsed: 8}, nil)
		require.Equal(t, int64(7), c.Get(ctx, nil, q.SiteStats).LogsParsed)
		require.Eventually(t, func() bool { return c.Get(ctx, nil, q.SiteStats).LogsParsed == 8 }, 5*time.Second, 5*time.Millisecond)
		require.Equal(t, int32(2), q.calls.Load())
	})

	t.Run("PerTenant", func(t *testing.T) {
		t.Parallel()
		var c Cache[database.SiteStatsRow]
		site := &fakeSiteStats{row: database.SiteStatsRow{LogsParsed: 100}}
		tenant := &fakeSiteStats{row: database.SiteStatsRow{LogsParsed: 5}}
		tctx := servicetenant.WithTenantID(context.Background(), uuid.New())

		c.Get(context.Background(), nil, site.SiteStats)
		c.Get(tctx, nil, tenant.SiteStats)
		require.Eventually(t, func() bool {
			return c.Get(context.Background(), nil, site.SiteStats).LogsParsed == 100 && c.Get(tctx, nil, tenant.SiteStats).LogsParsed == 5
		}, 5*time.Second, 5*time.Millisecond)
	})

	t.Run("RefreshKeepsTenantButNotCancellation", func(t *testing.T) {
		t.Parallel()
		var c Cache[database.SiteStatsRow]
		q := &fakeSiteStats{row: database.SiteStatsRow{LogsParsed: 5}}
		tenantID := uuid.New()
		ctx, cancel := context.WithCancel(servicetenant.WithTenantID(context.Background(), tenantID))
		cancel() // the request is already gone when the refresh runs

		c.Get(ctx, nil, q.SiteStats)
		waitIdle(t, &c, tenantID)
		q.mu.Lock()
		defer q.mu.Unlock()
		require.Equal(t, tenantID, q.tenant, "the refresh must run under the request's tenant for RLS")
		require.NoError(t, q.ctxErr, "the refresh must not inherit the request's cancellation")
	})

	t.Run("ErrorKeepsLastCountsAndRetriesSooner", func(t *testing.T) {
		t.Parallel()
		var c Cache[database.SiteStatsRow]
		q := &fakeSiteStats{row: database.SiteStatsRow{LogsParsed: 7}}
		ctx := context.Background()

		c.Get(ctx, nil, q.SiteStats)
		waitIdle(t, &c, uuid.Nil)
		expire(&c, uuid.Nil)
		q.set(database.SiteStatsRow{}, errors.New("db down"))
		c.Get(ctx, nil, q.SiteStats)
		waitIdle(t, &c, uuid.Nil)

		require.Equal(t, int64(7), c.Get(ctx, nil, q.SiteStats).LogsParsed, "a failed query keeps the last counts")
		require.Equal(t, int32(2), q.calls.Load(), "no retry before DefaultRetry")
		c.mu.Lock()
		next := c.entries[uuid.Nil].nextRefresh
		c.mu.Unlock()
		require.WithinDuration(t, time.Now().Add(DefaultRetry), next, time.Minute)

		// After the retry wait, the next read retries and picks up new counts.
		expire(&c, uuid.Nil)
		q.set(database.SiteStatsRow{LogsParsed: 9}, nil)
		require.Eventually(t, func() bool { return c.Get(ctx, nil, q.SiteStats).LogsParsed == 9 }, 5*time.Second, 5*time.Millisecond)
	})

	t.Run("PanicIsRecovered", func(t *testing.T) {
		t.Parallel()
		var c Cache[database.SiteStatsRow]
		q := &fakeSiteStats{panics: true}
		ctx := context.Background()

		c.Get(ctx, nil, q.SiteStats)
		waitIdle(t, &c, uuid.Nil)
		c.mu.Lock()
		require.WithinDuration(t, time.Now().Add(DefaultRetry), c.entries[uuid.Nil].nextRefresh, time.Minute)
		c.mu.Unlock()

		// The entry isn't wedged: once due, it refreshes again.
		q.mu.Lock()
		q.panics, q.row = false, database.SiteStatsRow{LogsParsed: 3}
		q.mu.Unlock()
		expire(&c, uuid.Nil)
		require.Eventually(t, func() bool { return c.Get(ctx, nil, q.SiteStats).LogsParsed == 3 }, 5*time.Second, 5*time.Millisecond)
	})
}

func TestLoad(t *testing.T) {
	t.Parallel()

	t.Run("WaitsForFirstValueOnly", func(t *testing.T) {
		t.Parallel()
		var c Cache[database.SiteStatsRow]
		q := &fakeSiteStats{row: database.SiteStatsRow{LogsParsed: 7}}
		ctx := context.Background()

		got, err := c.Load(ctx, nil, q.SiteStats)
		require.NoError(t, err)
		require.Equal(t, int64(7), got.LogsParsed, "the first Load waits for real data")

		// Stale: the old value is served at once while one refresh runs.
		expire(&c, uuid.Nil)
		q.set(database.SiteStatsRow{LogsParsed: 8}, nil)
		got, err = c.Load(ctx, nil, q.SiteStats)
		require.NoError(t, err)
		require.Equal(t, int64(7), got.LogsParsed)
		waitIdle(t, &c, uuid.Nil)
		got, _ = c.Load(ctx, nil, q.SiteStats)
		require.Equal(t, int64(8), got.LogsParsed)
		require.Equal(t, int32(2), q.calls.Load())
	})

	t.Run("ConcurrentFirstLoadsShareOneFetch", func(t *testing.T) {
		t.Parallel()
		var c Cache[database.SiteStatsRow]
		q := &fakeSiteStats{row: database.SiteStatsRow{LogsParsed: 3}}
		var wg sync.WaitGroup
		for range 20 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				got, err := c.Load(context.Background(), nil, q.SiteStats)
				require.NoError(t, err)
				require.Equal(t, int64(3), got.LogsParsed)
			}()
		}
		wg.Wait()
		require.Equal(t, int32(1), q.calls.Load())
	})

	t.Run("FirstFetchErrorIsReturned", func(t *testing.T) {
		t.Parallel()
		var c Cache[database.SiteStatsRow]
		q := &fakeSiteStats{err: errors.New("db down")}
		_, err := c.Load(context.Background(), nil, q.SiteStats)
		require.ErrorContains(t, err, "db down")

		// Errors after a value has loaded keep serving it.
		expire(&c, uuid.Nil)
		q.set(database.SiteStatsRow{LogsParsed: 4}, nil)
		got, err := c.Load(context.Background(), nil, q.SiteStats)
		require.NoError(t, err)
		require.Equal(t, int64(4), got.LogsParsed)
		expire(&c, uuid.Nil)
		q.set(database.SiteStatsRow{}, errors.New("db down again"))
		got, err = c.Load(context.Background(), nil, q.SiteStats)
		require.NoError(t, err)
		require.Equal(t, int64(4), got.LogsParsed)
	})

	t.Run("RequestCancellation", func(t *testing.T) {
		t.Parallel()
		var c Cache[database.SiteStatsRow]
		release := make(chan struct{})
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		_, err := c.Load(ctx, nil, func(context.Context) (database.SiteStatsRow, error) {
			<-release
			return database.SiteStatsRow{LogsParsed: 1}, nil
		})
		require.ErrorIs(t, err, context.Canceled)
		close(release)
		waitIdle(t, &c, uuid.Nil)
		got, err := c.Load(context.Background(), nil, nil)
		require.NoError(t, err, "the refresh outlives the cancelled request")
		require.Equal(t, int64(1), got.LogsParsed)
	})
}
