package servicewowdb

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

type CooldownSpellEntry struct {
	ID                     int32  `json:"id"`
	Name                   string `json:"name"`
	NameSubtext            string `json:"name_subtext"`
	CooldownMS             int64  `json:"cooldown_ms"`
	RecoveryTimeMS         int64  `json:"recovery_time_ms"`
	CategoryRecoveryTimeMS int64  `json:"category_recovery_time_ms"`
}

func (s *Service) handleGetCooldownSpells(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID, err := resolveDatasetID(r)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset_id"})
		return
	}

	rows, err := s.store.ListCooldownSpellsByDataset(ctx, datasetID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	byClass := make(map[string][]CooldownSpellEntry)
	for _, row := range rows {
		className, ok := cooldownClassName(chrondbc.SpellClassSet(row.SpellClassSet))
		if !ok {
			continue
		}
		byClass[className] = append(byClass[className], CooldownSpellEntry{
			ID:                     row.SpellID,
			Name:                   row.Name,
			NameSubtext:            row.NameSubtext,
			CooldownMS:             max(row.RecoveryTimeMs, row.CategoryRecoveryTimeMs),
			RecoveryTimeMS:         row.RecoveryTimeMs,
			CategoryRecoveryTimeMS: row.CategoryRecoveryTimeMs,
		})
	}

	w.Header().Set(httpapi.DatasetHeader, datasetID.String())
	w.Header().Set("Cache-Control", "public, max-age=86400")
	httpapi.Write(ctx, w, http.StatusOK, byClass)
}

func cooldownClassName(classSet chrondbc.SpellClassSet) (string, bool) {
	switch classSet {
	case chrondbc.SpellClassSetMage,
		chrondbc.SpellClassSetWarrior,
		chrondbc.SpellClassSetWarlock,
		chrondbc.SpellClassSetPriest,
		chrondbc.SpellClassSetDruid,
		chrondbc.SpellClassSetRogue,
		chrondbc.SpellClassSetHunter,
		chrondbc.SpellClassSetPaladin,
		chrondbc.SpellClassSetShaman,
		chrondbc.SpellClassSetDeathKnight:
		return classSet.String(), true
	default:
		return "", false
	}
}
