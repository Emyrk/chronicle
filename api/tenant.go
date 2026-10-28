package api

import (
	"net/http"
)

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
