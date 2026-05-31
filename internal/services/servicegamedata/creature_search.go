package servicegamedata

import (
	"net/http"
	"strconv"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
)

func (s *Service) handleSearchCreatures(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := servicedbstore.DatabaseStore(s.broker)

	q := r.URL.Query().Get("q")
	if len(q) < 2 {
		badRequest(ctx, w, "Query parameter 'q' must be at least 2 characters.")
		return
	}

	unitClass := int32(-1)
	if v := r.URL.Query().Get("unit_class"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			badRequest(ctx, w, "Invalid 'unit_class' parameter.")
			return
		}
		unitClass = int32(n)
	}

	sortParam := r.URL.Query().Get("sort")
	params := database.SearchCreatureTemplatesParams{
		DatasetID:  servicedataset.DefaultDatasetID,
		SearchTerm: q,
		UnitClass:  unitClass,
	}
	switch sortParam {
	case "level_desc":
		params.LevelDesc = true
	case "level_asc":
		params.LevelAsc = true
	case "health_desc":
		params.HealthDesc = true
	case "health_asc":
		params.HealthAsc = true
	default:
		params.LevelDesc = true
	}

	rows, err := db.SearchCreatureTemplates(ctx, params)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	results := make([]chroniclesdk.CreatureSearchResult, 0, len(rows))
	for _, row := range rows {
		subname := ""
		if row.Subname.Valid {
			subname = row.Subname.String
		}
		results = append(results, chroniclesdk.CreatureSearchResult{
			Entry:     row.Entry,
			Name:      row.Name,
			Subname:   subname,
			LevelMin:  row.LevelMin,
			LevelMax:  row.LevelMax,
			HealthMin: row.HealthMin,
			HealthMax: row.HealthMax,
			ManaMin:   row.ManaMin,
			ManaMax:   row.ManaMax,
			Armor:     row.Armor,
			DmgMin:    row.DmgMin,
			DmgMax:    row.DmgMax,
			UnitClass: row.UnitClass,
		})
	}

	w.Header().Set("Cache-Control", "public, max-age=3600")
	httpapi.Write(ctx, w, http.StatusOK, results)
}
