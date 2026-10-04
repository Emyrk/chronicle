package gamedataapi

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (h *Handler) SetCooldownIgnored(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID, err := uuid.Parse(chi.URLParam(r, "datasetID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset ID"})
		return
	}
	var req chroniclesdk.SetCooldownIgnoredRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	if len(req.SpellIDs) == 0 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "spell_ids is required"})
		return
	}

	q := database.New(h.pool)
	if req.Ignored {
		err = q.IgnoreCooldownSpells(ctx, database.IgnoreCooldownSpellsParams{DatasetID: datasetID, SpellIds: req.SpellIDs})
	} else {
		err = q.UnignoreCooldownSpells(ctx, database.UnignoreCooldownSpellsParams{DatasetID: datasetID, SpellIds: req.SpellIDs})
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
