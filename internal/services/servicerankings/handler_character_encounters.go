package servicerankings

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/go-chi/chi/v5"
)

// handleCharacterEncounterStats returns per-encounter kill aggregates for a
// character across all recorded logs: kill count (duplicate uploads counted
// once), first kill, and most recent kill. Tenant scoping applies through
// row-level security on the rankings table.
//
// GET /rankings/characters/{playerGUID}/encounters
func (s *Service) handleCharacterEncounterStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	playerGUID := chi.URLParam(r, "playerGUID")
	if playerGUID == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Missing player GUID",
		})
		return
	}

	rows, err := s.store.GetCharacterEncounterStats(ctx, playerGUID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch character encounter stats",
				Detail:  err.Error(),
			},
		})
		return
	}

	encounters := make([]chroniclesdk.CharacterEncounterStats, 0, len(rows))
	for _, row := range rows {
		encounters = append(encounters, chroniclesdk.CharacterEncounterStats{
			InstanceName:   row.InstanceName,
			EncounterName:  row.EncounterName,
			DifficultyName: row.DifficultyName,
			MaxPlayers:     row.MaxPlayers,
			Kills:          int(row.Kills),
			FirstKilledAt:  row.FirstKilledAt.Time,
			LastKilledAt:   row.LastKilledAt.Time,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.CharacterEncounterStatsResponse{
		PlayerGUID: playerGUID,
		Encounters: encounters,
	})
}
