package api

import (
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/services/serviceog"
)

// OGService resolves Open Graph metadata for frontend routes.
type OGService interface {
	Routes() []frontend.OGRoute
}

// OGRoutes returns the Open Graph route definitions for the frontend handler.
// When no OG service is injected, it builds the static-only resolver so the
// pre-generated metadata remains available.
func (api *API) OGRoutes() []frontend.OGRoute {
	if api != nil && api.Opts != nil && api.Opts.OG != nil {
		return api.Opts.OG.Routes()
	}

	var opts serviceog.Options
	if api != nil && api.Opts != nil {
		opts = serviceog.Options{
			Logger:    api.Opts.Logger,
			Zed:       api.Opts.Zed,
			Chronicle: api.Opts.Chronicle,
			Tenant:    api.Opts.Tenant,
			Dataset:   api.Opts.Dataset,
			AccessURL: api.Opts.AccessURL,
		}
	}
	return serviceog.New(opts).Routes()
}
