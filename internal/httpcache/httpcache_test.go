package httpcache_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/internal/httpcache"
	"github.com/Emyrk/chronicle/internal/lrucache"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
)

func newCache(t *testing.T) *httpcache.Cache {
	t.Helper()

	c, err := lrucache.New(lrucache.Opts[string, []byte]{
		Name:     "test_responses",
		Capacity: 32,
		TTL:      time.Minute,
	})
	if err != nil {
		t.Fatalf("new cache: %v", err)
	}
	return httpcache.New(lrucache.NewLoading(c, time.Minute))
}

type payload struct {
	Value string `json:"value"`
}

// serve issues one request and returns the decoded body.
func serve(t *testing.T, c *httpcache.Cache, r *http.Request, load func(context.Context) (any, error)) payload {
	t.Helper()

	rec := httptest.NewRecorder()
	if err := c.Serve(rec, r, load); err != nil {
		t.Fatalf("Serve: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Errorf("content-type = %q", ct)
	}

	var got payload
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode body %q: %v", rec.Body.String(), err)
	}
	return got
}

func request(t *testing.T, target string, tenantID uuid.UUID, bypass bool) *http.Request {
	t.Helper()

	r := httptest.NewRequest(http.MethodGet, target, nil)
	ctx := r.Context()
	if tenantID != uuid.Nil {
		ctx = servicetenant.WithTenantID(ctx, tenantID)
	}
	if bypass {
		ctx = servicetenant.AdminBypass(ctx)
	}
	return r.WithContext(ctx)
}

func TestServeCachesByURL(t *testing.T) {
	t.Parallel()

	c := newCache(t)
	var loads atomic.Int64
	load := func(context.Context) (any, error) {
		loads.Add(1)
		return payload{Value: "a"}, nil
	}

	for range 3 {
		if got := serve(t, c, request(t, "/rankings/leaderboard?instance_names=MC", uuid.Nil, false), load); got.Value != "a" {
			t.Fatalf("value = %q, want %q", got.Value, "a")
		}
	}
	if got := loads.Load(); got != 1 {
		t.Errorf("loader called %d times, want 1", got)
	}

	// A different query is a different entry.
	serve(t, c, request(t, "/rankings/leaderboard?instance_names=BWL", uuid.Nil, false), load)
	if got := loads.Load(); got != 2 {
		t.Errorf("loader called %d times after new query, want 2", got)
	}
}

// TestServeKeysOnQueryOrder pins that equivalent URLs share one entry, so
// parameter ordering does not fragment the cache.
func TestServeKeysOnQueryOrder(t *testing.T) {
	t.Parallel()

	c := newCache(t)
	var loads atomic.Int64
	load := func(context.Context) (any, error) {
		loads.Add(1)
		return payload{Value: "a"}, nil
	}

	serve(t, c, request(t, "/leaderboard?a=1&b=2", uuid.Nil, false), load)
	serve(t, c, request(t, "/leaderboard?b=2&a=1", uuid.Nil, false), load)

	if got := loads.Load(); got != 1 {
		t.Errorf("loader called %d times, want 1", got)
	}
}

// TestServeIsolatesTenants is the security-relevant case: these queries are
// RLS-filtered per tenant, so two tenants must never share a cached body.
func TestServeIsolatesTenants(t *testing.T) {
	t.Parallel()

	c := newCache(t)
	tenantA, tenantB := uuid.New(), uuid.New()

	loadFor := func(v string) func(context.Context) (any, error) {
		return func(context.Context) (any, error) { return payload{Value: v}, nil }
	}

	if got := serve(t, c, request(t, "/leaderboard", tenantA, false), loadFor("a")); got.Value != "a" {
		t.Fatalf("tenant A got %q", got.Value)
	}
	if got := serve(t, c, request(t, "/leaderboard", tenantB, false), loadFor("b")); got.Value != "b" {
		t.Fatalf("tenant B got %q, want its own result", got.Value)
	}
	// Tenant A still sees its own entry.
	if got := serve(t, c, request(t, "/leaderboard", tenantA, false), loadFor("unused")); got.Value != "a" {
		t.Fatalf("tenant A got %q after tenant B request", got.Value)
	}
}

// TestServeSkipsCacheOnAdminBypass: bypassed results are not RLS-filtered and
// must neither be served from nor written to the shared cache.
func TestServeSkipsCacheOnAdminBypass(t *testing.T) {
	t.Parallel()

	c := newCache(t)
	var loads atomic.Int64
	load := func(context.Context) (any, error) {
		loads.Add(1)
		return payload{Value: "all-tenants"}, nil
	}

	for range 2 {
		serve(t, c, request(t, "/leaderboard", uuid.Nil, true), load)
	}
	if got := loads.Load(); got != 2 {
		t.Errorf("loader called %d times under bypass, want 2 (no caching)", got)
	}

	// The bypassed result must not be visible to a tenant-scoped request.
	got := serve(t, c, request(t, "/leaderboard", uuid.Nil, false), func(context.Context) (any, error) {
		return payload{Value: "scoped"}, nil
	})
	if got.Value != "scoped" {
		t.Errorf("scoped request got %q, want %q", got.Value, "scoped")
	}
}

func TestServeReturnsLoaderError(t *testing.T) {
	t.Parallel()

	c := newCache(t)
	sentinel := errors.New("query failed")

	rec := httptest.NewRecorder()
	err := c.Serve(rec, request(t, "/leaderboard", uuid.Nil, false), func(context.Context) (any, error) {
		return nil, sentinel
	})
	if !errors.Is(err, sentinel) {
		t.Fatalf("err = %v, want %v", err, sentinel)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("body written on error: %q", rec.Body.String())
	}
}

// TestNilCacheServesDirectly keeps wiring optional for tests and CLI tools.
func TestNilCacheServesDirectly(t *testing.T) {
	t.Parallel()

	var c *httpcache.Cache
	if got := serve(t, c, request(t, "/leaderboard", uuid.Nil, false), func(context.Context) (any, error) {
		return payload{Value: "direct"}, nil
	}); got.Value != "direct" {
		t.Errorf("value = %q, want %q", got.Value, "direct")
	}
}
