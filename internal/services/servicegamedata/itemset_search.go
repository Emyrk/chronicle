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

func (s *Service) handleSearchItemSets(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := servicedbstore.DatabaseStore(s.broker)

	q := r.URL.Query().Get("q")
	if len(q) < 2 {
		badRequest(ctx, w, "Query parameter 'q' must be at least 2 characters.")
		return
	}

	rows, err := db.SearchItemSets(ctx, database.SearchItemSetsParams{DatasetID: servicedataset.DefaultDatasetID, SearchTerm: q})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	results := make([]chroniclesdk.ItemSetSearchResult, 0, len(rows))
	for _, row := range rows {
		results = append(results, chroniclesdk.ItemSetSearchResult{
			ID:                row.ID,
			Name:              row.NameLang,
			RequiredSkill:     row.RequiredSkill,
			RequiredSkillRank: row.RequiredSkillRank,
			PieceCount:        row.PieceCount,
			BonusCount:        row.BonusCount,
			MaxQuality:        row.MaxQuality,
			FirstItemEntry:    row.FirstItemEntry,
		})
	}

	w.Header().Set("Cache-Control", "public, max-age=3600")
	httpapi.Write(ctx, w, http.StatusOK, results)
}

func (s *Service) handleGetItemSetDetail(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	db := servicedbstore.DatabaseStore(s.broker)

	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		badRequest(ctx, w, "Query parameter 'id' is required.")
		return
	}
	id, err := strconv.Atoi(idStr)
	if err != nil {
		badRequest(ctx, w, "Invalid 'id' parameter.")
		return
	}

	set, err := db.GetItemSetByID(ctx, database.GetItemSetByIDParams{DatasetID: servicedataset.DefaultDatasetID, ID: int32(id)})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	pieces, err := db.GetItemSetWithPieces(ctx, database.GetItemSetWithPiecesParams{DatasetID: servicedataset.DefaultDatasetID, SetID: int32(id)})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	bonuses, err := db.GetItemSetBonuses(ctx, database.GetItemSetBonusesParams{DatasetID: servicedataset.DefaultDatasetID, SetID: int32(id)})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	detail := chroniclesdk.ItemSetDetail{
		ID:                set.ID,
		Name:              set.NameLang,
		RequiredSkill:     set.RequiredSkill,
		RequiredSkillRank: set.RequiredSkillRank,
		Pieces:            make([]chroniclesdk.ItemSetPieceInfo, 0, len(pieces)),
		Bonuses:           make([]chroniclesdk.ItemSetBonus, 0, len(bonuses)),
	}

	for _, p := range pieces {
		detail.Pieces = append(detail.Pieces, chroniclesdk.ItemSetPieceInfo{
			Entry:         p.Entry,
			Name:          p.Name,
			Quality:       p.Quality,
			InventoryType: p.InventoryType,
			Icon:          p.Icon,
		})
	}
	for _, b := range bonuses {
		detail.Bonuses = append(detail.Bonuses, chroniclesdk.ItemSetBonus{
			Threshold: b.Threshold,
			SpellID:   b.SpellID,
		})
	}

	w.Header().Set("Cache-Control", "public, max-age=3600")
	httpapi.Write(ctx, w, http.StatusOK, detail)
}
