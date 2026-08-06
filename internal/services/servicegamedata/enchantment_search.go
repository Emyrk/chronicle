package servicegamedata

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
)

// handleSearchEnchantments searches permanent enchantments by display name
// for the gear builder's enchant picker.
func (s *Service) handleSearchEnchantments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := servicedbstore.DatabaseStore(s.broker)

	q := r.URL.Query().Get("q")
	if len(q) < 2 {
		badRequest(ctx, w, "Query parameter 'q' must be at least 2 characters.")
		return
	}

	rows, err := db.SearchSpellItemEnchantments(ctx, database.SearchSpellItemEnchantmentsParams{
		DatasetID:  datasetIDFromContext(ctx),
		SearchTerm: q,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	results := make([]chroniclesdk.EnchantmentSearchResult, 0, len(rows))
	for _, row := range rows {
		results = append(results, chroniclesdk.EnchantmentSearchResult{
			ID:   row.ID,
			Name: row.NameLang,
		})
	}

	w.Header().Set("Cache-Control", "public, max-age=3600")
	httpapi.Write(ctx, w, http.StatusOK, results)
}
