package servicetenant

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/internal/services/servicecache"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestTenantInvalidationTimeoutDoesNotBlockOtherNamespaces(t *testing.T) {
	t.Parallel()

	cacheSvc := servicecache.New(nil)
	started := make(chan struct{})
	calls := 0
	require.NoError(t, registerCacheInvalidatorWithTimeout(cacheSvc, func(ctx context.Context) error {
		calls++
		if calls == 1 {
			close(started)
			<-ctx.Done()
			return ctx.Err()
		}
		return nil
	}, 100*time.Millisecond))

	otherCalls := make(chan struct{}, 1)
	require.NoError(t, cacheSvc.RegisterInvalidator(servicecache.NamespaceItems, servicecache.ScopeDataset, "items", func(context.Context, servicecache.Invalidation) error {
		otherCalls <- struct{}{}
		return nil
	}))

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	firstDone := make(chan error, 1)
	go func() {
		firstDone <- cacheSvc.ApplyPublished(ctx, servicecache.PublishedGeneration{
			Invalidation: servicecache.GlobalInvalidation(servicecache.NamespaceTenantSlugs),
			Generation:   1,
		})
	}()
	select {
	case <-started:
	case <-ctx.Done():
		require.FailNow(t, "tenant invalidation did not start", ctx.Err().Error())
	}
	otherDone := make(chan error, 1)
	go func() {
		otherDone <- cacheSvc.ApplyPublished(ctx, servicecache.PublishedGeneration{
			Invalidation: servicecache.DatasetInvalidation(servicecache.NamespaceItems, uuid.New()),
			Generation:   1,
		})
	}()
	select {
	case err := <-firstDone:
		require.ErrorIs(t, err, context.DeadlineExceeded)
	case <-ctx.Done():
		require.FailNow(t, "tenant invalidation held reconciliation lock indefinitely", ctx.Err().Error())
	}
	select {
	case err := <-otherDone:
		require.NoError(t, err)
	case <-ctx.Done():
		require.FailNow(t, "other namespace could not reconcile", ctx.Err().Error())
	}
	select {
	case <-otherCalls:
	default:
		require.Fail(t, "other invalidator was not called")
	}

	// The timed-out handler must remain eligible for the next generation scan.
	require.NoError(t, cacheSvc.ApplyPublished(ctx, servicecache.PublishedGeneration{
		Invalidation: servicecache.GlobalInvalidation(servicecache.NamespaceTenantSlugs),
		Generation:   1,
	}))
	require.Equal(t, 2, calls)
}

func TestTenantCacheInvalidationAdapter(t *testing.T) {
	t.Parallel()

	cacheSvc := servicecache.New(nil)
	calls := 0
	require.NoError(t, registerCacheInvalidator(cacheSvc, func(context.Context) error {
		calls++
		return nil
	}))

	require.NoError(t, cacheSvc.Invalidate(context.Background(), servicecache.GlobalInvalidation(servicecache.NamespaceTenantSlugs)))
	require.Equal(t, 1, calls)
}
