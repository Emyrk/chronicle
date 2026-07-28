package servicetenant

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

type tenantCtxKey struct{}
type tenantBypassKey struct{}

// WithTenant injects the resolved tenant into the context.
func WithTenant(ctx context.Context, t database.Tenant) context.Context {
	return context.WithValue(ctx, tenantCtxKey{}, t)
}

// TenantFromContext returns the tenant for the current request, or nil if
// running on the root domain (no tenant context).
func TenantFromContext(ctx context.Context) *database.Tenant {
	v, ok := ctx.Value(tenantCtxKey{}).(database.Tenant)
	if !ok {
		return nil
	}
	return &v
}

// WithTenantID injects a minimal tenant with only the ID set. Use when only
// the tenant UUID is available (e.g. restoring tenant context from job args).
func WithTenantID(ctx context.Context, id uuid.UUID) context.Context {
	return WithTenant(ctx, database.Tenant{ID: id})
}

// TenantIDFromContext returns the tenant UUID from context, or uuid.Nil if unset.
func TenantIDFromContext(ctx context.Context) uuid.UUID {
	t := TenantFromContext(ctx)
	if t == nil {
		return uuid.Nil
	}
	return t.ID
}

// AdminBypass returns a context that causes PrepareConn to set
// app.tenant_bypass = 'true', skipping RLS filtering.
// Use for admin endpoints, background jobs, and migrations.
func AdminBypass(ctx context.Context) context.Context {
	return context.WithValue(ctx, tenantBypassKey{}, true)
}

func AdminBypassMW(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := AdminBypass(r.Context())
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func isBypass(ctx context.Context) bool {
	v, _ := ctx.Value(tenantBypassKey{}).(bool)
	return v
}

// IsAdminBypass reports whether the context skips RLS tenant filtering.
// Callers that cache query results per tenant must consult this: bypassed
// results span every tenant and cannot be shared with tenant-scoped traffic.
func IsAdminBypass(ctx context.Context) bool {
	return isBypass(ctx)
}
