package serviceinstancesearch

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/instancesearch"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/require"
)

func TestRuntimeCost(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name    string
		elapsed time.Duration
		want    int
	}{
		{name: "Zero", elapsed: 0, want: 0},
		{name: "RoundsUp", elapsed: time.Nanosecond, want: 1},
		{name: "OneToken", elapsed: 100 * time.Millisecond, want: 1},
		{name: "NextToken", elapsed: 100*time.Millisecond + time.Nanosecond, want: 2},
		{name: "FiveSeconds", elapsed: 5 * time.Second, want: 50},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tc.want, runtimeCost(tc.elapsed))
		})
	}
}

func TestRuntimeChargeCanExceedBudget(t *testing.T) {
	t.Parallel()
	db, _ := dbtestutil.NewDB(t)
	s := New(testutil.Logger(t), db, prometheus.NewRegistry(), func(context.Context, uuid.UUID) (UserAccess, error) {
		return UserAccess{Limit: ratelimit.Limit{PerSecond: 0, Burst: 5}, Tier: "free"}, nil
	})
	s.runtimeCost = func(time.Duration) int { return 10 }
	s.search = func(context.Context, database.Store, instancesearch.Compiled, instancesearch.SearchOptions) (instancesearch.Page, error) {
		return instancesearch.Page{Results: []instancesearch.Result{}}, nil
	}
	ctx := testutil.Context(t, testutil.WaitShort)
	caller := Caller{UserID: uuid.New(), TenantID: uuid.New()}

	_, result := s.Search(ctx, caller, chroniclesdk.InstanceSearchQuery{})
	require.NoError(t, result.Err)
	require.Equal(t, 1, result.Cost)
	require.Equal(t, 10, result.RuntimeCost)
	require.Equal(t, -6.0, result.Status.Remaining)

	_, result = s.Search(ctx, caller, chroniclesdk.InstanceSearchQuery{})
	require.ErrorIs(t, result.Err, ErrRateLimited)
	require.Zero(t, result.RuntimeCost)
}

func TestCancellationStillChargesRuntime(t *testing.T) {
	t.Parallel()
	db, _ := dbtestutil.NewDB(t)
	limit := ratelimit.Limit{PerSecond: 0, Burst: 100}
	s := New(testutil.Logger(t), db, prometheus.NewRegistry(), func(context.Context, uuid.UUID) (UserAccess, error) {
		return UserAccess{Limit: limit, Tier: "free"}, nil
	})
	s.runtimeCost = func(time.Duration) int { return 7 }
	started := make(chan struct{})
	s.search = func(ctx context.Context, _ database.Store, _ instancesearch.Compiled, _ instancesearch.SearchOptions) (instancesearch.Page, error) {
		close(started)
		<-ctx.Done()
		return instancesearch.Page{}, ctx.Err()
	}
	baseCtx := testutil.Context(t, testutil.WaitShort)
	ctx, cancel := context.WithCancel(baseCtx)
	caller := Caller{UserID: uuid.New(), TenantID: uuid.New()}
	results := make(chan Result, 1)
	go func() {
		_, result := s.Search(ctx, caller, chroniclesdk.InstanceSearchQuery{})
		results <- result
	}()

	select {
	case <-started:
	case <-baseCtx.Done():
		t.Fatal("search did not start")
	}
	cancel()
	var result Result
	select {
	case result = <-results:
	case <-baseCtx.Done():
		t.Fatal("canceled search did not finish")
	}
	require.ErrorIs(t, result.Err, context.Canceled)
	require.Equal(t, 1, result.Cost)
	require.Equal(t, 7, result.RuntimeCost)
	require.Equal(t, 92.0, result.Status.Remaining)

	status, _, err := s.Peek(testutil.Context(t, testutil.WaitShort), caller)
	require.NoError(t, err)
	require.Equal(t, 92.0, status.Remaining)
}

func TestSearchGoCaller(t *testing.T) {
	t.Parallel()
	db, _ := dbtestutil.NewDB(t)
	s := New(testutil.Logger(t), db, prometheus.NewRegistry(), nil)
	s.runtimeCost = func(time.Duration) int { return 1 }
	ctx := testutil.Context(t, testutil.WaitMedium)
	caller := Caller{UserID: uuid.New(), TenantID: uuid.New()}
	q := chroniclesdk.InstanceSearchQuery{}
	page, result := s.Search(ctx, caller, q)
	require.NoError(t, result.Err)
	require.NotNil(t, page.Results)
	require.Equal(t, 1, result.Cost)
	require.Equal(t, 1, result.RuntimeCost)
	require.InDelta(t, 98, result.Status.Remaining, 0.1)
	status, _, err := s.Peek(ctx, caller)
	require.NoError(t, err)
	require.InDelta(t, 98, status.Remaining, 1)
	_, result = s.Search(servicetenant.AdminBypass(ctx), caller, q)
	require.Error(t, result.Err)
	require.Equal(t, 0, result.Cost)
	// The rejected bypass must not charge the shared bucket.
	status, _, err = s.Peek(ctx, caller)
	require.NoError(t, err)
	require.InDelta(t, 98, status.Remaining, 1)
	_, result = s.Explain(ctx, caller, q, uuid.New())
	require.ErrorIs(t, result.Err, instancesearch.ErrNotFound)
	require.Equal(t, 1, result.Cost)
	require.False(t, errors.Is(result.Err, ErrInvalid))
}
