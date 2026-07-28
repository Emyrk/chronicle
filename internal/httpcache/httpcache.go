// Package httpcache serves cached JSON responses for expensive read-only
// endpoints. It combines a TTL LRU with singleflight, so a cold entry under
// concurrent load costs one backend query rather than one per request.
package httpcache

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strings"

	"github.com/Emyrk/chronicle/internal/lrucache"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// Cache serves cached JSON bodies keyed by tenant scope and request URL.
// A nil *Cache is valid and disables caching, which keeps wiring optional
// for tests and CLI tools that do not boot the full service DAG.
type Cache struct {
	loader *lrucache.Loading[[]byte]
}

// New wraps a loading cache of marshalled response bodies.
func New(loader *lrucache.Loading[[]byte]) *Cache {
	return &Cache{loader: loader}
}

// RequestKey builds the cache key for r.
//
// The tenant ID is part of the key because these queries are filtered by
// Postgres RLS on app.tenant_id: two tenants issuing an identical request
// must never share an entry.
func RequestKey(r *http.Request) string {
	var b strings.Builder
	b.WriteString(servicetenant.TenantIDFromContext(r.Context()).String())
	b.WriteByte('|')
	b.WriteString(r.URL.Path)
	b.WriteByte('|')
	b.WriteString(canonicalQuery(r))
	return b.String()
}

// canonicalQuery renders the query string with keys and repeated values
// sorted, so that parameter order does not fragment the cache.
func canonicalQuery(r *http.Request) string {
	q := r.URL.Query()
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	for _, k := range keys {
		values := append([]string(nil), q[k]...)
		sort.Strings(values)
		for _, v := range values {
			b.WriteString(k)
			b.WriteByte('=')
			b.WriteString(v)
			b.WriteByte('&')
		}
	}
	return b.String()
}

// Serve writes the cached JSON body for r, invoking load on a miss. It
// returns the loader's error without writing a response, leaving error
// rendering to the caller.
//
// Requests running under servicetenant.AdminBypass skip the cache entirely
// in both directions: their results are not RLS-filtered and must not be
// served to, or populated from, tenant-scoped traffic.
func (c *Cache) Serve(w http.ResponseWriter, r *http.Request, load func(context.Context) (any, error)) error {
	ctx := r.Context()

	if c == nil || c.loader == nil || servicetenant.IsAdminBypass(ctx) {
		value, err := load(ctx)
		if err != nil {
			return err
		}
		return writeJSON(w, value)
	}

	body, err := c.loader.GetOrLoad(ctx, RequestKey(r), func(loadCtx context.Context) ([]byte, error) {
		value, err := load(loadCtx)
		if err != nil {
			return nil, err
		}
		return json.Marshal(value)
	})
	if err != nil {
		return err
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
	return nil
}

func writeJSON(w http.ResponseWriter, value any) error {
	body, err := json.Marshal(value)
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
	return nil
}
