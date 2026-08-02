package gamedataapi

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func consumableDisambiguationPath(w http.ResponseWriter, r *http.Request) (uuid.UUID, chroniclesdk.ConsumableEffectKind, int32, bool) {
	ctx := r.Context()
	datasetID, err := uuid.Parse(chi.URLParam(r, "datasetID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset ID"})
		return uuid.Nil, "", 0, false
	}
	kind := chroniclesdk.ConsumableEffectKind(chi.URLParam(r, "effectKind"))
	if kind != chroniclesdk.ConsumableEffectKindBuff && kind != chroniclesdk.ConsumableEffectKindDirect {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid consumable effect kind"})
		return uuid.Nil, "", 0, false
	}
	spell, err := strconv.ParseInt(chi.URLParam(r, "spellID"), 10, 32)
	if err != nil || spell <= 0 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid spell ID"})
		return uuid.Nil, "", 0, false
	}
	return datasetID, kind, int32(spell), true
}

func (h *Handler) ListConsumableEffectPolicies(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID, err := uuid.Parse(chi.URLParam(r, "datasetID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset ID"})
		return
	}
	rows, err := database.New(h.pool).ListConsumableEffectPoliciesByDataset(ctx, datasetID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	result := make([]chroniclesdk.ConsumableEffectPolicy, 0, len(rows))
	for _, row := range rows {
		var itemID *int32
		if row.ItemID.Valid {
			itemID = &row.ItemID.Int32
		}
		result = append(result, chroniclesdk.ConsumableEffectPolicy{
			EffectKind: chroniclesdk.ConsumableEffectKind(row.EffectKind),
			SpellID:    row.SpellID,
			ItemID:     itemID,
			Ignored:    row.Ignored,
		})
	}
	httpapi.Write(ctx, w, http.StatusOK, result)
}

func (h *Handler) SetConsumableDisambiguation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID, kind, spellID, ok := consumableDisambiguationPath(w, r)
	if !ok {
		return
	}
	var req chroniclesdk.SetConsumableDisambiguationRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	if req.ItemID <= 0 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid item ID"})
		return
	}
	row, err := database.New(h.pool).UpsertConsumableDisambiguationIfCandidate(ctx, database.UpsertConsumableDisambiguationIfCandidateParams{
		DatasetID:  datasetID,
		EffectKind: string(kind),
		SpellID:    spellID,
		ItemID:     pgtype.Int4{Int32: req.ItemID, Valid: true},
	})
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "selected item is not a current candidate for this effect"})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ConsumableEffectPolicy{
		EffectKind: chroniclesdk.ConsumableEffectKind(row.EffectKind),
		SpellID:    row.SpellID,
		ItemID:     &row.ItemID.Int32,
	})
}

func (h *Handler) IgnoreConsumableEffect(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID, kind, spellID, ok := consumableDisambiguationPath(w, r)
	if !ok {
		return
	}
	row, err := database.New(h.pool).IgnoreConsumableEffectIfCandidate(ctx, database.IgnoreConsumableEffectIfCandidateParams{
		DatasetID:  datasetID,
		EffectKind: string(kind),
		SpellID:    spellID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "effect is not a current consumable candidate"})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ConsumableEffectPolicy{
		EffectKind: chroniclesdk.ConsumableEffectKind(row.EffectKind),
		SpellID:    row.SpellID,
		Ignored:    row.Ignored,
	})
}

func (h *Handler) DeleteConsumableDisambiguation(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID, kind, spellID, ok := consumableDisambiguationPath(w, r)
	if !ok {
		return
	}
	if err := database.New(h.pool).DeleteConsumableDisambiguation(ctx, database.DeleteConsumableDisambiguationParams{DatasetID: datasetID, EffectKind: string(kind), SpellID: spellID}); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
