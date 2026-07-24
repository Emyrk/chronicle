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
	"github.com/google/uuid"
)

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
		JobID:    result.Job.ID,
		JobState: string(result.Job.State),
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
		s := chroniclesdk.AdminSnapshotSummary{
			ID:            row.ID,
			TenantID:      row.TenantID,
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
