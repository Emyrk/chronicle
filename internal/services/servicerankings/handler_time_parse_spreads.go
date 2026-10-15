package servicerankings

import (
	"net/http"
	"sort"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/jackc/pgx/v5/pgtype"
)

type timeParseSpreadKey struct {
	kind           chroniclesdk.TimeParseCohortKind
	encounterName  string
	difficultyName string
	maxPlayers     int16
}

func (s *Service) handleTimeParseSpreads(w http.ResponseWriter, r *http.Request) {
	handleTimeParseSpreadsWithStore(s.store, w, r)
}

// handleTimeParseSpreadsWithStore summarizes every boss-kill and clear-time
// cohort in one instance: sample size, min/median/max and the slowest time
// reaching each parse tier.
func handleTimeParseSpreadsWithStore(store timeParseCohortQuerier, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	window, ok := liveCohortQueryWindow(w, r)
	if !ok {
		return
	}
	instanceName := r.URL.Query().Get("instance_name")
	if instanceName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "instance_name is required"})
		return
	}

	tenantID := servicetenant.TenantIDFromContext(ctx)
	policyVersion := int16(timeparsepolicy.PolicyVersion)
	queryVersion := timeparsepolicy.QueryVersion
	cutoff := pgtype.Timestamptz{Time: window.Cutoff, Valid: true}

	bossRows, err := store.ListTimeParseBossKillSpreadValues(ctx, database.ListTimeParseBossKillSpreadValuesParams{
		TenantID: tenantID, PolicyVersion: policyVersion, QueryVersion: queryVersion,
		InstanceName: instanceName, Cutoff: cutoff, WindowStart: window.WindowStart,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to list boss kill times", Detail: err.Error()}})
		return
	}
	clearRows, err := store.ListTimeParseClearTimeSpreadValues(ctx, database.ListTimeParseClearTimeSpreadValuesParams{
		TenantID: tenantID, PolicyVersion: policyVersion, QueryVersion: queryVersion,
		InstanceName: instanceName, Cutoff: cutoff, WindowStart: window.WindowStart,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to list clear times", Detail: err.Error()}})
		return
	}

	groups := make(map[timeParseSpreadKey][]int64)
	keys := make([]timeParseSpreadKey, 0)
	add := func(key timeParseSpreadKey, durationMs int64) {
		if _, exists := groups[key]; !exists {
			keys = append(keys, key)
		}
		groups[key] = append(groups[key], durationMs)
	}
	for _, row := range bossRows {
		add(timeParseSpreadKey{chroniclesdk.TimeParseCohortKindBossKill, row.EncounterName, row.DifficultyName, row.MaxPlayers}, row.DurationMs)
	}
	for _, row := range clearRows {
		add(timeParseSpreadKey{chroniclesdk.TimeParseCohortKindClearTime, "", row.DifficultyName, row.MaxPlayers}, row.DurationMs)
	}

	spreads := make([]chroniclesdk.TimeParseSpread, 0, len(keys))
	for _, key := range keys {
		spread := summarizeTimeParseSpread(groups[key])
		spread.Kind, spread.EncounterName = key.kind, key.encounterName
		spread.DifficultyName, spread.MaxPlayers = key.difficultyName, key.maxPlayers
		spreads = append(spreads, spread)
	}
	sort.Slice(spreads, func(i, j int) bool {
		a, b := spreads[i], spreads[j]
		if a.Kind != b.Kind {
			return a.Kind == chroniclesdk.TimeParseCohortKindClearTime
		}
		if a.EncounterName != b.EncounterName {
			return a.EncounterName < b.EncounterName
		}
		return a.SampleSize > b.SampleSize
	})
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.TimeParseSpreadsResponse{
		Cutoff: window.Cutoff, WindowStart: window.windowStartPtr(), LookbackDays: window.LookbackDays,
		InstanceName: instanceName, Spreads: spreads,
	})
}

// summarizeTimeParseSpread scores one cohort the same way the time cohort
// viewer does and reduces it to a spread. Faster is better, so each tier's
// cutoff is the slowest duration that still reaches it.
func summarizeTimeParseSpread(durations []int64) chroniclesdk.TimeParseSpread {
	scores, _ := timeparsepolicy.ScoreCohort(durations)
	sorted := append([]int64(nil), durations...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	mid := len(sorted) / 2
	median := sorted[mid]
	if len(sorted)%2 == 0 {
		median = (sorted[mid-1] + sorted[mid]) / 2
	}

	status := timeparsepolicy.StatusSampleTooSmall
	cutoffs := make([]chroniclesdk.TimeParseTierCutoff, len(parseSpreadTierFloors))
	for i, floor := range parseSpreadTierFloors {
		cutoffs[i].Floor = floor
	}
	for i, score := range scores {
		if score.Status != "" {
			status = score.Status
		}
		if score.Status == timeparsepolicy.StatusSampleTooSmall || durations[i] <= 0 {
			continue
		}
		for c := range cutoffs {
			if score.DisplayScore >= cutoffs[c].Floor && (cutoffs[c].DurationMs == nil || durations[i] > *cutoffs[c].DurationMs) {
				duration := durations[i]
				cutoffs[c].DurationMs = &duration
			}
		}
	}
	return chroniclesdk.TimeParseSpread{
		SampleSize: len(durations), Status: string(status),
		MinMs: sorted[0], MedianMs: median, MaxMs: sorted[len(sorted)-1], Cutoffs: cutoffs,
	}
}
