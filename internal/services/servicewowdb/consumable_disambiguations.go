package servicewowdb

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
)

func (s *Service) handleGetConsumableDisambiguations(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID, err := resolveDatasetID(r)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid dataset_id"})
		return
	}
	rows, err := s.store.ListConsumableDisambiguationsByDataset(ctx, datasetID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	result := make([]chroniclesdk.ConsumableDisambiguation, 0, len(rows))
	for _, row := range rows {
		result = append(result, chroniclesdk.ConsumableDisambiguation{EffectKind: chroniclesdk.ConsumableEffectKind(row.EffectKind), SpellID: row.SpellID, ItemID: row.ItemID.Int32})
	}
	w.Header().Set(httpapi.DatasetHeader, datasetID.String())
	w.Header().Set("Cache-Control", "no-cache")
	httpapi.Write(ctx, w, http.StatusOK, result)
}
