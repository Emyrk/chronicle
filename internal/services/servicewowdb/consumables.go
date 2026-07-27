package servicewowdb

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
)

type ConsumableBuff struct {
	ID   int32  `json:"id"`
	Name string `json:"name"`
}

type ConsumableEntry struct {
	ItemID       int32            `json:"item_id"`
	ItemName     string           `json:"item_name"`
	ItemQuality  int32            `json:"item_quality"`
	ItemIcon     string           `json:"item_icon"`
	ItemSpellIDs []int32          `json:"item_spell_ids"`
	Buffs        []ConsumableBuff `json:"buffs"`
}

func (s *Service) handleGetConsumables(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID, err := resolveDatasetID(r)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset_id"})
		return
	}

	rows, err := s.store.ListConsumablesByDataset(ctx, datasetID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	entries := make([]ConsumableEntry, 0, len(rows))
	byItemID := make(map[int32]int, len(rows))
	for _, row := range rows {
		idx, ok := byItemID[row.ItemID]
		if !ok {
			idx = len(entries)
			byItemID[row.ItemID] = idx
			entries = append(entries, ConsumableEntry{
				ItemID:       row.ItemID,
				ItemName:     row.ItemName,
				ItemQuality:  row.ItemQuality,
				ItemIcon:     row.ItemIcon,
				ItemSpellIDs: row.ItemSpellIds,
				Buffs:        []ConsumableBuff{},
			})
		}
		if row.BuffSpellID.Valid && row.BuffSpellName.Valid {
			entries[idx].Buffs = append(entries[idx].Buffs, ConsumableBuff{
				ID:   row.BuffSpellID.Int32,
				Name: row.BuffSpellName.String,
			})
		}
	}

	w.Header().Set(httpapi.DatasetHeader, datasetID.String())
	w.Header().Set("Cache-Control", "no-cache")
	httpapi.Write(ctx, w, http.StatusOK, entries)
}
