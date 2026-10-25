package api

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/cosmetics"
	"github.com/go-chi/chi/v5"
)

func (api *API) AdminListCosmetics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	assignments, err := api.Zed.ListCosmeticTierAssignments(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	tiers := make(map[string]string, len(assignments))
	for _, assignment := range assignments {
		tiers[assignment.CosmeticID] = assignment.Tier
	}
	catalog := cosmetics.Catalog()
	response := chroniclesdk.AdminCosmeticsResponse{Catalog: make([]chroniclesdk.CosmeticDefinition, 0, len(catalog))}
	for _, definition := range catalog {
		response.Catalog = append(response.Catalog, chroniclesdk.CosmeticDefinition{
			ID: definition.ID, Label: definition.Label, Slot: string(definition.Slot), Tier: tiers[definition.ID],
		})
	}
	httpapi.Write(ctx, w, http.StatusOK, response)
}

func (api *API) AdminSetCosmeticTier(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cosmeticID := chi.URLParam(r, "cosmeticID")
	if _, ok := cosmetics.Lookup(cosmeticID); !ok {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "Unknown cosmetic"})
		return
	}
	var req chroniclesdk.SetCosmeticTierRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	if err := api.Zed.SetCosmeticTier(ctx, cosmeticID, req.Tier); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: err.Error()})
		return
	}
	// Best effort: affected users are repaired asynchronously, while the daily
	// dispatcher guarantees eventual reconciliation if an enqueue is missed.
	users, err := api.Zed.ListUsersReferencingCosmetic(ctx, cosmeticID)
	if err == nil {
		for _, userID := range users {
			_ = cosmetics.EnqueueUserAudit(ctx, api.Queues, userID)
		}
	}
	api.AdminListCosmetics(w, r)
}
