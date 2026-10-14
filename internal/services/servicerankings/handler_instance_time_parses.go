package servicerankings

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type timeParsesQuerier interface {
	InstanceBySlug(ctx context.Context, hashedSlug pgtype.Text) (database.LogInstancesGuild, error)
	GetLogInstanceForTimeParse(ctx context.Context, id uuid.UUID) (database.GetLogInstanceForTimeParseRow, error)
	GetInstanceSpeedrun(ctx context.Context, instanceID uuid.UUID) (database.GetInstanceSpeedrunRow, error)
	GetInstanceCleanEncounterKillTimes(ctx context.Context, instanceID uuid.UUID) ([]database.GetInstanceCleanEncounterKillTimesRow, error)
	GetTimeParseClearTimeMembershipCohort(ctx context.Context, arg database.GetTimeParseClearTimeMembershipCohortParams) ([]int64, error)
	GetTimeParseBossKillMembershipCohort(ctx context.Context, arg database.GetTimeParseBossKillMembershipCohortParams) ([]int64, error)
	GetTenantByID(ctx context.Context, id uuid.UUID) (database.Tenant, error)
}

func (s *Service) handleInstanceTimeParses(w http.ResponseWriter, r *http.Request) {
	handleInstanceTimeParsesWithStore(s.store, s.logger, w, r)
}

func handleInstanceTimeParsesWithStore(store timeParsesQuerier, logger *slog.Logger, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	instanceIDText := chi.URLParam(r, "instanceID")
	instanceID, err := uuid.Parse(instanceIDText)
	if err != nil {
		inst, slugErr := store.InstanceBySlug(ctx, pgtype.Text{String: instanceIDText, Valid: true})
		if slugErr != nil {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "Instance not found"})
			return
		}
		instanceID = inst.ID
	}

	window, err := parseLiveTimeParseWindow(r.URL.Query(), false, time.Now())
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid time-parse window", Detail: err.Error()})
		return
	}

	tenantID := servicetenant.TenantIDFromContext(ctx)
	if tenantID != uuid.Nil {
		tenant, tenantErr := store.GetTenantByID(ctx, tenantID)
		if tenantErr == nil && len(tenant.ParseConfig) > 0 && isParseDisabled(tenant.ParseConfig) {
			httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceTimeParsesResponse{Available: false, Reason: "disabled", BossKillTimes: []chroniclesdk.BossKillTimeParse{}})
			return
		}
	}

	speedrun, err := store.GetInstanceSpeedrun(ctx, instanceID)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceTimeParsesResponse{Available: false, Reason: "no_speedrun", BossKillTimes: []chroniclesdk.BossKillTimeParse{}})
		return
	}
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to fetch speedrun", Detail: err.Error()}})
		return
	}

	instInfo, err := store.GetLogInstanceForTimeParse(ctx, instanceID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to fetch instance info", Detail: err.Error()}})
		return
	}
	encounterKills, err := store.GetInstanceCleanEncounterKillTimes(ctx, instanceID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to fetch encounter kill times", Detail: err.Error()}})
		return
	}

	policyVersion := int16(timeparsepolicy.PolicyVersion)
	queryVersion := timeparsepolicy.QueryVersion
	cutoff := pgtype.Timestamptz{Time: window.Cutoff, Valid: true}
	excludeRunID := instInfo.RunID
	resp := chroniclesdk.InstanceTimeParsesResponse{
		Available: true, Cutoff: window.Cutoff, WindowStart: window.windowStartPtr(),
		LookbackDays: window.LookbackDays, PolicyVersion: policyVersion, QueryVersion: queryVersion,
		BossKillTimes: make([]chroniclesdk.BossKillTimeParse, 0, len(encounterKills)),
	}

	clearDurationMs := speedrun.RankedDurationMs.Int64
	if speedrun.RankedDurationMs.Valid && clearDurationMs > 0 {
		cohort, cohortErr := store.GetTimeParseClearTimeMembershipCohort(ctx, database.GetTimeParseClearTimeMembershipCohortParams{
			TenantID: tenantID, PolicyVersion: policyVersion, QueryVersion: queryVersion,
			Cutoff: cutoff, WindowStart: window.WindowStart, ExcludeRunID: excludeRunID,
			InstanceName: speedrun.InstanceName, DifficultyName: instInfo.DifficultyName, MaxPlayers: int16(instInfo.MaxPlayers),
		})
		if cohortErr != nil {
			logger.Error("failed to load clear-time cohort", "instance_id", instanceID, "error", cohortErr)
		} else {
			result, scored := timeparsepolicy.ScoreTime(cohort, clearDurationMs)
			score := &chroniclesdk.TimeParseScore{DurationMs: clearDurationMs, SampleSize: result.SampleSize, Status: string(result.Status)}
			if scored {
				score.PreciseScore, score.DisplayScore, score.Rank = result.PreciseScore, result.DisplayScore, result.Rank
			}
			if len(cohort) < timeparsepolicy.MinSampleForParse {
				score.SampleSize = len(cohort)
			}
			resp.ClearTime = score
		}
	}

	preciseScores := make([]float64, 0, len(encounterKills))
	for _, kill := range encounterKills {
		if kill.DurationMs <= 0 {
			continue
		}
		cohort, cohortErr := store.GetTimeParseBossKillMembershipCohort(ctx, database.GetTimeParseBossKillMembershipCohortParams{
			TenantID: tenantID, PolicyVersion: policyVersion, QueryVersion: queryVersion,
			Cutoff: cutoff, WindowStart: window.WindowStart, ExcludeRunID: excludeRunID,
			InstanceName: speedrun.InstanceName, EncounterName: kill.EncounterName,
			DifficultyName: instInfo.DifficultyName, MaxPlayers: int16(instInfo.MaxPlayers),
		})
		if cohortErr != nil {
			logger.Error("failed to load boss-kill cohort", "instance_id", instanceID, "encounter", kill.EncounterName, "error", cohortErr)
			continue
		}
		result, scored := timeparsepolicy.ScoreTime(cohort, kill.DurationMs)
		score := chroniclesdk.BossKillTimeParse{EncounterID: kill.EncounterID, EncounterName: kill.EncounterName, DurationMs: kill.DurationMs, SampleSize: result.SampleSize, Status: string(result.Status)}
		if scored {
			score.PreciseScore, score.DisplayScore, score.Rank = result.PreciseScore, result.DisplayScore, result.Rank
			preciseScores = append(preciseScores, result.PreciseScore)
		}
		if len(cohort) < timeparsepolicy.MinSampleForParse {
			score.SampleSize = len(cohort)
		}
		resp.BossKillTimes = append(resp.BossKillTimes, score)
	}
	if average, ok := timeparsepolicy.AverageParse(preciseScores, len(encounterKills)); ok {
		resp.AverageBossKillParse = &chroniclesdk.TimeParseAverage{PreciseScore: average.PreciseScore, DisplayScore: average.DisplayScore, Killed: average.Killed, Selected: average.Selected}
	}
	httpapi.Write(ctx, w, http.StatusOK, resp)
}
