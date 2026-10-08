package api

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Gophercraft/core/vsn"
)

func (api *API) resolvedSiteFlavor(ctx context.Context) database.WoWFlavor {
	tenant := servicetenant.TenantFromContext(ctx)
	if tenant != nil && tenant.DefaultDatasetID.Valid && api.Opts.Dataset != nil {
		dataset, err := api.Opts.Dataset.GetDataset(ctx, tenant.DefaultDatasetID.UUID)
		if err == nil {
			flavor := database.FlavorFromStrings(dataset.DefaultFlavor).
				Merge(database.FlavorFromStrings(tenant.AdditionalFlavor))
			if len(flavor) > 0 {
				return flavor
			}
		}
	}

	base := database.FlavorVanilla
	if services.ServerBuild == vsn.V3_3_5a {
		base = database.FlavorWrath
	}
	return database.ServerFlavor(services.ServerName, base)
}

func (api *API) blogFlavorResolver(r *http.Request) []string {
	return api.resolvedSiteFlavor(r.Context()).Strings()
}
