package servicewowdb

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/jackc/pgx/v5"
)

type classBuffEffect struct {
	EffectIndex     int32   `json:"effect_index"`
	AuraEffect      int32   `json:"aura_effect"`
	AuraName        string  `json:"aura_name"`
	ImplicitTargets []int32 `json:"implicit_targets"`
}

type classBuffSpell struct {
	ID          int32             `json:"id"`
	Name        string            `json:"name"`
	NameSubtext string            `json:"name_subtext"`
	Targeting   string            `json:"targeting"`
	Effects     []classBuffEffect `json:"effects"`
}

func (s *Service) handleGetClassBuffs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID, err := resolveDatasetID(r)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset_id"})
		return
	}
	w.Header().Set(httpapi.DatasetHeader, datasetID.String())

	raw, err := s.store.GetDatasetClassBuffs(ctx, datasetID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "no class buff data for this dataset"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	var byClass map[string][]classBuffSpell
	if err := json.Unmarshal(raw, &byClass); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	w.Header().Set("Cache-Control", "public, max-age=86400")
	httpapi.Write(ctx, w, http.StatusOK, byClass)
}
