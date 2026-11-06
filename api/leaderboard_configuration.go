package api

import (
	"context"
	"errors"
	"net/http"
	"slices"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
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

func (api *API) LeaderboardConfiguration(w http.ResponseWriter, r *http.Request) {
	result, err := inspectLeaderboardConfiguration(r.Context(), database.New(api.Opts.Pool))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, result)
}

func inspectLeaderboardConfiguration(ctx context.Context, db leaderboardConfigurationStore) (chroniclesdk.LeaderboardConfiguration, error) {
	out := chroniclesdk.LeaderboardConfiguration{
		TenantName: "Root site (no tenant)", DatasetID: servicedataset.DefaultDatasetID,
		AdditionalFlavor: []string{}, Layers: []chroniclesdk.LeaderboardConfigurationLayer{}, Rows: []chroniclesdk.LeaderboardConfigurationRow{},
	}
	// Match the game-data tenant default precedence. Do not infer tenant ownership
	// from the root hostname, or accept a dataset/tenant override from query input.
	if tenant := servicetenant.TenantFromContext(ctx); tenant != nil {
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
