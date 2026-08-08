package gearbuilderapi

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// ForkGearList copies a list's current state into a new list owned by the
// caller, recording lineage.
func (h *Handler) ForkGearList(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	listID, err := uuid.Parse(chi.URLParam(r, "listID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid list ID"})
		return
	}

	source, err := h.zed.GetGearListByID(ctx, listID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "gear list not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	tenantID := servicetenant.TenantIDFromContext(ctx)
	count, err := h.zed.CountUserGearLists(ctx, database.CountUserGearListsParams{
		UserID:   claims.Subject,
		TenantID: tenantID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if count >= maxUserGearLists {
		httpapi.Write(ctx, w, http.StatusConflict, map[string]string{"error": "gear list limit reached"})
		return
	}

	fork, err := h.zed.CreateGearList(ctx, database.CreateGearListParams{
		ID:               uuid.New(),
		UserID:           claims.Subject,
		TenantID:         tenantID,
		Title:            source.Title,
		Description:      source.Description,
		ClassID:          source.ClassID,
		SpecName:         source.SpecName,
		Payload:          source.Payload,
		ForkedFromListID: uuid.NullUUID{UUID: source.ID, Valid: true},
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, gearListToSDK(fork))
}
