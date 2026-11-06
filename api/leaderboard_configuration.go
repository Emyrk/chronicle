package api

import (
	"context"
	"errors"
	"net/http"
	"slices"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
)

type leaderboardConfigurationStore interface {
	leaderboardconfig.Store
	GetDataset(context.Context, uuid.UUID) (database.Dataset, error)
	ListLeaderboardLayers(context.Context) ([]database.LeaderboardLayer, error)
}

// LeaderboardConfiguration shows the request tenant's resolved configuration.
// A tenant subdomain only ever sees its own configuration. The root site may
// pick a tenant with ?tenant=<slug|id>: discoverable tenants for everyone, and
// every tenant for admin_servers holders.
func (api *API) LeaderboardConfiguration(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	requested := r.URL.Query().Get("tenant")
	tenant := servicetenant.TenantFromContext(ctx)
	var choices []chroniclesdk.LeaderboardConfigurationTenant
	if tenant != nil {
		if requested != "" && requested != tenant.ID.String() && (!tenant.Slug.Valid || requested != tenant.Slug.String) {
			httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{Message: "Tenant sites can only inspect their own configuration."})
			return
		}
	} else {
		admin := false
		if actor, ok := authz.ActorFromContext(ctx); ok {
			can, err := api.Zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_servers_User(actor))
			if err != nil {
				httpapi.InternalServerError(w, err)
				return
			}
			admin = can
		}
		tenants, err := api.Zed.ListTenants(servicetenant.AdminBypass(ctx))
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		visible := selectableConfigurationTenants(tenants, admin)
		for i := range visible {
			t := visible[i]
			if requested != "" && (requested == t.ID.String() || (t.Slug.Valid && requested == t.Slug.String)) {
				tenant = &t
			}
			choices = append(choices, configurationTenantChoice(t))
		}
		if requested != "" && tenant == nil {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "Tenant not found."})
			return
		}
	}
	result, err := inspectLeaderboardConfiguration(ctx, database.New(api.Opts.Pool), tenant)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	result.Tenants = choices
	if result.Tenants == nil {
		result.Tenants = []chroniclesdk.LeaderboardConfigurationTenant{}
	}
	httpapi.Write(ctx, w, http.StatusOK, result)
}

func selectableConfigurationTenants(tenants []database.Tenant, admin bool) []database.Tenant {
	out := make([]database.Tenant, 0, len(tenants))
	for _, t := range tenants {
		if admin || t.Discoverable {
			out = append(out, t)
		}
	}
	return out
}

func configurationTenantChoice(t database.Tenant) chroniclesdk.LeaderboardConfigurationTenant {
	sdk := chroniclesdk.TenantFromDB(t)
	out := chroniclesdk.LeaderboardConfigurationTenant{ID: t.ID, Slug: sdk.Slug, Name: t.Name, Discoverable: t.Discoverable}
	if sdk.Branding != nil {
		out.SquareLogo = sdk.Branding.SquareLogo
		if sdk.Branding.DisplayName != "" {
			out.Name = sdk.Branding.DisplayName
		}
	}
	return out
}

func inspectLeaderboardConfiguration(ctx context.Context, db leaderboardConfigurationStore, tenant *database.Tenant) (chroniclesdk.LeaderboardConfiguration, error) {
	out := chroniclesdk.LeaderboardConfiguration{
		TenantName: "Root site (no tenant)", DatasetID: servicedataset.DefaultDatasetID,
		AdditionalFlavor: []string{}, Layers: []chroniclesdk.LeaderboardConfigurationLayer{}, Rows: []chroniclesdk.LeaderboardConfigurationRow{},
	}
	// Match the game-data tenant default precedence. The caller decides which
	// tenant is visible; never accept a dataset override from query input.
	if tenant != nil {
		out.TenantID, out.TenantName = &tenant.ID, tenant.Name
		out.AdditionalFlavor = append(out.AdditionalFlavor, tenant.AdditionalFlavor...)
		if tenant.DefaultDatasetID.Valid {
			out.DatasetID = tenant.DefaultDatasetID.UUID
		}
	}
	dataset, err := db.GetDataset(ctx, out.DatasetID)
	if err != nil {
		return out, err
	}
	out.DatasetName = dataset.Name
	datasetFlavor := database.FlavorFromStrings(dataset.DefaultFlavor)
	additional := database.FlavorFromStrings(out.AdditionalFlavor)
	out.DatasetFlavor = append([]string{}, dataset.DefaultFlavor...)
	out.EffectiveFlavor = datasetFlavor.Merge(additional).Strings()
	projected := datasetFlavor.Merge(additional).LeaderboardFlavors().Strings()
	out.LeaderboardFlavor = append([]string{}, projected...)
	layers, err := db.ListLeaderboardLayers(ctx)
	if err != nil {
		return out, err
	}
	for _, layer := range layers {
		if slices.ContainsFunc(layer.RequiredFlavors, func(tag string) bool { return !slices.Contains(projected, tag) }) {
			continue
		}
		out.Layers = append(out.Layers, chroniclesdk.LeaderboardConfigurationLayer{Key: layer.Key, RequiredFlavors: append([]string{}, layer.RequiredFlavors...)})
	}
	rows, err := leaderboardconfig.Resolve(ctx, db, datasetFlavor, additional)
	if errors.Is(err, leaderboardconfig.ErrConflict) {
		out.Conflict = err.Error()
		return out, nil
	}
	if err != nil {
		return out, err
	}
	for _, row := range rows {
		out.Rows = append(out.Rows, chroniclesdk.LeaderboardConfigurationRow{
			Kind: row.Kind, InstanceName: row.InstanceName, EncounterName: row.EncounterName,
			DifficultyName: row.DifficultyName, MaxPlayers: row.MaxPlayers, SetKey: row.SetKey,
			SetName: row.SetName, Position: row.Position, Points: row.Points, HasPoints: row.HasPoints,
		})
	}
	return out, nil
}
