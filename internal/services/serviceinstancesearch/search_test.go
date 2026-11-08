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
	limit := ratelimit.Limit{PerSecond: 0, Burst: 100}
	s := New(testutil.Logger(t), db, prometheus.NewRegistry(), func(context.Context, uuid.UUID) (UserAccess, error) {
		return UserAccess{Limit: limit, Tier: "free"}, nil
	})
	s.runtimeCost = func(time.Duration) int { return 1 }
	ctx := testutil.Context(t, testutil.WaitMedium)
	caller := Caller{UserID: uuid.New(), TenantID: uuid.New()}
	q := chroniclesdk.InstanceSearchQuery{}
	page, result := s.Search(ctx, caller, q)
	require.NoError(t, result.Err)
	require.NotNil(t, page.Results)
	require.Equal(t, 1, result.Cost)
	require.Equal(t, 1, result.RuntimeCost)
	require.Equal(t, 98.0, result.Status.Remaining)
	status, _, err := s.Peek(ctx, caller)
	require.NoError(t, err)
	require.Equal(t, 98.0, status.Remaining)
	_, result = s.Search(servicetenant.AdminBypass(ctx), caller, q)
	require.Error(t, result.Err)
	require.Equal(t, 0, result.Cost)
	// The rejected bypass must not charge the shared bucket.
	status, _, err = s.Peek(ctx, caller)
	require.NoError(t, err)
	require.Equal(t, 98.0, status.Remaining)
	_, result = s.Explain(ctx, caller, q, uuid.New())
	require.ErrorIs(t, result.Err, instancesearch.ErrNotFound)
	require.Equal(t, 1, result.Cost)
	require.False(t, errors.Is(result.Err, ErrInvalid))
}

func TestFieldTierRequirements(t *testing.T) {
	t.Parallel()
	db, _ := dbtestutil.NewDB(t)
	tiers := map[uuid.UUID]string{}
	free, honored := uuid.New(), uuid.New()
	tiers[free], tiers[honored] = "free", "honored"
	s := New(testutil.Logger(t), db, prometheus.NewRegistry(), func(_ context.Context, user uuid.UUID) (UserAccess, error) {
		return AccessForTier(tiers[user]), nil
	})
	s.search = func(context.Context, database.Store, instancesearch.Compiled, instancesearch.SearchOptions) (instancesearch.Page, error) {
		return instancesearch.Page{Results: []instancesearch.Result{}}, nil
	}
	s.explain = func(context.Context, database.Store, instancesearch.CompiledExplain, instancesearch.SearchOptions) (instancesearch.Explanation, error) {
		return instancesearch.Explanation{}, nil
	}
	s.runtimeCost = func(time.Duration) int { return 0 }

	pred := func(field string, op chroniclesdk.InstanceSearchOp, value any) chroniclesdk.InstanceSearchNode {
		return chroniclesdk.InstanceSearchNode{Field: field, Op: op, Value: value}
	}
	parse := pred("player.parse", chroniclesdk.InstanceSearchOpGte, 90)
	class := pred("player.class", chroniclesdk.InstanceSearchOpEq, "MAGE")
	zone := pred("instance.name", chroniclesdk.InstanceSearchOpEq, "Molten Core")
	idle := pred("instance.idle_time_ms", chroniclesdk.InstanceSearchOpLte, 60000)
	trees := map[string]chroniclesdk.InstanceSearchNode{
		"AnyPlayer":    {AnyPlayer: &parse},
		"Or":           {Or: []chroniclesdk.InstanceSearchNode{zone, idle}},
		"Not":          {Not: &idle},
		"CountPlayers": {CountPlayers: &chroniclesdk.InstanceSearchCount{Where: &chroniclesdk.InstanceSearchNode{And: []chroniclesdk.InstanceSearchNode{class, parse}}, Op: chroniclesdk.InstanceSearchOpGte, Value: 1}},
		"NestedOrInPlayer": {And: []chroniclesdk.InstanceSearchNode{zone, {AnyPlayer: &chroniclesdk.InstanceSearchNode{
			Or: []chroniclesdk.InstanceSearchNode{class, pred("player.dps", chroniclesdk.InstanceSearchOpGte, 1000)}}}}},
	}
	for name, tree := range trees {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx := testutil.Context(t, testutil.WaitShort)
			q := chroniclesdk.InstanceSearchQuery{Where: &tree}

			_, result := s.Search(ctx, Caller{UserID: free, TenantID: uuid.New()}, q)
			require.ErrorIs(t, result.Err, ErrSupporterRequired)
			require.Equal(t, "honored", result.RequiredTier)
			require.NotEmpty(t, result.RequiredField)
			_, result = s.Explain(ctx, Caller{UserID: free, TenantID: uuid.New()}, q, uuid.New())
			require.ErrorIs(t, result.Err, ErrSupporterRequired)
			require.Equal(t, "honored", result.RequiredTier)

			_, result = s.Search(ctx, Caller{UserID: honored, TenantID: uuid.New()}, q)
			require.NoError(t, result.Err)
			_, result = s.Explain(ctx, Caller{UserID: honored, TenantID: uuid.New()}, q, uuid.New())
			require.NoError(t, result.Err)
		})
	}

	t.Run("FreeFieldsStayFree", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		tree := chroniclesdk.InstanceSearchNode{And: []chroniclesdk.InstanceSearchNode{zone, {AnyPlayer: &class}}}
		_, result := s.Search(ctx, Caller{UserID: free, TenantID: uuid.New()}, chroniclesdk.InstanceSearchQuery{Where: &tree})
		require.NoError(t, result.Err)
	})

	t.Run("RejectedSearchIsNotCharged", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitShort)
		// An unknown user resolves to the free tier.
		caller := Caller{UserID: uuid.New(), TenantID: uuid.New()}
		tree := chroniclesdk.InstanceSearchNode{AnyPlayer: &parse}
		_, result := s.Search(ctx, caller, chroniclesdk.InstanceSearchQuery{Where: &tree})
		require.ErrorIs(t, result.Err, ErrSupporterRequired)
		status, _, err := s.Peek(ctx, caller)
		require.NoError(t, err)
		require.Equal(t, 100.0, status.Remaining)
	})
}
