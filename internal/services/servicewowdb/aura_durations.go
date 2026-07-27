package servicewowdb

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
)

type AuraDurationModifier struct {
	SpellID    int32  `json:"spell_id"`
	Name       string `json:"name"`
	Percent    int32  `json:"percent"`
	Flat       int32  `json:"flat"`
	Deprecated bool   `json:"deprecated"`
}

type AffectedAuraDuration struct {
	SpellID        int32                  `json:"spell_id"`
	Name           string                 `json:"name"`
	SpellClassSet  int32                  `json:"spell_class_set"`
	BaseDurationMs int32                  `json:"base_duration_ms"`
	MaxDurationMs  int64                  `json:"max_duration_ms"`
	Deprecated     bool                   `json:"deprecated"`
	Modifiers      []AuraDurationModifier `json:"modifiers"`
}

func (s *Service) handleGetAffectedAuraDurations(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID, err := resolveDatasetID(r)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset_id"})
		return
	}

	rows, err := s.store.ListAffectedAuraDurationsByDataset(ctx, datasetID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	entries := make([]AffectedAuraDuration, 0)
	bySpellID := make(map[int32]int)
	for _, row := range rows {
		idx, ok := bySpellID[row.SpellID]
		if !ok {
			idx = len(entries)
			bySpellID[row.SpellID] = idx
			entries = append(entries, AffectedAuraDuration{
				SpellID:        row.SpellID,
				Name:           row.SpellName,
				SpellClassSet:  row.SpellClassSet,
				BaseDurationMs: row.BaseDurationMs,
				MaxDurationMs:  row.MaxDurationMs,
				Deprecated:     row.Deprecated,
				Modifiers:      []AuraDurationModifier{},
			})
		}
		entries[idx].Modifiers = append(entries[idx].Modifiers, AuraDurationModifier{
			SpellID:    row.ModifierSpellID,
			Name:       row.ModifierName,
			Percent:    row.ModifierPercent,
			Flat:       row.ModifierFlat,
			Deprecated: row.ModifierDeprecated,
		})
	}

	w.Header().Set(httpapi.DatasetHeader, datasetID.String())
	w.Header().Set("Cache-Control", "no-cache")
	httpapi.Write(ctx, w, http.StatusOK, entries)
}
