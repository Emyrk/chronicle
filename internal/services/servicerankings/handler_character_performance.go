package servicerankings

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
)

// handleCharacterPerformance returns complete canonical ranking runs for a
// character, aggregated across the selected boss encounters.
//
// GET /rankings/characters/{playerGUID}/performance?instance_name=Molten+Core&encounter_names=Lucifron,Magmadar&metric=dps
func (s *Service) handleCharacterPerformance(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()

	playerGUID := chi.URLParam(r, "playerGUID")
	if playerGUID == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Missing player GUID"})
		return
	}

	instanceName := q.Get("instance_name")
	if instanceName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "instance_name query parameter is required"})
		return
	}

	encounterNames := splitCSV(q.Get("encounter_names"))
	if len(encounterNames) == 0 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "encounter_names query parameter is required"})
		return
	}

	metric := normalizeMetric(q.Get("metric"))
	rows, err := s.store.GetCharacterPerformanceRuns(ctx, database.GetCharacterPerformanceRunsParams{
		Metric:         metric,
		EncounterNames: encounterNames,
		PlayerGuid:     playerGUID,
		InstanceName:   instanceName,
		DifficultyName: q.Get("difficulty_name"),
		MaxPlayers:     parseMaxPlayers(q.Get("max_players")),
		TenantID:       servicetenant.TenantIDFromContext(ctx),
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch character performance",
				Detail:  err.Error(),
			},
		})
		return
	}

	runs := make([]chroniclesdk.CharacterPerformanceRun, 0, len(rows))
	for _, row := range rows {
		var averageParse *float64
		if row.ParseCount == row.EncounterCount {
			value := row.AverageParse
			averageParse = &value
		}

		runs = append(runs, chroniclesdk.CharacterPerformanceRun{
			RunID:                    row.RunID,
			RepresentativeInstanceID: row.RepresentativeInstanceID,
			StartedAt:                row.StartedAt.Time,
			KilledAt:                 row.KilledAt.Time,
			PlayerName:               row.PlayerName,
			PlayerClass:              normalizeClassName(row.PlayerClass),
			PlayerSpec:               row.PlayerSpec,
			PlayerSubSpec:            row.PlayerSubSpec,
			EncounterCount:           int(row.EncounterCount),
			DamageDone:               row.DamageDone,
			HealingDone:              row.HealingDone,
			AbsorbedDone:             row.AbsorbedDone,
			DurationSecs:             row.DurationSecs,
			DPS:                      row.Dps,
			HPS:                      row.Hps,
			LogHashedSlug:            row.LogHashedSlug,
			AverageParse:             averageParse,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.CharacterPerformanceResponse{
		PlayerGUID: playerGUID,
		Metric:     metric,
		Runs:       runs,
	})
}
