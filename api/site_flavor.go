package api

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

func (api *API) resolvedSiteFlavor(ctx context.Context) database.WoWFlavor {
	return api.Opts.Dataset.SiteFlavor(ctx, servicetenant.TenantFromContext(ctx))
}

func (api *API) blogFlavorResolver(r *http.Request) []string {
	return api.resolvedSiteFlavor(r.Context()).Strings()
}
