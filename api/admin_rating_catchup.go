package api

import (
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// AdminListRatingCatchup returns a current cross-tenant snapshot of persisted
// dirty work. The route is protected by the global rating-admin permission.
func (api *API) AdminListRatingCatchup(w http.ResponseWriter, r *http.Request) {
	ctx := servicetenant.AdminBypass(r.Context())
	rows, err := api.Opts.Zed.ListTenantRatingCatchupStatus(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	stages, err := api.Opts.Zed.ListRatingPolicyScanStageTimes(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	jobs, err := api.Opts.Zed.ListRecentTenantRatingJobs(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, ratingCatchupSnapshot(rows, stages, jobs, time.Now().UTC()))
}

func ratingCatchupTimestamp(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	return &t.Time
}

func ratingCatchupSnapshot(rows []database.ListTenantRatingCatchupStatusRow, stages []database.ListRatingPolicyScanStageTimesRow, jobs []database.ListRecentTenantRatingJobsRow, now time.Time) chroniclesdk.AdminRatingCatchupStatusResponse {
	latest := make(map[string]database.ListRecentTenantRatingJobsRow)
	latestScan := make(map[uuid.UUID]database.ListRecentTenantRatingJobsRow)
	stageTimes := make(map[uuid.UUID][]chroniclesdk.AdminRatingPolicyStageTime)
	for _, stage := range stages {
		stageTimes[stage.TenantID] = append(stageTimes[stage.TenantID], chroniclesdk.AdminRatingPolicyStageTime{
			Stage: stage.Stage, CompletedAt: stage.UpdatedAt.Time,
		})
	}
	succeeded := make(map[string]*time.Time)
	for _, job := range jobs { // newest first
		if job.Kind == "rating-policy-scan" {
			if tenant, err := uuid.Parse(job.TenantID); err == nil {
				if _, exists := latestScan[tenant]; !exists {
					latestScan[tenant] = job
				}
			}
		}
		if _, exists := latest[job.TenantID]; !exists {
			latest[job.TenantID] = job
		}
		if job.State == "completed" && succeeded[job.TenantID] == nil {
			succeeded[job.TenantID] = ratingCatchupTimestamp(job.FinalizedAt)
		}
	}
	out := chroniclesdk.AdminRatingCatchupStatusResponse{
		ObservedAt: now,
		Tenants:    make([]chroniclesdk.AdminTenantRatingCatchup, 0, len(rows)),
	}
	for _, row := range rows {
		status := "catching_up"
		if !row.SourceCutoff.Valid && row.UnfinishedPolicyScanStages == 0 {
			status = "not_started"
		} else if row.ReadState == "evolving" && row.CompletedAt.Valid && row.DirtyRuns+row.DirtyRenown+row.DirtyMastery+row.DirtyPeak+row.PeakPages+row.ActiveDrainJobs+row.UnfinishedPolicyScanStages == 0 {
			status = "caught_up"
		}
		item := chroniclesdk.AdminTenantRatingCatchup{
			TenantID: row.TenantID, TenantSlug: row.TenantSlug, Status: status, ReadState: row.ReadState,
			DirtyRuns: row.DirtyRuns, DirtyRenown: row.DirtyRenown,
			DirtyMastery: row.DirtyMastery, DirtyPeak: row.DirtyPeak,
			PeakPages: row.PeakPages, ActiveDrainJobs: row.ActiveDrainJobs,
			PolicyScanStages: row.PolicyScanStages, UnfinishedPolicyScanStages: row.UnfinishedPolicyScanStages,
			PolicyScanStageNumber: row.PolicyScanStageNumber,
			PolicyScanStageTimes:  append([]chroniclesdk.AdminRatingPolicyStageTime{}, stageTimes[row.TenantID]...),
			OldestRun:             ratingCatchupTimestamp(row.OldestRun),
			OldestRenown:          ratingCatchupTimestamp(row.OldestRenown),
			OldestMastery:         ratingCatchupTimestamp(row.OldestMastery),
			OldestPeak:            ratingCatchupTimestamp(row.OldestPeak),
			ScanSourceCutoff:      ratingCatchupTimestamp(row.SourceCutoff),
			ScanCompletedAt:       ratingCatchupTimestamp(row.CompletedAt),
		}
		if scanJob, ok := latestScan[row.TenantID]; ok && scanJob.CreatedAt.Valid {
			// A just-reset cursor may still have an older completed job. Do not
			// use it as the start of a new pass before its new job is queued.
			active := scanJob.State == "available" || scanJob.State == "pending" || scanJob.State == "retryable" || scanJob.State == "running" || scanJob.State == "scheduled"
			if (row.UnfinishedPolicyScanStages == 0 || active) &&
				(len(item.PolicyScanStageTimes) == 0 || !scanJob.CreatedAt.Time.After(item.PolicyScanStageTimes[0].CompletedAt)) {
				item.PolicyScanStartedAt = ratingCatchupTimestamp(scanJob.CreatedAt)
			}
		}
		if row.AfterRunID.Valid {
			id := uuid.UUID(row.AfterRunID.UUID)
			item.ScanAfterRunID = &id
		}
		if job, ok := latest[row.TenantID.String()]; ok {
			item.JobKind = job.Kind
			item.JobState = job.State
			item.JobLastError = job.LastError
			item.JobAttemptedAt = ratingCatchupTimestamp(job.AttemptedAt)
			item.LastSucceededAt = succeeded[row.TenantID.String()]
			if job.State == "discarded" || (job.State == "retryable" && job.LastError != "") {
				item.Status = "stalled_error"
			} else if job.State == "running" || job.State == "available" || job.State == "pending" || job.State == "scheduled" || job.State == "retryable" {
				if item.Status == "caught_up" {
					item.Status = "catching_up"
				}
			}
		}
		out.Tenants = append(out.Tenants, item)
	}
	return out
}
