package api

import (
	"fmt"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/google/uuid"
)

// AdminBackfillTimeParseScores enqueues one bounded dispatcher job. The
// dispatcher finds matching historical instances and enqueues the normal
// per-instance locked score computation jobs.
//
//	POST /api/v1/admin/parses/time-scores/backfill
func (api *API) AdminBackfillTimeParseScores(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req chroniclesdk.AdminBackfillTimeParseScoresRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	args, err := parseAdminTimeParseBackfillRequest(req)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid time parse backfill request",
			Detail:  err.Error(),
		})
		return
	}
	if api.Queues == nil {
		httpapi.Write(ctx, w, http.StatusServiceUnavailable, chroniclesdk.Response{
			Message: "Ranking queue is unavailable",
		})
		return
	}

	result, err := api.Queues.Insert(ctx, args, nil)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to enqueue time parse backfill",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusAccepted, chroniclesdk.AdminBackfillTimeParseScoresResponse{
		JobID:    result.Job.ID,
		JobState: string(result.Job.State),
	})
}

func parseAdminTimeParseBackfillRequest(req chroniclesdk.AdminBackfillTimeParseScoresRequest) (servicerankings.ArgsBackfillTimeParseScores, error) {
	args := servicerankings.ArgsBackfillTimeParseScores{
		StartedAfter:  req.StartedAfter,
		StartedBefore: req.StartedBefore,
		BatchSize:     req.BatchSize,
		Force:         req.Force,
	}

	if req.TenantID != "" {
		tenantID, err := uuid.Parse(req.TenantID)
		if err != nil {
			return args, fmt.Errorf("tenant_id must be a UUID: %w", err)
		}
		args.TenantID = &tenantID
	}

	var startedAfter, startedBefore time.Time
	if req.StartedAfter != "" {
		parsed, err := time.Parse(time.RFC3339, req.StartedAfter)
		if err != nil {
			return args, fmt.Errorf("started_after must use RFC3339: %w", err)
		}
		startedAfter = parsed
	}
	if req.StartedBefore != "" {
		parsed, err := time.Parse(time.RFC3339, req.StartedBefore)
		if err != nil {
			return args, fmt.Errorf("started_before must use RFC3339: %w", err)
		}
		startedBefore = parsed
	}
	if !startedAfter.IsZero() && !startedBefore.IsZero() && !startedAfter.Before(startedBefore) {
		return args, fmt.Errorf("started_after must be before started_before")
	}
	if req.BatchSize < 0 || req.BatchSize > 500 {
		return args, fmt.Errorf("batch_size must be between 1 and 500, or 0 for the default")
	}

	return args, nil
}
