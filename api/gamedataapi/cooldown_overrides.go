package gamedataapi

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func optionalBool(v *bool) pgtype.Bool {
	if v == nil {
		return pgtype.Bool{}
	}
	return pgtype.Bool{Bool: *v, Valid: true}
}

func (h *Handler) SetCooldownOverrides(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID, err := uuid.Parse(chi.URLParam(r, "datasetID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset ID"})
		return
	}
	var req chroniclesdk.SetCooldownOverridesRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	if len(req.SpellIDs) == 0 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "spell_ids is required"})
		return
	}
	if req.Ignored == nil && req.HideDuration == nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "ignored or hide_duration is required"})
		return
	}

	if err := h.mutateDataset(ctx, datasetID, nil, func(tx database.Store) error {
		if err := tx.UpsertCooldownOverrides(ctx, database.UpsertCooldownOverridesParams{
			DatasetID:    datasetID,
			SpellIds:     req.SpellIDs,
			Ignored:      optionalBool(req.Ignored),
			HideDuration: optionalBool(req.HideDuration),
		}); err != nil {
			return err
		}
		// Rows with no overrides left carry no meaning; drop them.
		return tx.DeleteEmptyCooldownOverrides(ctx, datasetID)
	}); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
