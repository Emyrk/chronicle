package servicewowdb

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
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
	Ignored     bool              `json:"ignored"`
}

func applyClassBuffIgnores(byClass map[string][]classBuffSpell, ignoredNames []string) {
	ignored := make(map[string]struct{}, len(ignoredNames))
	for _, name := range ignoredNames {
		ignored[name] = struct{}{}
	}
	for className, spells := range byClass {
		for i := range spells {
			_, spells[i].Ignored = ignored[strings.ToLower(strings.TrimSpace(spells[i].Name))]
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

	ignoredNames, err := s.store.ListClassBuffIgnoresForScope(ctx, servicetenant.TenantIDFromContext(ctx))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	applyClassBuffIgnores(byClass, ignoredNames)

	// Root and tenant-scoped ignores can be toggled by admins at any time.
	w.Header().Set("Cache-Control", "no-cache")
	httpapi.Write(ctx, w, http.StatusOK, byClass)
}
