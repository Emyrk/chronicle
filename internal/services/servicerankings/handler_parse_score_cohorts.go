package servicerankings

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

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

type parseScoreCohortQuerier interface {
	GetTenantByID(context.Context, uuid.UUID) (database.Tenant, error)
	ListParseScoreCohortBuckets(context.Context, database.ListParseScoreCohortBucketsParams) ([]database.ListParseScoreCohortBucketsRow, error)
	GetParseScoreCohortEntries(context.Context, database.GetParseScoreCohortEntriesParams) ([]database.GetParseScoreCohortEntriesRow, error)
}

func resolveParseCohortMode(ctx context.Context, store parseScoreCohortQuerier) (parsepolicy.CohortMode, error) {
	tenantID := servicetenant.TenantIDFromContext(ctx)
	if tenantID == uuid.Nil {
		return parsepolicy.CohortModeSpec, nil
	}

	tenant := servicetenant.TenantFromContext(ctx)
	if tenant == nil || tenant.ID != tenantID || len(tenant.ParseConfig) == 0 {
		loaded, err := store.GetTenantByID(ctx, tenantID)
		if err != nil {
			return "", fmt.Errorf("get tenant parse config: %w", err)
		}
		tenant = &loaded
	}

	mode := parsepolicy.CohortModeSpec
	if len(tenant.ParseConfig) == 0 {
		return mode, nil
	}
	var config struct {
		CohortMode parsepolicy.CohortMode `json:"cohort_mode"`
	}
	if err := json.Unmarshal(tenant.ParseConfig, &config); err != nil {
		return "", fmt.Errorf("decode tenant parse config: %w", err)
	}
	if config.CohortMode != "" {
		mode = config.CohortMode
	}
	return mode, nil
}

func parseScoreCohortMetric(r *http.Request) (string, bool) {
	metric := r.URL.Query().Get("metric")
	if metric == "" {
		metric = string(parsepolicy.MetricDPS)
	}
	if metric != string(parsepolicy.MetricDPS) && metric != string(parsepolicy.MetricHPS) {
		return metric, false
	}
	return metric, true
}

func unavailableParseScoreBuckets(window liveTimeParseWindow, mode parsepolicy.CohortMode, metric string) chroniclesdk.ParseScoreCohortBucketsResponse {
	return chroniclesdk.ParseScoreCohortBucketsResponse{
		Available: false, Reason: "disabled", Cutoff: window.Cutoff,
		WindowStart: window.windowStartPtr(), LookbackDays: window.LookbackDays,
		CohortMode: string(mode), Metric: metric, Buckets: []chroniclesdk.ParseScoreCohortBucket{},
	}
}

func (s *Service) handleParseScoreCohortBuckets(w http.ResponseWriter, r *http.Request) {
	handleParseScoreCohortBucketsWithStore(s.store, w, r)
}

func handleParseScoreCohortBucketsWithStore(store parseScoreCohortQuerier, w http.ResponseWriter, r *http.Request) {
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
	mode, err := resolveParseCohortMode(ctx, store)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to resolve parse configuration", Detail: err.Error()}})
		return
	}
	if mode == parsepolicy.CohortModeDisabled {
		httpapi.Write(ctx, w, http.StatusOK, unavailableParseScoreBuckets(window, mode, metric))
		return
	}

	rows, err := store.ListParseScoreCohortBuckets(ctx, database.ListParseScoreCohortBucketsParams{
		TenantID: servicetenant.TenantIDFromContext(ctx), PolicyVersion: int16(parsepolicy.PolicyVersion),
		QueryVersion: int16(QueryVersion), Cutoff: pgtype.Timestamptz{Time: window.Cutoff, Valid: true},
		WindowStart: window.WindowStart, Metric: metric, CohortMode: string(mode),
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to list player cohort buckets", Detail: err.Error()}})
		return
	}
	buckets := make([]chroniclesdk.ParseScoreCohortBucket, 0, len(rows))
	for _, row := range rows {
		buckets = append(buckets, chroniclesdk.ParseScoreCohortBucket{
			EncounterName: row.EncounterName, DifficultyName: row.DifficultyName, MaxPlayers: row.MaxPlayers,
			PlayerClass: normalizeClassName(row.PlayerClass), PlayerSpec: row.PlayerSpec,
			PlayerSubSpec: row.PlayerSubSpec, SampleSize: row.SampleSize,
		})
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ParseScoreCohortBucketsResponse{
		Available: true, Cutoff: window.Cutoff, WindowStart: window.windowStartPtr(), LookbackDays: window.LookbackDays,
		CohortMode: string(mode), Metric: metric, Buckets: buckets,
	})
}

func (s *Service) handleParseScoreCohort(w http.ResponseWriter, r *http.Request) {
	handleParseScoreCohortWithStore(s.store, w, r)
}

func handleParseScoreCohortWithStore(store parseScoreCohortQuerier, w http.ResponseWriter, r *http.Request) {
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
	mode, err := resolveParseCohortMode(ctx, store)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to resolve parse configuration", Detail: err.Error()}})
		return
	}

	q := r.URL.Query()
	encounterName := q.Get("encounter_name")
	difficultyName := q.Get("difficulty")
	playerClass := q.Get("class")
	playerSpec := q.Get("spec")
	playerSubSpec := q.Get("sub_spec")
	maxPlayers, maxPlayersErr := strconv.ParseInt(q.Get("max_players"), 10, 16)
	switch {
	case mode == parsepolicy.CohortModeDisabled:
		httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ParseScoreCohortResponse{
			Available: false, Reason: "disabled", Cutoff: window.Cutoff, WindowStart: window.windowStartPtr(),
			LookbackDays: window.LookbackDays, CohortMode: string(mode), Metric: metric,
			Entries: []chroniclesdk.ParseScoreCohortEntry{},
		})
		return
	case encounterName == "":
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "encounter_name is required"})
		return
	case playerClass == "":
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "class is required"})
		return
	case mode == parsepolicy.CohortModeSpec && (strings.TrimSpace(playerSpec) == "" || strings.EqualFold(strings.TrimSpace(playerSpec), "unknown")):
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "spec is required for spec cohorts"})
		return
	case maxPlayersErr != nil || maxPlayers < 0:
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "max_players must be a non-negative integer"})
		return
	}
	if mode == parsepolicy.CohortModeClass {
		playerSpec, playerSubSpec = "", ""
	}
	dbPlayerClass := string(db2sdk.HeroClassToDB(types.HeroClasses(playerClass)))

	rows, err := store.GetParseScoreCohortEntries(ctx, database.GetParseScoreCohortEntriesParams{
		TenantID: servicetenant.TenantIDFromContext(ctx), PolicyVersion: int16(parsepolicy.PolicyVersion),
		QueryVersion: int16(QueryVersion), Cutoff: pgtype.Timestamptz{Time: window.Cutoff, Valid: true},
		WindowStart: window.WindowStart, Metric: metric, CohortMode: string(mode), EncounterName: encounterName,
		DifficultyName: difficultyName, MaxPlayers: int16(maxPlayers), PlayerClass: dbPlayerClass,
		PlayerSpec: playerSpec, PlayerSubSpec: playerSubSpec,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to fetch player cohort", Detail: err.Error()}})
		return
	}

	entries := make([]chroniclesdk.ParseScoreCohortEntry, 0, len(rows))
	status := parsepolicy.StatusSampleTooSmall
	for _, row := range rows {
		cohort := make([]float64, 0, len(rows))
		for _, candidate := range rows {
			if candidate.RunID != row.RunID {
				cohort = append(cohort, candidate.MetricValue)
			}
		}
		score, scored := parsepolicy.Score(cohort, row.MetricValue)
		if score.Status == parsepolicy.StatusOK {
			status = parsepolicy.StatusOK
		} else if status == parsepolicy.StatusSampleTooSmall && score.Status == parsepolicy.StatusLowConfidence {
			status = parsepolicy.StatusLowConfidence
		}
		entry := chroniclesdk.ParseScoreCohortEntry{
			Rank: score.Rank, PlayerGUID: row.PlayerGuid, PlayerName: row.PlayerName, MetricValue: row.MetricValue,
			Status: string(score.Status), KilledAt: row.KilledAt.Time, RunID: row.RunID, InstanceID: row.InstanceID,
			LogHashedSlug: row.LogHashedSlug.String,
		}
		if scored {
			entry.PreciseScore = score.PreciseScore
			entry.DisplayScore = score.DisplayScore
		}
		entries = append(entries, entry)
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.ParseScoreCohortResponse{
		Available: true, Cutoff: window.Cutoff, WindowStart: window.windowStartPtr(), LookbackDays: window.LookbackDays,
		CohortMode: string(mode), Metric: metric, EncounterName: encounterName, DifficultyName: difficultyName,
		MaxPlayers: int16(maxPlayers), PlayerClass: normalizeClassName(playerClass), PlayerSpec: playerSpec,
		PlayerSubSpec: playerSubSpec, SampleSize: len(entries), Status: string(status), Entries: entries,
	})
}
