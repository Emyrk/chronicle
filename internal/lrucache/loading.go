package lrucache

import (
	"context"
	"time"

	"golang.org/x/sync/singleflight"
)

// Loading is a string-keyed [Cache] with a coalescing loader. Concurrent
// GetOrLoad calls for the same key run the loader once and share its result,
// so a cold cache under load produces one backend query instead of one per
// caller.
//
// Loader errors are never cached: the failing call and every caller sharing
// its flight receive the error, and the next call retries.
type Loading[V any] struct {
	cache       *Cache[string, V]
	group       singleflight.Group
	loadTimeout time.Duration
}

// NewLoading wraps an existing cache with a loader. Prefer
// servicecache.NewLoadingCache so the cache is registered for admin
// introspection.
//
// loadTimeout bounds a single loader invocation. It must be > 0.
func NewLoading[V any](cache *Cache[string, V], loadTimeout time.Duration) *Loading[V] {
	return &Loading[V]{cache: cache, loadTimeout: loadTimeout}
}

// Cache exposes the underlying cache, e.g. for Purge or Len.
func (l *Loading[V]) Cache() *Cache[string, V] { return l.cache }

// GetOrLoad returns the cached value for key, invoking load exactly once
// across all concurrent callers on a miss.
//
// load runs on a context detached from the caller's cancellation (values are
// preserved, so tenant scoping still applies) and bounded by the configured
// load timeout. Detaching matters because the caller that happens to win the
// flight may disconnect, and cancelling its context would fail every other
// caller waiting on the same result.
func (l *Loading[V]) GetOrLoad(ctx context.Context, key string, load func(context.Context) (V, error)) (V, error) {
	if v, ok := l.cache.Get(key); ok {
		return v, nil
	}

	ch := l.group.DoChan(key, func() (any, error) {
		loadCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), l.loadTimeout)
		defer cancel()

		v, err := load(loadCtx)
		if err != nil {
			return nil, err
		}
		l.cache.Add(key, v)
		return v, nil
	})

	var zero V
	select {
	case <-ctx.Done():
		// The caller gave up. The flight keeps running so the result still
		// lands in the cache for whoever asks next.
		return zero, ctx.Err()
	case res := <-ch:
		if res.Err != nil {
			return zero, res.Err
		}
		v, ok := res.Val.(V)
		if !ok {
			return zero, nil
		}
		return v, nil
	}
}
