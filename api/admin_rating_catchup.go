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
	jobs, err := api.Opts.Zed.ListRecentTenantRatingDrainJobs(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, ratingCatchupSnapshot(rows, jobs, time.Now().UTC()))
}

func ratingCatchupTimestamp(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	return &t.Time
}

func ratingCatchupSnapshot(rows []database.ListTenantRatingCatchupStatusRow, jobs []database.ListRecentTenantRatingDrainJobsRow, now time.Time) chroniclesdk.AdminRatingCatchupStatusResponse {
	latest := make(map[string]database.ListRecentTenantRatingDrainJobsRow)
	succeeded := make(map[string]*time.Time)
	for _, job := range jobs { // newest first
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
		if !row.SourceCutoff.Valid {
			status = "not_started"
		} else if row.ReadState == "evolving" && row.CompletedAt.Valid && row.DirtyRuns+row.DirtyRenown+row.DirtyMastery+row.DirtyPeak+row.PeakPages == 0 {
			status = "caught_up"
		}
		item := chroniclesdk.AdminTenantRatingCatchup{
			TenantID: row.TenantID, Status: status, ReadState: row.ReadState,
			DirtyRuns: row.DirtyRuns, DirtyRenown: row.DirtyRenown,
			DirtyMastery: row.DirtyMastery, DirtyPeak: row.DirtyPeak,
			PeakPages: row.PeakPages, OldestRun: ratingCatchupTimestamp(row.OldestRun),
			OldestRenown:     ratingCatchupTimestamp(row.OldestRenown),
			OldestMastery:    ratingCatchupTimestamp(row.OldestMastery),
			OldestPeak:       ratingCatchupTimestamp(row.OldestPeak),
			ScanSourceCutoff: ratingCatchupTimestamp(row.SourceCutoff),
			ScanCompletedAt:  ratingCatchupTimestamp(row.CompletedAt),
		}
		if row.AfterRunID.Valid {
			id := uuid.UUID(row.AfterRunID.UUID)
			item.ScanAfterRunID = &id
		}
		if job, ok := latest[row.TenantID.String()]; ok {
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
