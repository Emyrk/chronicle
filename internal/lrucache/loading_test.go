package lrucache_test

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/internal/lrucache"
)

func newLoading(t *testing.T, ttl time.Duration) *lrucache.Loading[string] {
	t.Helper()

	c, err := lrucache.New(lrucache.Opts[string, string]{
		Name:     "test",
		Capacity: 16,
		TTL:      ttl,
	})
	if err != nil {
		t.Fatalf("new cache: %v", err)
	}
	return lrucache.NewLoading(c, time.Minute)
}

// TestGetOrLoadCoalesces is the property the homepage depends on: many
// concurrent callers for one key produce one backend query.
func TestGetOrLoadCoalesces(t *testing.T) {
	t.Parallel()

	l := newLoading(t, time.Minute)

	var loads, entered atomic.Int64
	release := make(chan struct{})
	load := func(context.Context) (string, error) {
		loads.Add(1)
		<-release
		return "value", nil
	}

	const callers = 25
	var wg sync.WaitGroup
	results := make([]string, callers)
	for i := range callers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			entered.Add(1)
			v, err := l.GetOrLoad(t.Context(), "key", load)
			if err != nil {
				t.Errorf("GetOrLoad: %v", err)
				return
			}
			results[i] = v
		}()
	}

	// Hold the single in-flight load until every caller has arrived, so they
	// all attach to the same flight.
	for entered.Load() < callers {
		time.Sleep(time.Millisecond)
	}
	close(release)
	wg.Wait()

	if got := loads.Load(); got != 1 {
		t.Errorf("loader called %d times, want 1", got)
	}
	for i, v := range results {
		if v != "value" {
			t.Errorf("caller %d got %q, want %q", i, v, "value")
		}
	}
}

func TestGetOrLoadServesFromCache(t *testing.T) {
	t.Parallel()

	l := newLoading(t, time.Minute)

	var loads atomic.Int64
	load := func(context.Context) (string, error) {
		loads.Add(1)
		return "value", nil
	}

	for range 3 {
		v, err := l.GetOrLoad(t.Context(), "key", load)
		if err != nil {
			t.Fatalf("GetOrLoad: %v", err)
		}
		if v != "value" {
			t.Fatalf("got %q, want %q", v, "value")
		}
	}

	if got := loads.Load(); got != 1 {
		t.Errorf("loader called %d times, want 1", got)
	}
}

// TestGetOrLoadDoesNotCacheErrors keeps a transient DB failure from being
// pinned for the whole TTL.
func TestGetOrLoadDoesNotCacheErrors(t *testing.T) {
	t.Parallel()

	l := newLoading(t, time.Minute)
	sentinel := errors.New("boom")

	var loads atomic.Int64
	load := func(context.Context) (string, error) {
		if loads.Add(1) == 1 {
			return "", sentinel
		}
		return "value", nil
	}

	if _, err := l.GetOrLoad(t.Context(), "key", load); !errors.Is(err, sentinel) {
		t.Fatalf("first call error = %v, want %v", err, sentinel)
	}

	v, err := l.GetOrLoad(t.Context(), "key", load)
	if err != nil {
		t.Fatalf("second call: %v", err)
	}
	if v != "value" {
		t.Errorf("got %q, want %q", v, "value")
	}
	if got := loads.Load(); got != 2 {
		t.Errorf("loader called %d times, want 2", got)
	}
}

// TestGetOrLoadDetachesLoaderContext pins that a caller giving up does not
// cancel the shared load: the value must still reach the cache for the next
// caller.
func TestGetOrLoadDetachesLoaderContext(t *testing.T) {
	t.Parallel()

	l := newLoading(t, time.Minute)

	started := make(chan struct{})
	unblock := make(chan struct{})
	loadErr := make(chan error, 1)

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	done := make(chan struct{})
	go func() {
		defer close(done)
		_, err := l.GetOrLoad(ctx, "key", func(loadCtx context.Context) (string, error) {
			close(started)
			<-unblock
			loadErr <- loadCtx.Err()
			return "value", nil
		})
		if !errors.Is(err, context.Canceled) {
			t.Errorf("caller error = %v, want context.Canceled", err)
		}
	}()

	<-started
	cancel()
	<-done // the caller returned early
	close(unblock)

	if err := <-loadErr; err != nil {
		t.Errorf("loader context was cancelled with %v, want it to survive the caller", err)
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if v, ok := l.Cache().Get("key"); ok {
			if v != "value" {
				t.Fatalf("cached %q, want %q", v, "value")
			}
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("loader result never reached the cache")
}
