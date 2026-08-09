package api

import (
	"fmt"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// ── Time-Parse Snapshot Admin ────────────────────────────────────────────

// AdminListTimeParseSnapshots returns all time-parse snapshots across tenants.
//
//	GET /api/v1/admin/parses/time-parse-snapshots
func (api *API) AdminListTimeParseSnapshots(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	store := database.New(api.Opts.Pool)
	rows, err := store.ListAllTimeParseSnapshots(ctx)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to list time-parse snapshots",
				Detail:  err.Error(),
			},
		})
		return
	}

	out := make([]chroniclesdk.AdminTimeParseSnapshotSummary, 0, len(rows))
	for _, row := range rows {
		tenantName := "Root"
		if row.TenantName.Valid {
			tenantName = row.TenantName.String
		}
		s := chroniclesdk.AdminTimeParseSnapshotSummary{
			ID:                row.ID,
			TenantID:          row.TenantID,
			TenantName:        tenantName,
			LookbackDays:      row.LookbackDays,
			PolicyVersion:     row.PolicyVersion,
			QueryVersion:      row.QueryVersion,
			ClearMemberCount:  row.ClearMemberCount,
			BossMemberCount:   row.BossMemberCount,
			Status:            row.Status,
			SourceRowCount:    row.SourceRowCount,
			SourceFingerprint: row.SourceFingerprint,
		}
		if row.Cutoff.Valid {
			s.Cutoff = row.Cutoff.Time
		}
		if row.WindowStart.Valid {
			s.WindowStart = &row.WindowStart.Time
		}
		if row.SourceWatermark.Valid {
			s.SourceWatermark = &row.SourceWatermark.Time
		}
		if row.PublishedAt.Valid {
			s.PublishedAt = &row.PublishedAt.Time
		}
		s.CreatedAt = row.CreatedAt.Time
		out = append(out, s)
	}

	httpapi.Write(ctx, w, http.StatusOK, out)
}

// AdminDeleteTimeParseSnapshot removes a time-parse snapshot and its
// cascade-deleted members. DELETE is idempotent.
//
//	DELETE /api/v1/admin/parses/time-parse-snapshots/{snapshotID}
func (api *API) AdminDeleteTimeParseSnapshot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	snapshotID, err := uuid.Parse(chi.URLParam(r, "snapshotID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid snapshot ID",
			Detail:  err.Error(),
		})
		return
	}

	store := database.New(api.Opts.Pool)
	if err := store.DeleteTimeParseSnapshot(ctx, snapshotID); err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to delete time-parse snapshot",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{
		Message: "Time-parse snapshot deleted",
	})
}

// AdminBulkDeleteTimeParseSnapshots removes multiple time-parse snapshots.
// Members are cascade-deleted via FK. Nonexistent IDs are silently ignored.
//
//	POST /api/v1/admin/parses/time-parse-snapshots/delete
func (api *API) AdminBulkDeleteTimeParseSnapshots(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req chroniclesdk.AdminBulkDeleteSnapshotsRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if len(req.IDs) == 0 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "No snapshot IDs provided",
		})
		return
	}

	store := database.New(api.Opts.Pool)
	if err := store.DeleteTimeParseSnapshots(ctx, req.IDs); err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to delete time-parse snapshots",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.AdminBulkDeleteSnapshotsResponse{
		Deleted: len(req.IDs),
	})
}

// AdminTriggerTimeParseSnapshot enqueues time-parse snapshot publication jobs.
// Reuses the same request/response types as DPS/HPS snapshots.
//
//	POST /api/v1/admin/parses/time-parse-snapshot
func (api *API) AdminTriggerTimeParseSnapshot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req chroniclesdk.AdminTriggerSnapshotRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	var tenantID uuid.UUID
	if req.TenantID != "" {
		parsed, err := uuid.Parse(req.TenantID)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid tenant_id",
				Detail:  err.Error(),
			})
			return
		}
		tenantID = parsed
	}

	day := time.Now().UTC()
	if req.Day != "" {
		parsed, err := time.Parse("2006-01-02", req.Day)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid day format, expected YYYY-MM-DD",
				Detail:  err.Error(),
			})
			return
		}
		day = parsed
	}

	switch req.LookbackDays {
	case 0, 30, 60, 90, 180:
	default:
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid lookback_days",
			Detail:  fmt.Sprintf("must be one of: 0 (all-time), 30, 60, 90, 180; got %d", req.LookbackDays),
		})
		return
	}

	if req.AllTenants && req.TenantID == "" {
		store := database.New(api.Opts.Pool)
		results, err := servicerankings.EnqueueTimeParseSnapshotBackfillAllTenants(
			ctx,
			store,
			api.Queues,
			day,
			req.LookbackDays,
			int16(timeparsepolicy.PolicyVersion),
		)
		if err != nil {
			httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
				Response: chroniclesdk.Response{
					Message: "Failed to enqueue all-tenants time-parse snapshot backfill",
					Detail:  err.Error(),
				},
			})
			return
		}

		jobs := make([]chroniclesdk.AdminTriggerSnapshotJobResult, 0, len(results))
		for _, r := range results {
			jobs = append(jobs, chroniclesdk.AdminTriggerSnapshotJobResult{
				TenantID:     r.TenantID.String(),
				LookbackDays: r.LookbackDays,
				JobID:        r.JobID,
				JobState:     r.JobState,
			})
		}

		httpapi.Write(ctx, w, http.StatusAccepted, chroniclesdk.AdminTriggerSnapshotResponse{
			Jobs: jobs,
		})
		return
	}

	result, err := servicerankings.EnqueueTimeParseSnapshotBackfill(
		ctx,
		api.Queues,
		tenantID,
		day,
		req.LookbackDays,
		int16(timeparsepolicy.PolicyVersion),
	)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to enqueue time-parse snapshot publication",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusAccepted, chroniclesdk.AdminTriggerSnapshotResponse{
		Jobs: []chroniclesdk.AdminTriggerSnapshotJobResult{{
			TenantID:     tenantID.String(),
			LookbackDays: req.LookbackDays,
			JobID:        result.Job.ID,
			JobState:     string(result.Job.State),
		}},
	})
}

// AdminDeleteSnapshot removes a snapshot and its cascade-deleted members.
// DELETE is idempotent: deleting a nonexistent ID is a no-op 200.
//
// Deleting a day's snapshot makes raids from that day resolve to the previous
// snapshot (or show no parses if none), and allows re-backfilling that day
// since the idempotency guard only checks status='published'.
//
//	DELETE /api/v1/admin/parses/snapshots/{snapshotID}
func (api *API) AdminDeleteSnapshot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	snapshotID, err := uuid.Parse(chi.URLParam(r, "snapshotID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid snapshot ID",
			Detail:  err.Error(),
		})
		return
	}

	store := database.New(api.Opts.Pool)
	if err := store.DeleteRankingSnapshot(ctx, snapshotID); err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to delete snapshot",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{
		Message: "Snapshot deleted",
	})
}

// AdminBulkDeleteSnapshots removes multiple snapshots in a single request.
// Members are cascade-deleted via FK. Nonexistent IDs are silently ignored.
//
//	POST /api/v1/admin/parses/snapshots/delete
func (api *API) AdminBulkDeleteSnapshots(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req chroniclesdk.AdminBulkDeleteSnapshotsRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	if len(req.IDs) == 0 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "No snapshot IDs provided",
		})
		return
	}

	store := database.New(api.Opts.Pool)
	if err := store.DeleteRankingSnapshots(ctx, req.IDs); err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to delete snapshots",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.AdminBulkDeleteSnapshotsResponse{
		Deleted: len(req.IDs),
	})
}

// AdminTriggerParseSnapshot enqueues the normal idempotent parse snapshot
// publication job. Useful to trigger without waiting for the hourly tick;
// the job will no-op if that day's snapshot already exists.
//
//	POST /api/v1/admin/parses/snapshot
func (api *API) AdminTriggerParseSnapshot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req chroniclesdk.AdminTriggerSnapshotRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	var tenantID uuid.UUID
	if req.TenantID != "" {
		parsed, err := uuid.Parse(req.TenantID)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid tenant_id",
				Detail:  err.Error(),
			})
			return
		}
		tenantID = parsed
	}

	day := time.Now().UTC()
	if req.Day != "" {
		parsed, err := time.Parse("2006-01-02", req.Day)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid day format, expected YYYY-MM-DD",
				Detail:  err.Error(),
			})
			return
		}
		day = parsed
	}

	// Only allow lookbacks the parse system actually publishes; anything else
	// would enqueue a job whose snapshot no consumer ever resolves.
	switch req.LookbackDays {
	case 0, 30, 60, 90, 180:
	default:
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid lookback_days",
			Detail:  fmt.Sprintf("must be one of: 0 (all-time), 30, 60, 90, 180; got %d", req.LookbackDays),
		})
		return
	}

	if req.AllTenants && req.TenantID == "" {
		store := database.New(api.Opts.Pool)
		results, err := servicerankings.EnqueueParseSnapshotBackfillAllTenants(
			ctx,
			store,
			api.Queues,
			day,
			req.LookbackDays,
			int16(parsepolicy.PolicyVersion),
		)
		if err != nil {
			httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
				Response: chroniclesdk.Response{
					Message: "Failed to enqueue all-tenants snapshot backfill",
					Detail:  err.Error(),
				},
			})
			return
		}

		jobs := make([]chroniclesdk.AdminTriggerSnapshotJobResult, 0, len(results))
		for _, r := range results {
			jobs = append(jobs, chroniclesdk.AdminTriggerSnapshotJobResult{
				TenantID:     r.TenantID.String(),
				LookbackDays: r.LookbackDays,
				JobID:        r.JobID,
				JobState:     r.JobState,
			})
		}

		httpapi.Write(ctx, w, http.StatusAccepted, chroniclesdk.AdminTriggerSnapshotResponse{
			Jobs: jobs,
		})
		return
	}

	result, err := servicerankings.EnqueueParseSnapshotBackfill(
		ctx,
		api.Queues,
		tenantID,
		day,
		req.LookbackDays,
		int16(parsepolicy.PolicyVersion),
	)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to enqueue snapshot publication",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusAccepted, chroniclesdk.AdminTriggerSnapshotResponse{
		Jobs: []chroniclesdk.AdminTriggerSnapshotJobResult{{
			TenantID:     tenantID.String(),
			LookbackDays: req.LookbackDays,
			JobID:        result.Job.ID,
			JobState:     string(result.Job.State),
		}},
	})
}

// AdminRankingsRefreshStatus returns summary freshness diagnostics for root and every tenant.
//
//	GET /api/v1/admin/parses/rankings/status
func (api *API) AdminRankingsRefreshStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	store := database.New(api.Opts.Pool)

	tenants, err := store.ListTenants(servicetenant.AdminBypass(ctx))
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to list tenants for rankings status",
				Detail:  err.Error(),
			},
		})
		return
	}

	type tenantRef struct {
		id   uuid.UUID
		name string
	}
	tenantRefs := make([]tenantRef, 0, len(tenants)+1)
	tenantRefs = append(tenantRefs, tenantRef{id: uuid.Nil, name: "Root"})
	for _, tenant := range tenants {
		tenantRefs = append(tenantRefs, tenantRef{id: tenant.ID, name: tenant.Name})
	}

	currentQueryVersion := servicerankings.RankingsSummaryQueryVersion()
	statuses := make([]chroniclesdk.AdminRankingsRefreshTenantStatus, 0, len(tenantRefs))
	for _, tenant := range tenantRefs {
		tenantCtx := servicetenant.WithTenantID(ctx, tenant.id)
		currentRowCount, err := store.RankingsRowCount(tenantCtx)
		if err != nil {
			httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
				Response: chroniclesdk.Response{
					Message: "Failed to count tenant rankings",
					Detail:  err.Error(),
				},
			})
			return
		}
		summary, err := store.RankingsSummaryStatus(tenantCtx, tenant.id)
		if err != nil {
			httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
				Response: chroniclesdk.Response{
					Message: "Failed to fetch tenant rankings status",
					Detail:  err.Error(),
				},
			})
			return
		}

		status := chroniclesdk.AdminRankingsRefreshTenantStatus{
			TenantID:            tenant.id,
			TenantName:          tenant.name,
			CurrentRowCount:     currentRowCount,
			MinLastRowCount:     summary.MinLastRowCount,
			MaxLastRowCount:     summary.MaxLastRowCount,
			SummaryCount:        summary.SummaryCount,
			StoredQueryVersion:  summary.QueryVersion,
			CurrentQueryVersion: currentQueryVersion,
			RefreshNeeded: currentRowCount != summary.MinLastRowCount ||
				currentRowCount != summary.MaxLastRowCount ||
				summary.QueryVersion < currentQueryVersion,
		}
		if summary.LastRebuiltAt.Valid {
			status.LastRebuiltAt = &summary.LastRebuiltAt.Time
		}
		statuses = append(statuses, status)
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.AdminRankingsRefreshStatusResponse{
		Tenants: statuses,
	})
}

// AdminRefreshRankings enqueues summary refresh jobs for root and every tenant,
// bypassing the periodic dispatch throttle.
//
//	POST /api/v1/admin/parses/rankings/refresh
func (api *API) AdminRefreshRankings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	results, err := servicerankings.EnqueueRankingsSummaryRefreshAllTenants(
		ctx,
		database.New(api.Opts.Pool),
		api.Queues,
	)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to enqueue rankings refresh",
				Detail:  err.Error(),
			},
		})
		return
	}

	jobs := make([]chroniclesdk.AdminRefreshRankingsJob, 0, len(results))
	for _, result := range results {
		jobs = append(jobs, chroniclesdk.AdminRefreshRankingsJob{
			TenantID: result.TenantID.String(),
			JobID:    result.JobID,
			JobState: result.JobState,
		})
	}

	httpapi.Write(ctx, w, http.StatusAccepted, chroniclesdk.AdminRefreshRankingsResponse{
		Jobs: jobs,
	})
}

// AdminListSnapshots returns all snapshots across tenants for admin viewing.
//
//	GET /api/v1/admin/parses/snapshots
func (api *API) AdminListSnapshots(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	store := database.New(api.Opts.Pool)
	rows, err := store.ListAllSnapshots(ctx)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to list snapshots",
				Detail:  err.Error(),
			},
		})
		return
	}

	out := make([]chroniclesdk.AdminSnapshotSummary, 0, len(rows))
	for _, row := range rows {
		tenantName := "Root"
		if row.TenantName.Valid {
			tenantName = row.TenantName.String
		}
		s := chroniclesdk.AdminSnapshotSummary{
			ID:            row.ID,
			TenantID:      row.TenantID,
			TenantName:    tenantName,
			LookbackDays:  row.LookbackDays,
			CohortMode:    row.CohortMode,
			PolicyVersion: row.PolicyVersion,
			QueryVersion:  row.QueryVersion,
			MemberCount:   row.MemberCount,
			Status:        row.Status,
		}
		if row.Cutoff.Valid {
			s.Cutoff = row.Cutoff.Time
		}
		if row.PublishedAt.Valid {
			s.PublishedAt = &row.PublishedAt.Time
		}
		s.CreatedAt = row.CreatedAt.Time
		out = append(out, s)
	}

	httpapi.Write(ctx, w, http.StatusOK, out)
}
