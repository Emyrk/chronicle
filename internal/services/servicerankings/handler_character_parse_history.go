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
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// handleCharacterParseHistory returns ALL deduplicated parses over the last
// 60 days, with a derived Score computed as:
//
//  1. Group parses by (instance_name, encounter_name)
//  2. Within each group, take the best 3 parse scores
//  3. Average each group's best 3
//  4. Average all group averages → final Score
//
// GET /rankings/characters/{playerGUID}/parses?metric=dps
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
	since := time.Now().AddDate(0, 0, -int(parsepolicy.DefaultLookbackDays))

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
			Parses:     []chroniclesdk.CharacterParse{},
		})
		return
	}

	// Return ALL parses — not just best per encounter.
	parses := make([]chroniclesdk.CharacterParse, 0, len(rows))
	for _, row := range rows {
		var killedAt time.Time
		if row.KilledAt.Valid {
			killedAt = row.KilledAt.Time
		}
		var snapshotID *uuid.UUID
		if row.SnapshotID.Valid {
			id := row.SnapshotID.UUID
			snapshotID = &id
		}
		parses = append(parses, chroniclesdk.CharacterParse{
			EncounterName:  row.EncounterName,
			InstanceName:   row.InstanceName,
			DifficultyName: row.DifficultyName,
			MaxPlayers:     row.MaxPlayers,
			InstanceID:     row.InstanceID,
			SnapshotID:     snapshotID,
			RunID:          row.RunID,
			Metric:         row.Metric,
			MetricValue:    row.MetricValue,
			PreciseScore:   row.PreciseScore,
			DisplayScore:   int(row.DisplayScore),
			Rank:           int(row.Rank),
			SampleSize:     int(row.SampleSize),
			Status:         row.Status,
			KilledAt:       killedAt,
		})
	}

	// Sort parses by encounter name, then by score descending.
	sort.Slice(parses, func(i, j int) bool {
		if parses[i].EncounterName != parses[j].EncounterName {
			return parses[i].EncounterName < parses[j].EncounterName
		}
		return parses[i].PreciseScore > parses[j].PreciseScore
	})

	// Derive Score: group by (instance_name, encounter_name), best 3 per group,
	// average each group, average groups.
	score := ComputeCharacterScore(parses)

	// Use first row's player info.
	first := rows[0]
	resp := chroniclesdk.CharacterParseHistoryResponse{
		PlayerGUID:  playerGUID,
		PlayerName:  first.PlayerName,
		PlayerClass: normalizeClassName(first.PlayerClass),
		PlayerSpec:  first.PlayerSpec,
		Metric:      metric,
		Score:       score,
		Parses:      parses,
	}

	httpapi.Write(ctx, w, http.StatusOK, resp)
}

// ComputeCharacterScore derives the 60-day Score from a list of parses.
// Algorithm:
//  1. Group by (instance_name, encounter_name)
//  2. Within each group, take the best 3 parse scores
//  3. Average each group's best 3
//  4. Average all group averages → final Score
//
// Exported for testing.
func ComputeCharacterScore(parses []chroniclesdk.CharacterParse) *chroniclesdk.CharacterScore {
	if len(parses) == 0 {
		return nil
	}

	// Group by (instance_name, encounter_name).
	type groupKey struct {
		instanceName  string
		encounterName string
	}
	groups := make(map[groupKey][]float64)
	for _, p := range parses {
		key := groupKey{instanceName: p.InstanceName, encounterName: p.EncounterName}
		groups[key] = append(groups[key], p.PreciseScore)
	}

	// For each group: sort descending, take best 3, average.
	var groupAverages []float64
	totalParses := 0
	for _, scores := range groups {
		sort.Float64s(scores) // ascending
		n := len(scores)
		top := 3
		if top > n {
			top = n
		}
		sum := 0.0
		for i := n - top; i < n; i++ {
			sum += scores[i]
		}
		groupAverages = append(groupAverages, sum/float64(top))
		totalParses += n
	}

	// Average all group averages.
	sum := 0.0
	for _, g := range groupAverages {
		sum += g
	}
	avg := sum / float64(len(groupAverages))

	return &chroniclesdk.CharacterScore{
		Value:           avg,
		DisplayValue:    parsepolicy.RoundDisplay(avg),
		NumParses:       totalParses,
		EncounterGroups: len(groupAverages),
	}
}

// splitCSV, normalizeClassName, and toFloat64 are defined in handler_instance_parses.go.
