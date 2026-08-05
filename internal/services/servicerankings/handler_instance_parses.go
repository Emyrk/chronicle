package servicerankings

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"

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
	GetLatestPublishedSnapshot(ctx context.Context, arg database.GetLatestPublishedSnapshotParams) (database.RankingSnapshot, error)
	GetLatestPublishedSnapshotBefore(ctx context.Context, arg database.GetLatestPublishedSnapshotBeforeParams) (database.RankingSnapshot, error)
	GetScoringSnapshotBefore(ctx context.Context, arg database.GetScoringSnapshotBeforeParams) (database.RankingSnapshot, error)
	GetScoringSnapshotLatest(ctx context.Context, arg database.GetScoringSnapshotLatestParams) (database.RankingSnapshot, error)
	GetLogInstanceStartTime(ctx context.Context, id uuid.UUID) (pgtype.Timestamptz, error)
	ListRankingsForInstance(ctx context.Context, instanceID uuid.UUID) ([]database.ListRankingsForInstanceRow, error)
	GetParseScoreReceiptForContract(ctx context.Context, arg database.GetParseScoreReceiptForContractParams) (database.ParseScoreReceipt, error)
	ListParseScoreResultsForContract(ctx context.Context, arg database.ListParseScoreResultsForContractParams) ([]database.ParseScoreResult, error)
	GetSnapshotCohortValues(ctx context.Context, arg database.GetSnapshotCohortValuesParams) ([]database.GetSnapshotCohortValuesRow, error)
}

type instanceParsePlayerInfo struct {
	name  string
	class string
	spec  string
	role  string
	// encounter -> ranking row (the instance's own metric values)
	bosses map[string]database.ListRankingsForInstanceRow
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
	if tid != uuid.Nil {
		tenant, tErr := store.GetTenantByID(ctx, tid)
		if tErr == nil && len(tenant.ParseConfig) > 0 {
			var pc struct {
				CohortMode   string `json:"cohort_mode"`
				LookbackDays *int   `json:"default_lookback_days"`
			}
			if jErr := json.Unmarshal(tenant.ParseConfig, &pc); jErr == nil {
				if pc.CohortMode == string(parsepolicy.CohortModeDisabled) {
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
				if q.Get("period") == "" && pc.LookbackDays != nil {
					lookbackDays = parsepolicy.LookbackDays(*pc.LookbackDays)
				}
			}
		}
	}

	// Find the appropriate snapshot.
	var snapshot database.RankingSnapshot
	switch timeframe {
	case "current":
		snapshot, err = store.GetLatestPublishedSnapshot(ctx, database.GetLatestPublishedSnapshotParams{
			TenantID:     tid,
			LookbackDays: int32(lookbackDays),
		})
	default: // "historical"
		// Canonical snapshot: latest published snapshot whose cutoff <= instance start time.
		// This means a raid on July 10 compares against the July 10 00:00 UTC snapshot
		// (which includes data strictly before that day).
		startTime, stErr := store.GetLogInstanceStartTime(ctx, instanceID)
		if stErr != nil {
			if errors.Is(stErr, pgx.ErrNoRows) {
				httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
					Message: "Instance not found",
				})
				return
			}
			httpapi.HandleResponseError(ctx, w, stErr, httpapi.APIError{
				Response: chroniclesdk.Response{
					Message: "Failed to fetch instance",
					Detail:  stErr.Error(),
				},
			})
			return
		}

		if startTime.Valid {
			// Runs that predate all snapshots intentionally get no parses:
			// there is no honest historical dataset for them (deploy-day is
			// the epoch), and comparing an old raid against current data
			// would be misleading. pgx.ErrNoRows falls through to the
			// no_snapshot response below.
			if lookbackDays == parsepolicy.DefaultLookbackDays {
				// Resolve the same versioned canonical contract as the
				// persistence worker so an incompatible newer snapshot cannot
				// hide a complete persisted projection.
				snapshot, err = store.GetScoringSnapshotBefore(ctx, database.GetScoringSnapshotBeforeParams{
					TenantID:      tid,
					LookbackDays:  int32(lookbackDays),
					Before:        startTime,
					PolicyVersion: int16(parsepolicy.PolicyVersion),
					QueryVersion:  int16(QueryVersion),
				})
			} else {
				snapshot, err = store.GetLatestPublishedSnapshotBefore(ctx, database.GetLatestPublishedSnapshotBeforeParams{
					TenantID:     tid,
					LookbackDays: int32(lookbackDays),
					Before:       startTime,
				})
			}
		} else {
			// No recorded start time: we cannot resolve a day-of-raid
			// snapshot, so use the latest published one.
			if lookbackDays == parsepolicy.DefaultLookbackDays {
				snapshot, err = store.GetScoringSnapshotLatest(ctx, database.GetScoringSnapshotLatestParams{
					TenantID:      tid,
					LookbackDays:  int32(lookbackDays),
					PolicyVersion: int16(parsepolicy.PolicyVersion),
					QueryVersion:  int16(QueryVersion),
				})
			} else {
				snapshot, err = store.GetLatestPublishedSnapshot(ctx, database.GetLatestPublishedSnapshotParams{
					TenantID:     tid,
					LookbackDays: int32(lookbackDays),
				})
			}
		}
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// No published snapshot yet — return empty/unavailable state.
			httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceParsesResponse{
				Available:          false,
				Reason:             "no_snapshot",
				SelectedEncounters: encounterNames,
				Metric:             string(metric),
				Players:            []chroniclesdk.InstanceParsePlayer{},
			})
			return
		}
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch snapshot",
				Detail:  err.Error(),
			},
		})
		return
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
		seen := make(map[string]struct{})
		for _, m := range rankings {
			if _, ok := seen[m.EncounterName]; !ok {
				seen[m.EncounterName] = struct{}{}
				encounterNames = append(encounterNames, m.EncounterName)
			}
		}
		sort.Strings(encounterNames)
		for _, en := range encounterNames {
			encounterSet[en] = struct{}{}
		}
	}

	// A complete receipt makes the persisted projection authoritative for the
	// worker's canonical historical contract. Requests for other lookbacks or
	// the latest/current snapshot continue through the on-demand path below.
	if timeframe == "historical" && lookbackDays == parsepolicy.DefaultLookbackDays {
		persistedPlayers, complete, persistedErr := loadPersistedInstanceParses(
			ctx, store, tid, instanceID, snapshot, rankings, encounterNames, metric,
		)
		if persistedErr != nil {
			httpapi.HandleResponseError(ctx, w, persistedErr, httpapi.APIError{
				Response: chroniclesdk.Response{
					Message: "Failed to fetch persisted instance parses",
					Detail:  persistedErr.Error(),
				},
			})
			return
		}
		if complete {
			httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceParsesResponse{
				Available:          true,
				SnapshotID:         snapshot.ID,
				Cutoff:             snapshot.Cutoff.Time,
				LookbackDays:       snapshot.LookbackDays,
				CohortMode:         snapshot.CohortMode,
				SelectedEncounters: encounterNames,
				Metric:             string(metric),
				Players:            persistedPlayers,
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
				name:   m.PlayerName,
				class:  m.PlayerClass,
				spec:   m.PlayerSpec,
				role:   m.PlayerRole,
				bosses: make(map[string]database.ListRankingsForInstanceRow),
			}
			players[m.PlayerGuid] = p
			playerOrder = append(playerOrder, m.PlayerGuid)
		}
		// Keep the first (highest DPS, since ordered by dps DESC).
		if _, has := p.bosses[m.EncounterName]; !has {
			p.bosses[m.EncounterName] = m
		}
	}

	snapshotCohortMode := parsepolicy.CohortMode(snapshot.CohortMode)

	// Score each player's per-boss performance.
	result := make([]chroniclesdk.InstanceParsePlayer, 0, len(players))
	// Request-scoped cohort cache keyed by bucket; see comment at use site.
	cohortCache := make(map[string][]float64)

	for _, playerGUID := range playerOrder {
		p := players[playerGUID]

		sdkPlayer := chroniclesdk.InstanceParsePlayer{
			PlayerGUID:  playerGUID,
			PlayerName:  p.name,
			PlayerClass: normalizeClassName(p.class),
			PlayerSpec:  p.spec,
			PlayerRole:  p.role,
			Bosses:      make([]chroniclesdk.InstanceParseBoss, 0, len(p.bosses)),
		}

		// Check unknown spec in spec mode.
		isUnknownSpec := snapshotCohortMode == parsepolicy.CohortModeSpec && (p.spec == "" || strings.EqualFold(p.spec, "unknown"))

		if isUnknownSpec {
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

			if !isUnknownSpec {
				// Load cohort for this boss+class(+spec). Many players share a
				// bucket (e.g. all Fury Warriors on one boss), so cache cohort
				// slices per bucket key for the duration of this request to
				// avoid an N+1 query pattern across players.
				var playerSpec pgtype.Text
				if snapshotCohortMode == parsepolicy.CohortModeSpec {
					playerSpec = pgtype.Text{String: p.spec, Valid: true}
				}

				bucketKey := fmt.Sprintf("%s|%s|%d|%s|%s",
					encName, memberRow.DifficultyName, memberRow.MaxPlayers,
					memberRow.PlayerClass, playerSpec.String)
				cohort, cached := cohortCache[bucketKey]
				if !cached {
					cohortRows, cErr := store.GetSnapshotCohortValues(ctx, database.GetSnapshotCohortValuesParams{
						Metric:         string(metric),
						SnapshotID:     snapshot.ID,
						EncounterName:  encName,
						DifficultyName: memberRow.DifficultyName,
						MaxPlayers:     memberRow.MaxPlayers,
						PlayerClass:    memberRow.PlayerClass,
						PlayerSpec:     playerSpec,
					})
					if cErr != nil {
						logger.Error("failed to load cohort values",
							"encounter", encName,
							"player_guid", playerGUID,
							"error", cErr,
						)
						continue
					}

					cohort = make([]float64, 0, len(cohortRows))
					for _, cr := range cohortRows {
						if v, ok := toFloat64(cr.MetricValue); ok && v > 0 {
							cohort = append(cohort, v)
						}
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
		SnapshotID:         snapshot.ID,
		Cutoff:             snapshot.Cutoff.Time,
		LookbackDays:       snapshot.LookbackDays,
		CohortMode:         snapshot.CohortMode,
		SelectedEncounters: encounterNames,
		Metric:             string(metric),
		Players:            result,
	})
}

func loadPersistedInstanceParses(
	ctx context.Context,
	store parsesQuerier,
	tenantID, instanceID uuid.UUID,
	snapshot database.RankingSnapshot,
	rankings []database.ListRankingsForInstanceRow,
	encounterNames []string,
	metric parsepolicy.Metric,
) ([]chroniclesdk.InstanceParsePlayer, bool, error) {
	_, err := store.GetParseScoreReceiptForContract(ctx, database.GetParseScoreReceiptForContractParams{
		TenantID:      tenantID,
		InstanceID:    instanceID,
		SnapshotID:    snapshot.ID,
		LookbackDays:  int16(parsepolicy.DefaultLookbackDays),
		PolicyVersion: int16(parsepolicy.PolicyVersion),
		QueryVersion:  int16(QueryVersion),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("get parse score receipt: %w", err)
	}

	persisted, err := store.ListParseScoreResultsForContract(ctx, database.ListParseScoreResultsForContractParams{
		TenantID:   tenantID,
		InstanceID: instanceID,
		SnapshotID: uuid.NullUUID{UUID: snapshot.ID, Valid: true},
		Metric:     string(metric),
	})
	if err != nil {
		return nil, false, fmt.Errorf("list persisted parse scores: %w", err)
	}

	players, complete := buildPersistedInstanceParsePlayers(
		rankings,
		persisted,
		encounterNames,
		metric,
		parsepolicy.CohortMode(snapshot.CohortMode),
	)
	return players, complete, nil
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
				name:   ranking.PlayerName,
				class:  ranking.PlayerClass,
				spec:   ranking.PlayerSpec,
				role:   ranking.PlayerRole,
				bosses: make(map[string]database.ListRankingsForInstanceRow),
			}
			players[ranking.PlayerGuid] = player
			playerOrder = append(playerOrder, ranking.PlayerGuid)
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
			PlayerGUID:  playerGUID,
			PlayerName:  player.name,
			PlayerClass: normalizeClassName(player.class),
			PlayerSpec:  player.spec,
			PlayerRole:  player.role,
			Bosses:      make([]chroniclesdk.InstanceParseBoss, 0, len(player.bosses)),
		}

		unknownSpec := cohortMode == parsepolicy.CohortModeSpec && (player.spec == "" || strings.EqualFold(player.spec, "unknown"))
		if unknownSpec {
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
			if unknownSpec {
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

// toFloat64 converts an interface{} (typically from a SQL aggregate) to float64.
func toFloat64(v interface{}) (float64, bool) {
	switch val := v.(type) {
	case float64:
		return val, true
	case float32:
		return float64(val), true
	case int64:
		return float64(val), true
	case int32:
		return float64(val), true
	case int:
		return float64(val), true
	case string:
		// pgx sometimes returns numeric as string
		f, err := strconv.ParseFloat(val, 64)
		return f, err == nil
	default:
		return 0, false
	}
}
