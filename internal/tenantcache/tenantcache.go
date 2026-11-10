// Package tenantcache keeps one value per tenant, refreshed in the background.
//
// Entries are keyed by the request context's tenant (uuid.Nil for the site
// itself), never by request input, so the cache is bounded by the number of
// tenants. Refreshes keep the request's tenant and actor for row-level
// security but not its cancellation, and at most one runs per entry.
package tenantcache

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

const (
	// DefaultRefresh is how long a fetched value stays fresh.
	DefaultRefresh = time.Hour
	// DefaultRetry is the wait after a failed fetch.
	DefaultRetry = 5 * time.Minute
	// fetchTimeout bounds one background fetch.
	fetchTimeout = 30 * time.Second
)

// Cache holds one T per tenant. The zero value is ready to use with the
// default refresh and retry intervals.
type Cache[T any] struct {
	// Refresh and Retry override DefaultRefresh and DefaultRetry when set.
	Refresh time.Duration
	Retry   time.Duration

	mu      sync.Mutex
	entries map[uuid.UUID]*entry[T]
}

type entry[T any] struct {
	value       T
	loaded      bool
	err         error
	nextRefresh time.Time
	refreshing  bool
	// done is closed when the running refresh finishes.
	done chan struct{}
}

// Get returns the tenant's value without ever waiting on fetch: a stale or
// missing entry starts one background refresh, and Get returns what it has
// (the zero value before the first fetch lands). A failed fetch keeps the
// last value. Use it where a placeholder is acceptable, like link previews.
func (c *Cache[T]) Get(ctx context.Context, logger *slog.Logger, fetch func(context.Context) (T, error)) T {
	c.mu.Lock()
	defer c.mu.Unlock()
	e := c.entryLocked(ctx)
	c.refreshLocked(ctx, logger, fetch, e)
	return e.value
}

// Load is Get for callers that need real data: before the tenant's first
// successful fetch it waits for the refresh (or ctx) and returns its error.
// Once a value has loaded, Load serves it and refreshes in the background
// like Get.
func (c *Cache[T]) Load(ctx context.Context, logger *slog.Logger, fetch func(context.Context) (T, error)) (T, error) {
	c.mu.Lock()
	e := c.entryLocked(ctx)
	c.refreshLocked(ctx, logger, fetch, e)
	if e.loaded {
		value := e.value
		c.mu.Unlock()
		return value, nil
	}
	done := e.done
	c.mu.Unlock()

	if done != nil {
		select {
		case <-done:
		case <-ctx.Done():
			var zero T
			return zero, ctx.Err()
		}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if e.loaded {
		return e.value, nil
	}
	err := e.err
	if err == nil {
		err = errors.New("tenantcache: no value loaded")
	}
	var zero T
	return zero, err
}

func (c *Cache[T]) entryLocked(ctx context.Context) *entry[T] {
	key := servicetenant.TenantIDFromContext(ctx)
	if c.entries == nil {
		c.entries = make(map[uuid.UUID]*entry[T])
	}
	e := c.entries[key]
	if e == nil {
		e = &entry[T]{}
		c.entries[key] = e
	}
	return e
}

// refreshLocked starts a background fetch when e is due and none is running.
func (c *Cache[T]) refreshLocked(ctx context.Context, logger *slog.Logger, fetch func(context.Context) (T, error), e *entry[T]) {
	if e.refreshing || time.Now().Before(e.nextRefresh) {
		return
	}
	e.refreshing = true
	e.done = make(chan struct{})
	go c.refresh(context.WithoutCancel(ctx), logger, fetch, e)
}

func (c *Cache[T]) refresh(ctx context.Context, logger *slog.Logger, fetch func(context.Context) (T, error), e *entry[T]) {
	var (
		value T
		err   error
	)
	// Whatever happens, clear refreshing so the entry can refresh again; a
	// panic counts as a failed fetch.
	defer func() {
		if p := recover(); p != nil {
			if logger == nil {
				logger = slog.Default()
			}
			logger.Error("tenant cache refresh panicked", slog.Any("panic", p))
			err = errors.New("tenantcache: refresh panicked")
		}

		c.mu.Lock()
		defer c.mu.Unlock()
		e.refreshing = false
		e.err = err
		if err != nil {
			// Keep the last good value; retry sooner than a full interval.
			e.nextRefresh = time.Now().Add(c.retry())
		} else {
			e.value, e.loaded = value, true
			e.nextRefresh = time.Now().Add(c.refreshEvery())
		}
		close(e.done)
	}()

	ctx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()
	value, err = fetch(ctx)
}

func (c *Cache[T]) refreshEvery() time.Duration {
	if c.Refresh > 0 {
		return c.Refresh
	}
	return DefaultRefresh
}

func (c *Cache[T]) retry() time.Duration {
	if c.Retry > 0 {
		return c.Retry
	}
	return DefaultRetry
}
