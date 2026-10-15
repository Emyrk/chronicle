package servicerankings

import (
	"context"
	"fmt"
	"net/http"
	"sort"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	types "github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// maxSpreadEncounters bounds one spreads request to roughly one instance.
const maxSpreadEncounters = 40

// parseSpreadTierFloors are the parse tiers whose cutoffs a spread reports.
var parseSpreadTierFloors = []int{25, 50, 75, 95, 99, 100}

type parseSpreadKey struct {
	encounterName, difficultyName string
	maxPlayers                    int16
	playerClass, playerSpec       string
	playerSubSpec                 string
}

func (s *Service) handleParseScoreSpreads(w http.ResponseWriter, r *http.Request) {
	handleParseScoreSpreadsWithStore(s.store, w, r)
}

// handleParseScoreSpreads summarizes every exact DPS/HPS cohort on the
// requested encounters: sample size, min/median/max and the weakest value
// reaching each parse tier. Optional class/spec narrow it to one spec.
func handleParseScoreSpreadsWithStore(store parseScoreCohortQuerier, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	window, ok := liveCohortQueryWindow(w, r)
	if !ok {
		return
	}
	metric, ok := parseScoreCohortMetric(r)
	if !ok {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "metric must be dps or hps"})
		return
	}
	q := r.URL.Query()
	encounterNames := q["encounter_name"]
	switch {
	case len(encounterNames) == 0:
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "encounter_name is required"})
		return
	case len(encounterNames) > maxSpreadEncounters:
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "too many encounter_name values"})
		return
	}
	mode, err := resolveParseCohortMode(ctx, store)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to resolve parse configuration", Detail: err.Error()}})
		return
	}
	response := chroniclesdk.ParseScoreSpreadsResponse{
		Available: true, Cutoff: window.Cutoff, WindowStart: window.windowStartPtr(), LookbackDays: window.LookbackDays,
		CohortMode: string(mode), Metric: metric, Spreads: []chroniclesdk.ParseScoreSpread{},
	}
	if mode == parsepolicy.CohortModeDisabled {
		response.Available, response.Reason = false, "disabled"
		httpapi.Write(ctx, w, http.StatusOK, response)
		return
	}

	playerClass, playerSpec := q.Get("class"), q.Get("spec")
	if playerClass != "" {
		playerClass = string(db2sdk.HeroClassToDB(types.HeroClasses(playerClass)))
	}
	if mode != parsepolicy.CohortModeSpec {
		playerSpec = ""
	}
	tenantIDs, err := parseScoreTenantScope(ctx, store)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to resolve tenants", Detail: err.Error()}})
		return
	}
	rows, err := store.ListParseScoreSpreadValues(ctx, database.ListParseScoreSpreadValuesParams{
		TenantIds: tenantIDs, PolicyVersion: int16(parsepolicy.PolicyVersion),
		QueryVersion: int16(QueryVersion), Cutoff: pgtype.Timestamptz{Time: window.Cutoff, Valid: true},
		WindowStart: window.WindowStart, Metric: metric, CohortMode: string(mode),
		EncounterNames: encounterNames, PlayerClass: playerClass, PlayerSpec: playerSpec,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to list parse spreads", Detail: err.Error()}})
		return
	}

	groups := make(map[parseSpreadKey][]parsepolicy.GroupedScoreValue)
	keys := make([]parseSpreadKey, 0)
	for _, row := range rows {
		key := parseSpreadKey{
			encounterName: row.EncounterName, difficultyName: row.DifficultyName, maxPlayers: row.MaxPlayers,
			playerClass: row.PlayerClass, playerSpec: row.PlayerSpec, playerSubSpec: row.PlayerSubSpec,
		}
		if _, exists := groups[key]; !exists {
			keys = append(keys, key)
		}
		groups[key] = append(groups[key], parsepolicy.GroupedScoreValue{Group: row.RunID.String(), Value: row.MetricValue})
	}
	for _, key := range keys {
		spread := summarizeParseSpread(groups[key])
		spread.EncounterName, spread.DifficultyName, spread.MaxPlayers = key.encounterName, key.difficultyName, key.maxPlayers
		spread.PlayerClass = normalizeClassName(key.playerClass)
		spread.PlayerSpec, spread.PlayerSubSpec = key.playerSpec, key.playerSubSpec
		response.Spreads = append(response.Spreads, spread)
	}
	sort.Slice(response.Spreads, func(i, j int) bool {
		a, b := response.Spreads[i], response.Spreads[j]
		if a.EncounterName != b.EncounterName {
			return a.EncounterName < b.EncounterName
		}
		return a.Median > b.Median
	})
	httpapi.Write(ctx, w, http.StatusOK, response)
}

// parseScoreTenantScope lists the tenants whose memberships a request sees:
// its own tenant, or for the default site the default tenant plus every
// include_in_all tenant.
func parseScoreTenantScope(ctx context.Context, store parseScoreCohortQuerier) ([]uuid.UUID, error) {
	tenantID := servicetenant.TenantIDFromContext(ctx)
	if tenantID != uuid.Nil {
		return []uuid.UUID{tenantID}, nil
	}
	tenants, err := store.ListTenants(ctx)
	if err != nil {
		return nil, fmt.Errorf("list tenants: %w", err)
	}
	ids := []uuid.UUID{uuid.Nil}
	for _, tenant := range tenants {
		if tenant.IncludeInAll {
			ids = append(ids, tenant.ID)
		}
	}
	return ids, nil
}

// summarizeParseSpread scores one exact cohort the same way the cohort
// viewer does (excluding each value's own run) and reduces it to a spread.
func summarizeParseSpread(values []parsepolicy.GroupedScoreValue) chroniclesdk.ParseScoreSpread {
	scores := parsepolicy.ScoreExcludingGroups(values)
	sorted := make([]float64, len(values))
	for i, value := range values {
		sorted[i] = value.Value
	}
	sort.Float64s(sorted)
	mid := len(sorted) / 2
	median := sorted[mid]
	if len(sorted)%2 == 0 {
		median = (sorted[mid-1] + sorted[mid]) / 2
	}

	status := parsepolicy.StatusSampleTooSmall
	cutoffs := make([]chroniclesdk.ParseScoreTierCutoff, len(parseSpreadTierFloors))
	for i, floor := range parseSpreadTierFloors {
		cutoffs[i].Floor = floor
	}
	for i, score := range scores {
		if score.Status == parsepolicy.StatusOK {
			status = parsepolicy.StatusOK
		} else if status == parsepolicy.StatusSampleTooSmall && score.Status == parsepolicy.StatusLowConfidence {
			status = parsepolicy.StatusLowConfidence
		}
		if !score.Scored {
			continue
		}
		for c := range cutoffs {
			if score.DisplayScore >= cutoffs[c].Floor && (cutoffs[c].Value == nil || values[i].Value < *cutoffs[c].Value) {
				value := values[i].Value
				cutoffs[c].Value = &value
			}
		}
	}
	return chroniclesdk.ParseScoreSpread{
		SampleSize: len(values), Status: string(status),
		Min: sorted[0], Median: median, Max: sorted[len(sorted)-1], Cutoffs: cutoffs,
	}
}
