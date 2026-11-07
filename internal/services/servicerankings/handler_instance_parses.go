package servicerankings

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// parsesQuerier is the subset of database.Store used by the parses handler.
// This interface allows tests to provide a plain database.Store without the
// full authz.Authz wrapper (which requires SpiceDB).
type parsesQuerier interface {
	GetTenantByID(ctx context.Context, id uuid.UUID) (database.Tenant, error)
	IsLogInstanceInvalid(ctx context.Context, id uuid.UUID) (bool, error)
	GetLogInstanceStartTime(ctx context.Context, id uuid.UUID) (pgtype.Timestamptz, error)
	ListRankingsForInstance(ctx context.Context, instanceID uuid.UUID) ([]database.ListRankingsForInstanceRow, error)
	GetAnyParseScoreReceiptForTenantInstance(ctx context.Context, arg database.GetAnyParseScoreReceiptForTenantInstanceParams) (database.ParseScoreReceipt, error)
	HasParseScoreResultsForTenantInstance(ctx context.Context, arg database.HasParseScoreResultsForTenantInstanceParams) (bool, error)
	ListParseScoreResultsForContract(ctx context.Context, arg database.ListParseScoreResultsForContractParams) ([]database.ParseScoreResult, error)
	ListWindowedParseScoreResultsForContract(ctx context.Context, arg database.ListWindowedParseScoreResultsForContractParams) ([]database.ParseScoreResult, error)
	ListPersistedParseScoreResultsForInstance(ctx context.Context, arg database.ListPersistedParseScoreResultsForInstanceParams) ([]database.ParseScoreResult, error)
	GetParseScoreMembershipCohort(ctx context.Context, arg database.GetParseScoreMembershipCohortParams) ([]float64, error)
}

type instanceParsePlayerInfo struct {
	name    string
	class   string
	spec    string
	subSpec string
	role    string
	// encounter -> ranking row (the instance's own metric values)
	bosses map[string]database.ListRankingsForInstanceRow
}

func isUnknownPlayerSpec(spec string) bool {
	return spec == "" || strings.EqualFold(spec, "unknown")
}

func preferKnownPlayerSpec(player *instanceParsePlayerInfo, ranking database.ListRankingsForInstanceRow) {
	if !isUnknownPlayerSpec(player.spec) || isUnknownPlayerSpec(ranking.PlayerSpec) {
		return
	}
	player.spec = ranking.PlayerSpec
	player.subSpec = ranking.PlayerSubSpec
	player.role = ranking.PlayerRole
}

func hasOnlyUnknownEncounterSpecs(player *instanceParsePlayerInfo) bool {
	for _, ranking := range player.bosses {
		if !isUnknownPlayerSpec(ranking.PlayerSpec) {
			return false
		}
	}
	return true
}

// handleInstanceParses returns parse scores for players in a specific instance (log run).
//
//	GET /instances/{instanceID}/parses?encounter_names=Ragnaros,Golemagg&metric=dps&period=all&timeframe=historical
func (s *Service) handleInstanceParses(w http.ResponseWriter, r *http.Request) {
	handleInstanceParsesWithStore(s.store, s.logger, w, r)
}

// handleInstanceParsesWithStore contains the handler logic, parameterised on
// a parsesQuerier so tests can call it without the full authz stack.
func handleInstanceParsesWithStore(store parsesQuerier, logger *slog.Logger, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()

	instanceIDStr := chi.URLParam(r, "instanceID")
	instanceID, err := uuid.Parse(instanceIDStr)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid instance ID",
		})
		return
	}

	// Parse metric (default: dps).
	metric := parsepolicy.MetricDPS
	if q.Get("metric") == "hps" {
		metric = parsepolicy.MetricHPS
	}

	invalid, err := store.IsLogInstanceInvalid(ctx, instanceID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "Instance not found"})
			return
		}
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{Message: "Failed to fetch instance", Detail: err.Error()},
		})
		return
	}
	if invalid {
		httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceParsesResponse{
			Available: false,
			Reason:    "invalid",
			Metric:    string(metric),
			Players:   []chroniclesdk.InstanceParsePlayer{},
		})
		return
	}

	// Parse encounter_names filter.
	encounterNames := splitCSV(q.Get("encounter_names"))

	// Parse period (lookback days). Default is 60 days to match what the
	// worker publishes for tenants without explicit ParseConfig.
	lookbackDays := parsepolicy.DefaultLookbackDays
	if v := q.Get("period"); v != "" {
		switch v {
		case "30d":
			lookbackDays = parsepolicy.Lookback30Days
		case "60d":
			lookbackDays = parsepolicy.Lookback60Days
		case "90d":
			lookbackDays = parsepolicy.Lookback90Days
		case "180d":
			lookbackDays = parsepolicy.Lookback180Days
		case "all":
			lookbackDays = parsepolicy.LookbackAllTime
		default:
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid period",
				Detail:  fmt.Sprintf("period must be one of: 30d, 60d, 90d, 180d, all; got %q", v),
			})
			return
		}
	}

	// Parse timeframe (historical = earliest snapshot containing instance; current = latest).
	timeframe := q.Get("timeframe")
	switch timeframe {
	case "":
		timeframe = "historical"
	case "historical", "current":
	default:
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid timeframe",
			Detail:  fmt.Sprintf("timeframe must be historical or current; got %q", timeframe),
		})
		return
	}

	tid := servicetenant.TenantIDFromContext(ctx)

	// Resolve tenant parse config for default lookback override and disabled check.
	tenantConfig := loadInstanceParseTenantConfig(ctx, store, tid)
	cohortMode := tenantConfig.cohortMode
	if cohortMode == parsepolicy.CohortModeDisabled {
		httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceParsesResponse{
			Available:          false,
			Reason:             "disabled",
			SelectedEncounters: encounterNames,
			Metric:             string(metric),
			Players:            []chroniclesdk.InstanceParsePlayer{},
		})
		return
	}
	// Only use tenant default if the client didn't explicitly set period.
	if q.Get("period") == "" && tenantConfig.lookbackDays != nil {
		lookbackDays = parsepolicy.LookbackDays(*tenantConfig.lookbackDays)
	}

	// Windowed cohorts use the target instance start as the historical cutoff.
	// Current requests use the request time and remain an on-demand view.
	startTime, err := store.GetLogInstanceStartTime(ctx, instanceID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "Instance not found"})
			return
		}
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to fetch instance", Detail: err.Error()}})
		return
	}
	cutoff := time.Now().UTC()
	if timeframe == "historical" {
		if !startTime.Valid {
			httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceParsesResponse{
				Available: false, Reason: "no_start_time", SelectedEncounters: encounterNames,
				Metric: string(metric), Players: []chroniclesdk.InstanceParsePlayer{},
			})
			return
		}
		cutoff = startTime.Time.UTC()
	}
	cutoffDB := pgtype.Timestamptz{Time: cutoff, Valid: true}
	windowStartDB := pgtype.Timestamptz{}
	if lookbackDays > 0 {
		windowStartDB = pgtype.Timestamptz{Time: cutoff.AddDate(0, 0, -int(lookbackDays)), Valid: true}
	}

	// Load the instance's own ranking rows directly from encounter_dps_rankings.
	// This is independent of snapshot membership — the instance may not be a
	// member of the snapshot it scores against (e.g. a historical canonical
	// snapshot whose cutoff equals the raid's own day).
	rankings, err := store.ListRankingsForInstance(ctx, instanceID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch instance rankings",
				Detail:  err.Error(),
			},
		})
		return
	}

	// Filter to selected encounters only.
	encounterSet := make(map[string]struct{}, len(encounterNames))
	for _, en := range encounterNames {
		encounterSet[en] = struct{}{}
	}

	// If no encounters specified, use all encounters from the instance's rankings.
	if len(encounterNames) == 0 {
		encounterNames = instanceEncounterNames(rankings)
		for _, en := range encounterNames {
			encounterSet[en] = struct{}{}
		}
	}

	// A complete receipt makes persisted historical results authoritative. This
	// accepts both legacy snapshot-backed receipts and new windowed receipts.
	if timeframe == "historical" && lookbackDays == parsepolicy.DefaultLookbackDays {
		persisted, persistedErr := loadPersistedInstanceParses(ctx, store, tid, instanceID, rankings, encounterNames, metric, cohortMode)
		if persistedErr != nil {
			httpapi.HandleResponseError(ctx, w, persistedErr, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to fetch persisted instance parses", Detail: persistedErr.Error()}})
			return
		}
		if receipt := persisted.receipt; receipt != nil {
			receiptCutoff := cutoff
			receiptSnapshotID := uuid.Nil
			if receipt.Cutoff.Valid {
				receiptCutoff = receipt.Cutoff.Time
			}
			if receipt.SnapshotID.Valid {
				receiptSnapshotID = receipt.SnapshotID.UUID
			}
			if persisted.complete {
				httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceParsesResponse{
					Available: true, SnapshotID: receiptSnapshotID, Cutoff: receiptCutoff,
					LookbackDays: int32(receipt.LookbackDays), CohortMode: string(persisted.cohortMode),
					SelectedEncounters: encounterNames, Metric: string(metric), Players: persisted.players,
				})
				return
			}
			httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceParsesResponse{
				Available: false, Reason: "persisted_results_incomplete", SnapshotID: receiptSnapshotID, Cutoff: receiptCutoff,
				LookbackDays: int32(receipt.LookbackDays), CohortMode: string(persisted.cohortMode),
				SelectedEncounters: encounterNames, Metric: string(metric), Players: []chroniclesdk.InstanceParsePlayer{},
			})
			return
		}
		if persisted.found {
			if persisted.complete {
				httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceParsesResponse{
					Available: true, Cutoff: cutoff, LookbackDays: int32(lookbackDays), CohortMode: string(cohortMode),
					SelectedEncounters: encounterNames, Metric: string(metric), Players: persisted.players,
				})
				return
			}
			httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceParsesResponse{
				Available: false, Reason: "persisted_results_incomplete", LookbackDays: int32(lookbackDays),
				SelectedEncounters: encounterNames, Metric: string(metric), Players: []chroniclesdk.InstanceParsePlayer{},
			})
			return
		}
	}

	// Group ranking rows by player GUID for on-demand fallback.
	players := make(map[string]*instanceParsePlayerInfo)
	// Track player insertion order for stable output.
	var playerOrder []string

	for _, m := range rankings {
		if _, ok := encounterSet[m.EncounterName]; !ok {
			continue
		}
		p, exists := players[m.PlayerGuid]
		if !exists {
			p = &instanceParsePlayerInfo{
				name:    m.PlayerName,
				class:   m.PlayerClass,
				spec:    m.PlayerSpec,
				subSpec: m.PlayerSubSpec,
				role:    m.PlayerRole,
				bosses:  make(map[string]database.ListRankingsForInstanceRow),
			}
			players[m.PlayerGuid] = p
			playerOrder = append(playerOrder, m.PlayerGuid)
		} else {
			preferKnownPlayerSpec(p, m)
		}
		// Keep the first (highest DPS, since ordered by dps DESC).
		if _, has := p.bosses[m.EncounterName]; !has {
			p.bosses[m.EncounterName] = m
		}
	}

	// Score each player's per-boss performance.
	result := make([]chroniclesdk.InstanceParsePlayer, 0, len(players))
	// Request-scoped cohort cache keyed by bucket; see comment at use site.
	cohortCache := make(map[string][]float64)

	for _, playerGUID := range playerOrder {
		p := players[playerGUID]

		sdkPlayer := chroniclesdk.InstanceParsePlayer{
			PlayerGUID:    playerGUID,
			PlayerName:    p.name,
			PlayerClass:   normalizeClassName(p.class),
			PlayerSpec:    p.spec,
			PlayerSubSpec: p.subSpec,
			PlayerRole:    p.role,
			Bosses:        make([]chroniclesdk.InstanceParseBoss, 0, len(p.bosses)),
		}

		// A player is globally unknown only when none of their selected boss
		// rows has a usable spec. Individual encounters are checked below.
		allSpecsUnknown := cohortMode == parsepolicy.CohortModeSpec && hasOnlyUnknownEncounterSpecs(p)

		if allSpecsUnknown {
			sdkPlayer.Status = string(parsepolicy.ReasonUnknownSpec)
			sdkPlayer.Reason = "Unknown spec; cannot score in spec mode"
		}

		var preciseScores []float64
		for _, encName := range encounterNames {
			memberRow, killed := p.bosses[encName]
			if !killed {
				continue
			}

			var metricValue float64
			if metric == parsepolicy.MetricHPS {
				metricValue = memberRow.Hps
			} else {
				metricValue = memberRow.Dps
			}

			boss := chroniclesdk.InstanceParseBoss{
				EncounterName: encName,
				MetricValue:   metricValue,
				Status:        string(parsepolicy.StatusSampleTooSmall),
			}

			// A zero metric value cannot be scored (the scorer rejects
			// non-positive values). Common causes: a DPS player viewed with
			// metric=hps, or logs parsed before healing columns existed
			// (pre-#170) that need a reparse. Mark explicitly so the UI can
			// skip the pill instead of showing a misleading 0.
			if metricValue <= 0 {
				boss.Status = "no_metric_value"
				sdkPlayer.Bosses = append(sdkPlayer.Bosses, boss)
				continue
			}

			encounterSpecUnknown := cohortMode == parsepolicy.CohortModeSpec && isUnknownPlayerSpec(memberRow.PlayerSpec)
			if encounterSpecUnknown {
				boss.Status = string(parsepolicy.ReasonUnknownSpec)
			}

			if !encounterSpecUnknown {
				// Load cohort for this boss+class(+spec). Many players share a
				// bucket (e.g. all Fury Warriors on one boss), so cache cohort
				// slices per bucket key for the duration of this request to
				// avoid an N+1 query pattern across players.
				bucketKey := fmt.Sprintf("%s|%s|%d|%s|%s|%s",
					encName, memberRow.DifficultyName, memberRow.MaxPlayers,
					memberRow.PlayerClass, memberRow.PlayerSpec, memberRow.PlayerSubSpec)
				cohort, cached := cohortCache[bucketKey]
				if !cached {
					var cErr error
					cohort, cErr = store.GetParseScoreMembershipCohort(ctx, database.GetParseScoreMembershipCohortParams{
						Metric: string(metric), TenantID: tid,
						PolicyVersion: int16(parsepolicy.PolicyVersion), QueryVersion: int16(QueryVersion),
						Cutoff: cutoffDB, WindowStart: windowStartDB, ExcludeRunID: memberRow.RunID,
						EncounterName:  encName,
						DifficultyName: memberRow.DifficultyName, MaxPlayers: memberRow.MaxPlayers,
						PlayerClass: memberRow.PlayerClass, CohortMode: string(cohortMode),
						PlayerSpec: memberRow.PlayerSpec, PlayerSubSpec: memberRow.PlayerSubSpec,
					})
					if cErr != nil {
						logger.Error("failed to load membership cohort", "encounter", encName, "player_guid", playerGUID, "error", cErr)
						continue
					}
					cohortCache[bucketKey] = cohort
				}

				scoreResult, scored := parsepolicy.Score(cohort, metricValue)
				boss.SampleSize = scoreResult.SampleSize
				if len(cohort) < parsepolicy.MinSampleForParse {
					boss.SampleSize = len(cohort)
				}
				boss.Status = string(scoreResult.Status)
				if scored {
					boss.PreciseScore = scoreResult.PreciseScore
					boss.DisplayScore = scoreResult.DisplayScore
					boss.Rank = scoreResult.Rank
					preciseScores = append(preciseScores, scoreResult.PreciseScore)
				}
			}

			sdkPlayer.Bosses = append(sdkPlayer.Bosses, boss)
		}

		// Compute average parse.
		if len(preciseScores) > 0 {
			avg, ok := parsepolicy.AverageParse(preciseScores, len(encounterNames))
			if ok {
				sdkPlayer.AverageParse = &chroniclesdk.InstanceParseAverage{
					PreciseScore: avg.PreciseScore,
					DisplayScore: avg.DisplayScore,
					Killed:       avg.Killed,
					Selected:     avg.Selected,
				}
			}
		}

		result = append(result, sdkPlayer)
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceParsesResponse{
		Available:          true,
		Cutoff:             cutoff,
		LookbackDays:       int32(lookbackDays),
		CohortMode:         string(cohortMode),
		SelectedEncounters: encounterNames,
		Metric:             string(metric),
		Players:            result,
	})
}

type instanceParseTenantConfig struct {
	cohortMode   parsepolicy.CohortMode
	lookbackDays *int // tenant default_lookback_days, nil when unset
}

// loadInstanceParseTenantConfig reads the tenant's parse config. A missing
// tenant or config, or one that fails to load, means spec mode with no
// lookback override.
func loadInstanceParseTenantConfig(ctx context.Context, store interface {
	GetTenantByID(ctx context.Context, id uuid.UUID) (database.Tenant, error)
}, tid uuid.UUID) instanceParseTenantConfig {
	config := instanceParseTenantConfig{cohortMode: parsepolicy.CohortModeSpec}
	if tid == uuid.Nil {
		return config
	}
	tenant, err := store.GetTenantByID(ctx, tid)
	if err != nil || len(tenant.ParseConfig) == 0 {
		return config
	}
	var pc struct {
		CohortMode   string `json:"cohort_mode"`
		LookbackDays *int   `json:"default_lookback_days"`
	}
	if err := json.Unmarshal(tenant.ParseConfig, &pc); err != nil {
		return config
	}
	if pc.CohortMode != "" {
		config.cohortMode = parsepolicy.CohortMode(pc.CohortMode)
	}
	config.lookbackDays = pc.LookbackDays
	return config
}

// persistedParsesQuerier is the subset of the store that reads persisted
// parse score results.
type persistedParsesQuerier interface {
	GetAnyParseScoreReceiptForTenantInstance(ctx context.Context, arg database.GetAnyParseScoreReceiptForTenantInstanceParams) (database.ParseScoreReceipt, error)
	HasParseScoreResultsForTenantInstance(ctx context.Context, arg database.HasParseScoreResultsForTenantInstanceParams) (bool, error)
	ListParseScoreResultsForContract(ctx context.Context, arg database.ListParseScoreResultsForContractParams) ([]database.ParseScoreResult, error)
	ListWindowedParseScoreResultsForContract(ctx context.Context, arg database.ListWindowedParseScoreResultsForContractParams) ([]database.ParseScoreResult, error)
	ListPersistedParseScoreResultsForInstance(ctx context.Context, arg database.ListPersistedParseScoreResultsForInstanceParams) ([]database.ParseScoreResult, error)
}

type persistedInstanceParses struct {
	// found is false when the instance has no persisted results for the
	// tenant, so the caller must score on demand.
	found bool
	// complete reports whether players covers every scorable boss.
	complete bool
	players  []chroniclesdk.InstanceParsePlayer
	// receipt is the instance's parse score receipt, nil when the results
	// were persisted without one.
	receipt    *database.ParseScoreReceipt
	cohortMode parsepolicy.CohortMode
}

// loadPersistedInstanceParses reads the instance's persisted parse results
// for metric: the receipt's results when there is a receipt, else any
// persisted results. Only valid for the historical timeframe with the default
// lookback.
func loadPersistedInstanceParses(
	ctx context.Context,
	store persistedParsesQuerier,
	tid, instanceID uuid.UUID,
	rankings []database.ListRankingsForInstanceRow,
	encounterNames []string,
	metric parsepolicy.Metric,
	cohortMode parsepolicy.CohortMode,
) (persistedInstanceParses, error) {
	receipt, err := store.GetAnyParseScoreReceiptForTenantInstance(ctx, database.GetAnyParseScoreReceiptForTenantInstanceParams{
		TenantID: tid, InstanceID: instanceID,
	})
	if err == nil {
		var persisted []database.ParseScoreResult
		if receipt.SnapshotID.Valid {
			persisted, err = store.ListParseScoreResultsForContract(ctx, database.ListParseScoreResultsForContractParams{
				TenantID: tid, InstanceID: instanceID, SnapshotID: receipt.SnapshotID.UUID, Metric: string(metric),
			})
		} else {
			persisted, err = store.ListWindowedParseScoreResultsForContract(ctx, database.ListWindowedParseScoreResultsForContractParams{
				TenantID: tid, InstanceID: instanceID, Metric: string(metric),
			})
		}
		if err != nil {
			return persistedInstanceParses{}, fmt.Errorf("list receipt parse results: %w", err)
		}
		receiptMode := parsepolicy.CohortMode(receipt.CohortMode)
		players, complete := buildPersistedInstanceParsePlayers(rankings, persisted, encounterNames, metric, receiptMode)
		return persistedInstanceParses{
			found:      true,
			complete:   complete && len(persisted) > 0,
			players:    players,
			receipt:    &receipt,
			cohortMode: receiptMode,
		}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return persistedInstanceParses{}, fmt.Errorf("get parse score receipt: %w", err)
	}

	hasPersisted, err := store.HasParseScoreResultsForTenantInstance(ctx, database.HasParseScoreResultsForTenantInstanceParams{
		TenantID: tid, InstanceID: instanceID,
	})
	if err != nil {
		return persistedInstanceParses{}, fmt.Errorf("check persisted parse results: %w", err)
	}
	if !hasPersisted {
		return persistedInstanceParses{}, nil
	}
	persisted, err := store.ListPersistedParseScoreResultsForInstance(ctx, database.ListPersistedParseScoreResultsForInstanceParams{
		TenantID: tid, InstanceID: instanceID, Metric: string(metric),
	})
	if err != nil {
		return persistedInstanceParses{}, fmt.Errorf("list orphaned persisted parse results: %w", err)
	}
	players, complete := buildPersistedInstanceParsePlayers(rankings, persisted, encounterNames, metric, cohortMode)
	return persistedInstanceParses{found: true, complete: complete, players: players, cohortMode: cohortMode}, nil
}

func buildPersistedInstanceParsePlayers(
	rankings []database.ListRankingsForInstanceRow,
	persisted []database.ParseScoreResult,
	encounterNames []string,
	metric parsepolicy.Metric,
	cohortMode parsepolicy.CohortMode,
) ([]chroniclesdk.InstanceParsePlayer, bool) {
	encounterSet := make(map[string]struct{}, len(encounterNames))
	for _, encounterName := range encounterNames {
		encounterSet[encounterName] = struct{}{}
	}

	players := make(map[string]*instanceParsePlayerInfo)
	playerOrder := make([]string, 0)
	for _, ranking := range rankings {
		if _, selected := encounterSet[ranking.EncounterName]; !selected {
			continue
		}
		player, exists := players[ranking.PlayerGuid]
		if !exists {
			player = &instanceParsePlayerInfo{
				name:    ranking.PlayerName,
				class:   ranking.PlayerClass,
				spec:    ranking.PlayerSpec,
				subSpec: ranking.PlayerSubSpec,
				role:    ranking.PlayerRole,
				bosses:  make(map[string]database.ListRankingsForInstanceRow),
			}
			players[ranking.PlayerGuid] = player
			playerOrder = append(playerOrder, ranking.PlayerGuid)
		} else {
			preferKnownPlayerSpec(player, ranking)
		}
		if _, exists := player.bosses[ranking.EncounterName]; !exists {
			player.bosses[ranking.EncounterName] = ranking
		}
	}

	type resultKey struct {
		playerGUID    string
		encounterName string
	}
	results := make(map[resultKey]database.ParseScoreResult, len(persisted))
	for _, result := range persisted {
		results[resultKey{playerGUID: result.PlayerGuid, encounterName: result.EncounterName}] = result
	}

	response := make([]chroniclesdk.InstanceParsePlayer, 0, len(playerOrder))
	for _, playerGUID := range playerOrder {
		player := players[playerGUID]
		sdkPlayer := chroniclesdk.InstanceParsePlayer{
			PlayerGUID:    playerGUID,
			PlayerName:    player.name,
			PlayerClass:   normalizeClassName(player.class),
			PlayerSpec:    player.spec,
			PlayerSubSpec: player.subSpec,
			PlayerRole:    player.role,
			Bosses:        make([]chroniclesdk.InstanceParseBoss, 0, len(player.bosses)),
		}

		allSpecsUnknown := cohortMode == parsepolicy.CohortModeSpec && hasOnlyUnknownEncounterSpecs(player)
		if allSpecsUnknown {
			sdkPlayer.Status = string(parsepolicy.ReasonUnknownSpec)
			sdkPlayer.Reason = "Unknown spec; cannot score in spec mode"
		}

		preciseScores := make([]float64, 0, len(encounterNames))
		for _, encounterName := range encounterNames {
			ranking, killed := player.bosses[encounterName]
			if !killed {
				continue
			}

			metricValue := ranking.Dps
			if metric == parsepolicy.MetricHPS {
				metricValue = ranking.Hps
			}
			boss := chroniclesdk.InstanceParseBoss{
				EncounterName: encounterName,
				MetricValue:   metricValue,
				Status:        string(parsepolicy.StatusSampleTooSmall),
			}
			if metricValue <= 0 {
				boss.Status = "no_metric_value"
				sdkPlayer.Bosses = append(sdkPlayer.Bosses, boss)
				continue
			}
			encounterSpecUnknown := cohortMode == parsepolicy.CohortModeSpec && isUnknownPlayerSpec(ranking.PlayerSpec)
			if encounterSpecUnknown {
				boss.Status = string(parsepolicy.ReasonUnknownSpec)
				sdkPlayer.Bosses = append(sdkPlayer.Bosses, boss)
				continue
			}

			persistedResult, exists := results[resultKey{playerGUID: playerGUID, encounterName: encounterName}]
			if !exists {
				// A successful receipt promises a complete projection. Fall back to
				// on-demand scoring if the persisted rows violate that invariant.
				return nil, false
			}
			boss.MetricValue = persistedResult.MetricValue
			boss.PreciseScore = persistedResult.PreciseScore
			boss.DisplayScore = int(persistedResult.DisplayScore)
			boss.Rank = int(persistedResult.Rank)
			boss.SampleSize = int(persistedResult.SampleSize)
			boss.Status = persistedResult.Status
			if persistedResult.Status == string(parsepolicy.StatusOK) ||
				persistedResult.Status == string(parsepolicy.StatusLowConfidence) {
				preciseScores = append(preciseScores, persistedResult.PreciseScore)
			}
			sdkPlayer.Bosses = append(sdkPlayer.Bosses, boss)
		}

		if avg, ok := parsepolicy.AverageParse(preciseScores, len(encounterNames)); ok {
			sdkPlayer.AverageParse = &chroniclesdk.InstanceParseAverage{
				PreciseScore: avg.PreciseScore,
				DisplayScore: avg.DisplayScore,
				Killed:       avg.Killed,
				Selected:     avg.Selected,
			}
		}
		response = append(response, sdkPlayer)
	}

	return response, true
}
