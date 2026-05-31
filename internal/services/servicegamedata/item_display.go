package servicegamedata

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
)

func (s *Service) handleItemDisplay(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := servicedbstore.DatabaseStore(s.broker)

	itemIDStr := chi.URLParam(r, "item_id")
	itemID, err := strconv.ParseInt(itemIDStr, 10, 32)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": "invalid item_id"})
		return
	}

	item, err := db.GetItemTemplateByEntry(ctx, database.GetItemTemplateByEntryParams{DatasetID: servicedataset.DefaultDatasetID, Entry: int32(itemID)})
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, map[string]string{"error": "item not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	result := chroniclesdk.ItemDisplayData{
		Entry:         item.Entry,
		Name:          item.Name,
		Quality:       item.Quality,
		ItemClass:     item.Class,
		ItemSubclass:  item.Subclass,
		InventoryType: item.InventoryType,
		Sheath:        item.Sheath,
		DisplayID:     item.DisplayID,
	}

	// Resolve display info from DBC
	if item.DisplayID != 0 {
		ddi, err := db.GetDBCItemDisplayInfoByID(ctx, database.GetDBCItemDisplayInfoByIDParams{DatasetID: servicedataset.DefaultDatasetID, ID: item.DisplayID})
		if err == nil {
			// Unmarshal JSONB arrays — errors are silently ignored;
			// missing DBC data just means empty slices in the response.
			//nolint:errcheck // Best-effort; missing DBC data leaves zero-value slices.
			_ = json.Unmarshal(ddi.ModelName, &result.ModelName)
			_ = json.Unmarshal(ddi.ModelTexture, &result.ModelTexture)
			_ = json.Unmarshal(ddi.GeosetGroup, &result.GeosetGroup)
			_ = json.Unmarshal(ddi.Texture, &result.Texture)
			_ = json.Unmarshal(ddi.InventoryIcon, &result.InventoryIcon)
			_ = json.Unmarshal(ddi.HelmetGeosetVis, &result.HelmetGeosetVis)
			_ = json.Unmarshal(ddi.HelmetGeosetVisID, &result.GeosetVisID)
			result.GroundModel = ddi.GroundModel
			result.ItemVisual = ddi.ItemVisual
			result.Flags = ddi.Flags
		}
	}

	w.Header().Set("Cache-Control", "public, max-age=259200")
	httpapi.Write(ctx, w, http.StatusOK, result)
}
