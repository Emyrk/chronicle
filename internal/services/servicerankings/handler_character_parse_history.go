package servicerankings

import (
	"net/http"
	"sort"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// handleCharacterParseHistory returns a character's parse history over the
// last 60 days, with a derived Score from the best 3 parse percentiles per
// encounter.
//
//	GET /rankings/characters/{playerGUID}/parses?metric=dps
func (s *Service) handleCharacterParseHistory(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()

	playerGUID := chi.URLParam(r, "playerGUID")
	if playerGUID == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Missing player GUID",
		})
		return
	}

	metric := "dps"
	if q.Get("metric") == "hps" {
		metric = "hps"
	}

	tid := servicetenant.TenantIDFromContext(ctx)
	since := time.Now().AddDate(0, 0, -60)

	rows, err := s.store.GetCharacterParseHistory(ctx, database.GetCharacterParseHistoryParams{
		TenantID:   tid,
		PlayerGuid: playerGUID,
		Metric:     metric,
		Since:      pgtype.Timestamptz{Time: since, Valid: true},
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch character parse history",
				Detail:  err.Error(),
			},
		})
		return
	}

	if len(rows) == 0 {
		httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.CharacterParseHistoryResponse{
			PlayerGUID: playerGUID,
			Metric:     metric,
			Encounters: []chroniclesdk.CharacterEncounterBest{},
		})
		return
	}

	// Group by encounter and take the best parse per encounter.
	type encounterBest struct {
		row database.GetCharacterParseHistoryRow
	}
	bestByEncounter := make(map[string]*encounterBest)
	for _, row := range rows {
		existing, ok := bestByEncounter[row.EncounterName]
		if !ok || row.PreciseScore > existing.row.PreciseScore {
			bestByEncounter[row.EncounterName] = &encounterBest{row: row}
		}
	}

	// Build encounter list and collect best scores for Score derivation.
	encounters := make([]chroniclesdk.CharacterEncounterBest, 0, len(bestByEncounter))
	var bestScores []float64

	for _, eb := range bestByEncounter {
		r := eb.row
		var killedAt time.Time
		if r.KilledAt.Valid {
			killedAt = r.KilledAt.Time
		}
		encounters = append(encounters, chroniclesdk.CharacterEncounterBest{
			EncounterName:  r.EncounterName,
			InstanceName:   r.InstanceName,
			DifficultyName: r.DifficultyName,
			MaxPlayers:     r.MaxPlayers,
			InstanceID:     r.InstanceID,
			SnapshotID:     r.SnapshotID,
			Metric:         r.Metric,
			MetricValue:    r.MetricValue,
			PreciseScore:   r.PreciseScore,
			DisplayScore:   int(r.DisplayScore),
			Rank:           int(r.Rank),
			SampleSize:     int(r.SampleSize),
			Status:         r.Status,
			KilledAt:       killedAt,
		})
		bestScores = append(bestScores, r.PreciseScore)
	}

	// Sort encounters by name for stable output.
	sort.Slice(encounters, func(i, j int) bool {
		return encounters[i].EncounterName < encounters[j].EncounterName
	})

	// Derive 60-day Score: average of best 3 parse percentiles.
	var score *chroniclesdk.CharacterScore
	if len(bestScores) > 0 {
		sort.Float64s(bestScores)
		// Take best 3 (highest scores).
		n := len(bestScores)
		top := 3
		if top > n {
			top = n
		}
		sum := 0.0
		for i := n - top; i < n; i++ {
			sum += bestScores[i]
		}
		avg := sum / float64(top)
		score = &chroniclesdk.CharacterScore{
			Value:        avg,
			DisplayValue: parsepolicy.RoundDisplay(avg),
			NumParses:    n,
		}
	}

	// Use first row's player info.
	first := rows[0]
	resp := chroniclesdk.CharacterParseHistoryResponse{
		PlayerGUID:  playerGUID,
		PlayerName:  first.PlayerName,
		PlayerClass: normalizeClassName(first.PlayerClass),
		PlayerSpec:  first.PlayerSpec,
		Metric:      metric,
		Score:       score,
		Encounters:  encounters,
	}

	httpapi.Write(ctx, w, http.StatusOK, resp)
}

// splitCSV, normalizeClassName, and toFloat64 are defined in handler_instance_parses.go.
