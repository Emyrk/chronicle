package servicerankings

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// timeParsesQuerier is the database subset used by the time-parses handler.
type timeParsesQuerier interface {
	GetLatestPublishedTimeParseSnapshot(ctx context.Context, arg database.GetLatestPublishedTimeParseSnapshotParams) (database.TimeParseSnapshot, error)
	GetLatestPublishedTimeParseSnapshotBefore(ctx context.Context, arg database.GetLatestPublishedTimeParseSnapshotBeforeParams) (database.TimeParseSnapshot, error)
	GetLogInstanceStartTime(ctx context.Context, id uuid.UUID) (pgtype.Timestamptz, error)
	GetLogInstanceForTimeParse(ctx context.Context, id uuid.UUID) (database.GetLogInstanceForTimeParseRow, error)
	GetInstanceSpeedrun(ctx context.Context, instanceID uuid.UUID) (database.GetInstanceSpeedrunRow, error)
	GetInstanceCleanEncounterKillTimes(ctx context.Context, instanceID uuid.UUID) ([]database.GetInstanceCleanEncounterKillTimesRow, error)
	GetTimeParseSnapshotClearTimeCohort(ctx context.Context, arg database.GetTimeParseSnapshotClearTimeCohortParams) ([]int64, error)
	GetTimeParseSnapshotBossKillCohort(ctx context.Context, arg database.GetTimeParseSnapshotBossKillCohortParams) ([]int64, error)
	GetTenantByID(ctx context.Context, id uuid.UUID) (database.Tenant, error)
}

// handleInstanceTimeParses returns time-based parse scores for an instance.
//
//	GET /instances/{instanceID}/time-parses?period=60d&timeframe=historical
func (s *Service) handleInstanceTimeParses(w http.ResponseWriter, r *http.Request) {
	handleInstanceTimeParsesWithStore(s.store, s.logger, w, r)
}

func handleInstanceTimeParsesWithStore(store timeParsesQuerier, logger *slog.Logger, w http.ResponseWriter, r *http.Request) {
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

	// Parse period (lookback days).
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

	// Parse timeframe.
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

	// Check tenant parse config.
	if tid != uuid.Nil {
		tenant, tErr := store.GetTenantByID(ctx, tid)
		if tErr == nil && len(tenant.ParseConfig) > 0 {
			if isParseDisabled(tenant.ParseConfig) {
				httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceTimeParsesResponse{
					Available:     false,
					Reason:        "disabled",
					BossKillTimes: []chroniclesdk.BossKillTimeParse{},
				})
				return
			}
		}
	}

	// Resolve snapshot — always filter to the current policy+query version
	// so old-policy snapshots are never selected.
	policyVer := int16(timeparsepolicy.PolicyVersion)
	queryVer := timeParseSnapshotQueryVersion

	var snapshot database.TimeParseSnapshot
	switch timeframe {
	case "current":
		snapshot, err = store.GetLatestPublishedTimeParseSnapshot(ctx, database.GetLatestPublishedTimeParseSnapshotParams{
			TenantID:      tid,
			LookbackDays:  int32(lookbackDays),
			PolicyVersion: policyVer,
			QueryVersion:  queryVer,
		})
	default: // "historical"
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
			snapshot, err = store.GetLatestPublishedTimeParseSnapshotBefore(ctx, database.GetLatestPublishedTimeParseSnapshotBeforeParams{
				TenantID:      tid,
				LookbackDays:  int32(lookbackDays),
				PolicyVersion: policyVer,
				QueryVersion:  queryVer,
				Before:        startTime,
			})
		} else {
			snapshot, err = store.GetLatestPublishedTimeParseSnapshot(ctx, database.GetLatestPublishedTimeParseSnapshotParams{
				TenantID:      tid,
				LookbackDays:  int32(lookbackDays),
				PolicyVersion: policyVer,
				QueryVersion:  queryVer,
			})
		}
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceTimeParsesResponse{
				Available:     false,
				Reason:        "no_snapshot",
				BossKillTimes: []chroniclesdk.BossKillTimeParse{},
			})
			return
		}
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch time-parse snapshot",
				Detail:  err.Error(),
			},
		})
		return
	}

	// Get the instance's speedrun data.
	speedrun, sErr := store.GetInstanceSpeedrun(ctx, instanceID)
	if sErr != nil {
		if errors.Is(sErr, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceTimeParsesResponse{
				Available:     false,
				Reason:        "no_speedrun",
				BossKillTimes: []chroniclesdk.BossKillTimeParse{},
			})
			return
		}
		httpapi.HandleResponseError(ctx, w, sErr, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch speedrun",
				Detail:  sErr.Error(),
			},
		})
		return
	}

	// Get instance cohort dimensions (difficulty, max_players).
	instInfo, iErr := store.GetLogInstanceForTimeParse(ctx, instanceID)
	if iErr != nil {
		httpapi.HandleResponseError(ctx, w, iErr, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch instance info",
				Detail:  iErr.Error(),
			},
		})
		return
	}

	// Get the instance's clean encounter kill times only — partial kills are
	// excluded because the snapshot cohort contains only clean kills.
	encounterKills, eErr := store.GetInstanceCleanEncounterKillTimes(ctx, instanceID)
	if eErr != nil {
		httpapi.HandleResponseError(ctx, w, eErr, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch encounter kill times",
				Detail:  eErr.Error(),
			},
		})
		return
	}

	resp := chroniclesdk.InstanceTimeParsesResponse{
		Available:     true,
		SnapshotID:    snapshot.ID,
		Cutoff:        snapshot.Cutoff.Time,
		LookbackDays:  snapshot.LookbackDays,
		PolicyVersion: snapshot.PolicyVersion,
		QueryVersion:  snapshot.QueryVersion,
		BossKillTimes: make([]chroniclesdk.BossKillTimeParse, 0, len(encounterKills)),
	}

	// Score clear time.
	if speedrun.Qualified && speedrun.DurationMs > 0 {
		cohort, cErr := store.GetTimeParseSnapshotClearTimeCohort(ctx, database.GetTimeParseSnapshotClearTimeCohortParams{
			SnapshotID:     snapshot.ID,
			InstanceName:   speedrun.InstanceName,
			DifficultyName: instInfo.DifficultyName,
			MaxPlayers:     int16(instInfo.MaxPlayers),
		})
		if cErr != nil {
			logger.Error("failed to load clear-time cohort",
				"instance_id", instanceID,
				"error", cErr,
			)
		} else {
			scoreResult, scored := timeparsepolicy.ScoreTime(cohort, speedrun.DurationMs)
			clearScore := &chroniclesdk.TimeParseScore{
				DurationMs: speedrun.DurationMs,
				SampleSize: scoreResult.SampleSize,
				Status:     string(scoreResult.Status),
			}
			if scored {
				clearScore.PreciseScore = scoreResult.PreciseScore
				clearScore.DisplayScore = scoreResult.DisplayScore
				clearScore.Rank = scoreResult.Rank
			}
			if len(cohort) < timeparsepolicy.MinSampleForParse {
				clearScore.SampleSize = len(cohort)
			}
			resp.ClearTime = clearScore
		}
	}

	// Score each boss kill time.
	var preciseScores []float64
	for _, kill := range encounterKills {
		if kill.DurationMs <= 0 {
			continue
		}

		bossKillCohort, cErr := store.GetTimeParseSnapshotBossKillCohort(ctx, database.GetTimeParseSnapshotBossKillCohortParams{
			SnapshotID:     snapshot.ID,
			InstanceName:   speedrun.InstanceName,
			EncounterName:  kill.EncounterName,
			DifficultyName: instInfo.DifficultyName,
			MaxPlayers:     int16(instInfo.MaxPlayers),
		})
		if cErr != nil {
			logger.Error("failed to load boss-kill cohort",
				"instance_id", instanceID,
				"encounter", kill.EncounterName,
				"error", cErr,
			)
			continue
		}

		scoreResult, scored := timeparsepolicy.ScoreTime(bossKillCohort, kill.DurationMs)
		bossScore := chroniclesdk.BossKillTimeParse{
			EncounterName: kill.EncounterName,
			DurationMs:    kill.DurationMs,
			SampleSize:    scoreResult.SampleSize,
			Status:        string(scoreResult.Status),
		}
		if scored {
			bossScore.PreciseScore = scoreResult.PreciseScore
			bossScore.DisplayScore = scoreResult.DisplayScore
			bossScore.Rank = scoreResult.Rank
			preciseScores = append(preciseScores, scoreResult.PreciseScore)
		}
		if len(bossKillCohort) < timeparsepolicy.MinSampleForParse {
			bossScore.SampleSize = len(bossKillCohort)
		}
		resp.BossKillTimes = append(resp.BossKillTimes, bossScore)
	}

	// Compute average boss kill parse.
	if len(preciseScores) > 0 {
		avg, ok := timeparsepolicy.AverageParse(preciseScores, len(encounterKills))
		if ok {
			resp.AverageBossKillParse = &chroniclesdk.TimeParseAverage{
				PreciseScore: avg.PreciseScore,
				DisplayScore: avg.DisplayScore,
				Killed:       avg.Killed,
				Selected:     avg.Selected,
			}
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, resp)
}
