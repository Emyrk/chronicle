package linkedapi

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/cosmetics"
	"github.com/google/uuid"
)

func (h *Handler) GetMyCharacterCosmetics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := chronauth.AuthenticationState(r).Claims.Subject
	response, err := h.characterCosmeticsResponse(ctx, userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, response)
}

func (h *Handler) UpdateMyCharacterCosmetics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := chronauth.AuthenticationState(r).Claims.Subject
	var req chroniclesdk.UpdateCharacterCosmeticsRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	requested := cosmetics.Selection{
		NameID:       req.Selection.NameID,
		BackgroundID: req.Selection.BackgroundID,
		BorderID:     req.Selection.BorderID,
	}
	if err := cosmetics.ValidateSelection(requested); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: err.Error()})
		return
	}
	links, err := h.zed.GetUserCharacterLinks(ctx, userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	var linkIDs []uuid.UUID
	for _, link := range links {
		if req.ApplyToAll || link.LinkID == req.LinkID {
			linkIDs = append(linkIDs, link.LinkID)
		}
	}
	if len(linkIDs) == 0 {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "Character link not found"})
		return
	}
	allowed, err := h.zed.ListAllowedCosmetics(ctx, userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	active := cosmetics.ActiveSelection(requested, allowed)
	for _, linkID := range linkIDs {
		if _, err := h.zed.UpsertUserCharacterCosmetics(ctx, database.UpsertUserCharacterCosmeticsParams{
			UserID:                userID,
			UserCharacterLinkID:   linkID,
			RequestedNameID:       requested.NameID,
			RequestedBackgroundID: requested.BackgroundID,
			RequestedBorderID:     requested.BorderID,
			ActiveNameID:          active.NameID,
			ActiveBackgroundID:    active.BackgroundID,
			ActiveBorderID:        active.BorderID,
		}); err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
	}
	_ = cosmetics.EnqueueUserAudit(ctx, h.queue, userID)
	response, err := h.characterCosmeticsResponse(ctx, userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, response)
}

func (h *Handler) characterCosmeticsResponse(ctx context.Context, userID uuid.UUID) (chroniclesdk.CharacterCosmeticsResponse, error) {
	allowed, err := h.zed.ListAllowedCosmetics(ctx, userID)
	if err != nil {
		return chroniclesdk.CharacterCosmeticsResponse{}, err
	}
	assignments, err := h.zed.ListCosmeticTierAssignments(ctx)
	if err != nil {
		return chroniclesdk.CharacterCosmeticsResponse{}, err
	}
	tiers := make(map[string]string, len(assignments))
	for _, assignment := range assignments {
		tiers[assignment.CosmeticID] = assignment.Tier
	}
	catalog := cosmetics.Catalog()
	response := chroniclesdk.CharacterCosmeticsResponse{
		CanCustomize: len(allowed) > 0,
		AllowedIDs:   allowed,
		Catalog:      make([]chroniclesdk.CosmeticDefinition, 0, len(catalog)),
	}
	for _, definition := range catalog {
		response.Catalog = append(response.Catalog, chroniclesdk.CosmeticDefinition{
			ID: definition.ID, Label: definition.Label, Slot: string(definition.Slot), Tier: tiers[definition.ID],
		})
	}
	if !response.CanCustomize {
		return response, nil
	}
	records, err := h.zed.GetUserCharacterCosmetics(ctx, userID)
	if err != nil {
		return chroniclesdk.CharacterCosmeticsResponse{}, err
	}
	response.Characters = make([]chroniclesdk.CharacterCosmetics, 0, len(records))
	for _, record := range records {
		response.Characters = append(response.Characters, chroniclesdk.CharacterCosmetics{
			LinkID: record.UserCharacterLinkID,
			Requested: chroniclesdk.CosmeticSelection{
				NameID: record.RequestedNameID, BackgroundID: record.RequestedBackgroundID, BorderID: record.RequestedBorderID,
			},
			Active: chroniclesdk.CosmeticSelection{
				NameID: record.ActiveNameID, BackgroundID: record.ActiveBackgroundID, BorderID: record.ActiveBorderID,
			},
		})
	}
	return response, nil
}
