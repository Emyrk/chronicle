package servicegamedata

import (
	"net/http"
	"sort"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
)

const maxItemMetadataIDs = 512

func normalizeItemMetadataIDs(ids []int32) ([]int32, bool) {
	if len(ids) > maxItemMetadataIDs {
		return nil, false
	}
	unique := make(map[int32]struct{}, len(ids))
	for _, id := range ids {
		if id > 0 {
			unique[id] = struct{}{}
		}
	}
	normalized := make([]int32, 0, len(unique))
	for id := range unique {
		normalized = append(normalized, id)
	}
	sort.Slice(normalized, func(i, j int) bool { return normalized[i] < normalized[j] })
	return normalized, true
}

func (s *Service) handleItemMetadata(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req chroniclesdk.ItemMetadataRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	itemIDs, ok := normalizeItemMetadataIDs(req.ItemIDs)
	if !ok {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Too many item IDs; maximum is 512."})
		return
	}
	if len(itemIDs) == 0 {
		httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ItemMetadataResponse{Items: []chroniclesdk.ItemMetadata{}})
		return
	}

	db := servicedbstore.DatabaseStore(s.broker)
	items, err := db.GetItemTemplatesByEntries(ctx, database.GetItemTemplatesByEntriesParams{
		DatasetID: datasetIDFromContext(ctx),
		Entries:   itemIDs,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	metadata := make([]chroniclesdk.ItemMetadata, 0, len(items))
	for _, item := range items {
		metadata = append(metadata, chroniclesdk.ItemMetadata{
			Entry:   item.Entry,
			Name:    item.Name,
			Quality: item.Quality,
		})
	}
	sort.Slice(metadata, func(i, j int) bool { return metadata[i].Entry < metadata[j].Entry })
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ItemMetadataResponse{Items: metadata})
}
