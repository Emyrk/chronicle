package servicegamedata

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
)

func badRequest(ctx context.Context, w http.ResponseWriter, msg string) {
	httpapi.Write(ctx, w, http.StatusBadRequest, map[string]string{"error": msg})
}

// parseIntList parses a comma-separated string of ints into a slice.
// Returns nil (not empty) when input is empty, so SQL array_length() returns NULL.
func parseIntList(s string) []int32 {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	var out []int32
	for _, p := range parts {
		p = strings.TrimSpace(p)
		n, err := strconv.Atoi(p)
		if err != nil {
			continue
		}
		out = append(out, int32(n))
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func (s *Service) handleSearchItems(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := servicedbstore.DatabaseStore(s.broker)

	qualities := parseIntList(r.URL.Query().Get("quality"))
	slots := parseIntList(r.URL.Query().Get("slot"))
	classes := parseIntList(r.URL.Query().Get("class"))

	// An empty query is allowed when an inventory-slot filter narrows the
	// scan — it returns the top items for that slot by the chosen sort
	// (the gear builder's default picker view).
	q := r.URL.Query().Get("q")
	slotBrowse := len(q) == 0 && len(slots) > 0
	if len(q) < 2 && !slotBrowse {
		badRequest(ctx, w, "Query parameter 'q' must be at least 2 characters.")
		return
	}

	// sort param: "quality_desc" (default), "item_level_desc", "item_level_asc",
	// "required_level_desc", "required_level_asc"
	sortParam := r.URL.Query().Get("sort")
	params := database.SearchItemTemplatesParams{
		DatasetID:      datasetIDFromContext(ctx),
		SearchTerm:     q,
		Qualities:      qualities,
		InventoryTypes: slots,
		ItemClasses:    classes,
	}
	switch sortParam {
	case "item_level_desc":
		params.ItemLevelDesc = true
	case "item_level_asc":
		params.ItemLevelAsc = true
	case "required_level_desc":
		params.RequiredLevelDesc = true
	case "required_level_asc":
		params.RequiredLevelAsc = true
	default:
		params.QualityDesc = true
	}

	rows, err := db.SearchItemTemplates(ctx, params)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	results := make([]chroniclesdk.ItemSearchResult, 0, len(rows))
	for _, row := range rows {
		results = append(results, chroniclesdk.ItemSearchResult{
			Entry:             row.Entry,
			Name:              row.Name,
			Quality:           row.Quality,
			InventoryType:     row.InventoryType,
			Class:             row.Class,
			SubClass:          row.Subclass,
			ItemLevel:         row.ItemLevel,
			RequiredLevel:     row.RequiredLevel,
			Delay:             row.Delay,
			DmgMin1:           row.DmgMin1,
			DmgMax1:           row.DmgMax1,
			ContainerSlots:    row.ContainerSlots,
			RequiredSkill:     row.RequiredSkill,
			RequiredSkillRank: row.RequiredSkillRank,
			Armor:             row.Armor,
			Icon:              row.Icon,
		})
	}

	w.Header().Set("Cache-Control", "public, max-age=3600")
	httpapi.Write(ctx, w, http.StatusOK, results)
}
