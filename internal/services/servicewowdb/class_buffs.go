package servicewowdb

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/jackc/pgx/v5"
)

type classBuffEffect struct {
	EffectIndex     int32   `json:"effect_index"`
	Effect          int32   `json:"effect"`
	EffectName      string  `json:"effect_name"`
	AuraEffect      int32   `json:"aura_effect"`
	AuraName        string  `json:"aura_name"`
	ImplicitTargets []int32 `json:"implicit_targets"`
}

type classBuffSpell struct {
	ID             int32             `json:"id"`
	Name           string            `json:"name"`
	NameSubtext    string            `json:"name_subtext"`
	Targeting      string            `json:"targeting"`
	DefaultIgnored bool              `json:"default_ignored"`
	Effects        []classBuffEffect `json:"effects"`
	Ignored        bool              `json:"ignored"`
}

func applyClassBuffPolicies(byClass map[string][]classBuffSpell, policies map[string]bool) {
	for className, spells := range byClass {
		classDefaultIgnored := className == "Generic"
		for i := range spells {
			ignored, ok := policies[strings.ToLower(strings.TrimSpace(spells[i].Name))]
			if !ok {
				ignored = classDefaultIgnored || spells[i].DefaultIgnored
			}
			spells[i].Ignored = ignored
		}
		byClass[className] = spells
	}
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

	rows, err := s.store.ListClassBuffPoliciesForDataset(ctx, datasetID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	policies := make(map[string]bool, len(rows))
	for _, row := range rows {
		policies[row.NormalizedName] = row.Ignored
	}
	applyClassBuffPolicies(byClass, policies)

	// Dataset-scoped policies can be toggled by admins at any time.
	w.Header().Set("Cache-Control", "no-cache")
	httpapi.Write(ctx, w, http.StatusOK, byClass)
}
