package ratelimit_test

import (
	"context"
	"math"
	"net/http/httptest"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// age moves a bucket's last update into the past to simulate elapsed time.
func age(ctx context.Context, t *testing.T, db database.Store, key string, by time.Duration) {
	t.Helper()
	_, err := db.Exec(ctx, "UPDATE rate_limit_buckets SET updated_at = updated_at - $2::interval WHERE key = $1",
		key, by.String())
	require.NoError(t, err)
}

func TestTake(t *testing.T) {
	t.Parallel()
	db, _ := dbtestutil.NewDB(t)

	t.Run("BurstThenRefuse", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		l := ratelimit.New(db, "burst", ratelimit.PerMinute(6, 3))

		for i := range 3 {
			res, err := l.Take(ctx, "user:a", 1)
			require.NoError(t, err)
			require.True(t, res.Allowed, "take %d", i)
			// The bucket refills continuously between database calls, so assert
			// that each take spent one token without requiring an exact balance.
			expected := float64(2 - i)
			require.GreaterOrEqual(t, res.Remaining, expected)
			require.Less(t, res.Remaining, expected+1)
		}
		res, err := l.Take(ctx, "user:a", 1)
		require.NoError(t, err)
		require.False(t, res.Allowed)
		// 6 per minute = one token every 10s. Some fraction may already have
		// refilled while the preceding takes ran.
		require.Greater(t, res.RetryAfter, time.Duration(0))
		require.LessOrEqual(t, res.RetryAfter, 10*time.Second)

		rec := httptest.NewRecorder()
		ratelimit.SetRetryAfter(rec, res)
		require.Equal(t,
			strconv.FormatInt(int64(math.Ceil(res.RetryAfter.Seconds())), 10),
			rec.Header().Get("Retry-After"),
		)
	})

	t.Run("Refills", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		l := ratelimit.New(db, "refill", ratelimit.PerMinute(60, 2))

		for range 2 {
			res, err := l.Take(ctx, "user:a", 1)
			require.NoError(t, err)
			require.True(t, res.Allowed)
		}
		res, err := l.Take(ctx, "user:a", 1)
		require.NoError(t, err)
		require.False(t, res.Allowed)

		// One second refills one token at 60/min.
		age(ctx, t, db, "refill:user:a", 1500*time.Millisecond)
		res, err = l.Take(ctx, "user:a", 1)
		require.NoError(t, err)
		require.True(t, res.Allowed)

		// Refill is capped at burst.
		age(ctx, t, db, "refill:user:a", time.Hour)
		res, err = l.Take(ctx, "user:a", 0)
		require.NoError(t, err)
		require.True(t, res.Allowed)
		require.InDelta(t, 2, res.Remaining, 0.01)
	})

	t.Run("WeightedCost", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		l := ratelimit.New(db, "weighted", ratelimit.PerMinute(60, 10))

		res, err := l.Take(ctx, "user:a", 7)
		require.NoError(t, err)
		require.True(t, res.Allowed)
		// 3 left, so a cost of 4 is refused without spending anything.
		res, err = l.Take(ctx, "user:a", 4)
		require.NoError(t, err)
		require.False(t, res.Allowed)
		res, err = l.Take(ctx, "user:a", 3)
		require.NoError(t, err)
		require.True(t, res.Allowed)
	})

	t.Run("CostAboveBurstNeverAllowed", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		l := ratelimit.New(db, "toobig", ratelimit.PerMinute(60, 5))

		res, err := l.Take(ctx, "user:a", 6)
		require.NoError(t, err)
		require.False(t, res.Allowed)
		require.Equal(t, time.Duration(math.MaxInt64), res.RetryAfter)
		// The bucket was not drained.
		res, err = l.Take(ctx, "user:a", 5)
		require.NoError(t, err)
		require.True(t, res.Allowed)
	})

	t.Run("KeysAreIndependent", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		a := ratelimit.New(db, "indep-a", ratelimit.PerMinute(1, 1))
		b := ratelimit.New(db, "indep-b", ratelimit.PerMinute(1, 1))

		for _, take := range []func() (ratelimit.Result, error){
			func() (ratelimit.Result, error) { return a.Take(ctx, "user:1", 1) },
			func() (ratelimit.Result, error) { return a.Take(ctx, "user:2", 1) },
			func() (ratelimit.Result, error) { return b.Take(ctx, "user:1", 1) },
		} {
			res, err := take()
			require.NoError(t, err)
			require.True(t, res.Allowed)
		}
		res, err := a.Take(ctx, "user:1", 1)
		require.NoError(t, err)
		require.False(t, res.Allowed)
	})

	t.Run("ConcurrentTakesNeverOverspend", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitMedium)
		l := ratelimit.New(db, "concurrent", ratelimit.Limit{PerSecond: 0, Burst: 5})

		var (
			allowed atomic.Int64
			wg      sync.WaitGroup
		)
		for range 20 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				res, err := l.Take(ctx, "user:a", 1)
				if err == nil && res.Allowed {
					allowed.Add(1)
				}
			}()
		}
		wg.Wait()
		require.EqualValues(t, 5, allowed.Load())
	})

	t.Run("PeekDoesNotSpend", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		l := ratelimit.New(db, "peek", ratelimit.PerMinute(60, 10))

		// Unknown buckets are full.
		s, err := l.Peek(ctx, "user:a")
		require.NoError(t, err)
		require.Equal(t, ratelimit.Status{Limit: 10, Remaining: 10, Reset: 0}, s)

		_, err = l.Take(ctx, "user:a", 4)
		require.NoError(t, err)
		for range 2 {
			s, err = l.Peek(ctx, "user:a")
			require.NoError(t, err)
			require.InDelta(t, 6, s.Remaining, 0.1)
			// 4 tokens at 1/s.
			require.InDelta(t, 4*time.Second, s.Reset, float64(200*time.Millisecond))
		}
	})

	t.Run("Refund", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		l := ratelimit.New(db, "refund", ratelimit.PerMinute(1, 10))

		_, err := l.Take(ctx, "user:a", 7)
		require.NoError(t, err)
		s, err := l.Refund(ctx, "user:a", 5)
		require.NoError(t, err)
		require.InDelta(t, 8, s.Remaining, 0.1)
		// Refunds never overfill.
		s, err = l.Refund(ctx, "user:a", 50)
		require.NoError(t, err)
		require.InDelta(t, 10, s.Remaining, 0.01)
		_, err = l.Refund(ctx, "user:a", -1)
		require.Error(t, err)
	})

	t.Run("ForceTakeCanMakeBalanceNegative", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		l := ratelimit.New(db, "force", ratelimit.PerMinute(60, 10))

		_, err := l.Take(ctx, "user:a", 8)
		require.NoError(t, err)
		st, err := l.ForceTake(ctx, "user:a", 5)
		require.NoError(t, err)
		require.InDelta(t, -3, st.Remaining, 0.1)
		require.InDelta(t, 13*time.Second, st.Reset, float64(200*time.Millisecond))

		res, err := l.Take(ctx, "user:a", 1)
		require.NoError(t, err)
		require.False(t, res.Allowed)

		age(ctx, t, db, "force:user:a", 5*time.Second)
		res, err = l.Take(ctx, "user:a", 1)
		require.NoError(t, err)
		require.True(t, res.Allowed)

		_, err = l.ForceTake(ctx, "user:a", -1)
		require.Error(t, err)
	})

	t.Run("ConcurrentForceTakesAreSerialized", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitMedium)
		l := ratelimit.New(db, "force-concurrent", ratelimit.Limit{PerSecond: 0, Burst: 5})

		var wg sync.WaitGroup
		errs := make(chan error, 20)
		for range 20 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				_, err := l.ForceTake(ctx, "user:a", 1)
				errs <- err
			}()
		}
		wg.Wait()
		close(errs)
		for err := range errs {
			require.NoError(t, err)
		}

		st, err := l.Peek(ctx, "user:a")
		require.NoError(t, err)
		require.Equal(t, -15.0, st.Remaining)
	})

	t.Run("PerRequestLimitUsesSameBucket", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		l := ratelimit.New(db, "dynamic", ratelimit.PerMinute(60, 10))
		larger := ratelimit.PerMinute(60, 40)

		res, err := l.TakeWithLimit(ctx, "user:a", 7, larger)
		require.NoError(t, err)
		require.True(t, res.Allowed)
		require.Equal(t, 40.0, res.Limit)
		require.InDelta(t, 33, res.Remaining, 0.1)

		status, err := l.PeekWithLimit(ctx, "user:a", larger)
		require.NoError(t, err)
		require.Equal(t, 40.0, status.Limit)
		require.InDelta(t, 33, status.Remaining, 0.1)

		status, err = l.RefundWithLimit(ctx, "user:a", 3, larger)
		require.NoError(t, err)
		require.InDelta(t, 36, status.Remaining, 0.1)
	})

	t.Run("Headers", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		l := ratelimit.New(db, "headers", ratelimit.PerMinute(60, 10))

		res, err := l.Take(ctx, "user:a", 2.5)
		require.NoError(t, err)
		require.Equal(t, 10.0, res.Limit)
		rec := httptest.NewRecorder()
		ratelimit.SetHeaders(rec, res.Status)
		require.Equal(t, "10", rec.Header().Get("RateLimit-Limit"))
		require.Equal(t, "7", rec.Header().Get("RateLimit-Remaining"))
		require.Equal(t, "3", rec.Header().Get("RateLimit-Reset"))
	})

	t.Run("NegativeCost", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		_, err := ratelimit.New(db, "neg", ratelimit.PerMinute(1, 1)).Take(ctx, "user:a", -1)
		require.Error(t, err)
	})
}

func TestCleanup(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)
	l := ratelimit.New(db, "cleanup", ratelimit.PerMinute(1, 1))

	for _, subject := range []string{"user:old", "user:new"} {
		_, err := l.Take(ctx, subject, 1)
		require.NoError(t, err)
	}
	age(ctx, t, db, "cleanup:user:old", ratelimit.IdleBucketTTL+time.Minute)

	w := &ratelimit.CleanupWorker{Store: db}
	require.NoError(t, w.Work(ctx, &river.Job[ratelimit.ArgsCleanup]{}))

	var keys []string
	rows, err := db.Query(ctx, "SELECT key FROM rate_limit_buckets WHERE key LIKE 'cleanup:%'")
	require.NoError(t, err)
	for rows.Next() {
		var k string
		require.NoError(t, rows.Scan(&k))
		keys = append(keys, k)
	}
	require.NoError(t, rows.Err())
	require.Equal(t, []string{"cleanup:user:new"}, keys)
}
