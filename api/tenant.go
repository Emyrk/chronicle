package api

import (
	"net"
	"net/http"
	"strings"
)

const (
	metricTenantRoot    = "root"
	metricTenantUnknown = "unknown"
)

func (api *API) isAccessURLHost(host string) bool {
	if api.Opts.AccessURL == nil {
		return false
	}
	if hostname, _, err := net.SplitHostPort(host); err == nil {
		host = hostname
	}
	return strings.EqualFold(host, api.Opts.AccessURL.Hostname())
}

// metricTenant returns a bounded tenant label for HTTP metrics. Only slugs in
// the tenant service's cache are exposed, so arbitrary Host headers cannot
// create unbounded Prometheus series.
func (api *API) metricTenant(r *http.Request) string {
	if api.Opts.Tenant == nil {
		return metricTenantRoot
	}
	if api.isAccessURLHost(r.Host) {
		return metricTenantRoot
	}
	slug := api.Opts.Tenant.ExtractSlug(r.Host)
	if slug == "" {
		return metricTenantRoot
	}
	if _, ok := api.Opts.Tenant.GetTenantBySlug(slug); !ok {
		return metricTenantUnknown
	}
	return slug
}

// tenantMiddleware delegates to servicetenant.Middleware if configured,
// otherwise it's a no-op (single-tenant mode). The chooser subdomain is not a
// tenant: servicechoose serves it and passes its assets through untenanted.
func (api *API) tenantMiddleware(next http.Handler) http.Handler {
	if api.Opts.Tenant == nil {
		return next
	}
	tenanted := api.Opts.Tenant.Middleware(next)
	if api.Opts.Choose == nil {
		return tenanted
	}
	return api.Opts.Choose.Middleware(next, tenanted)
}
