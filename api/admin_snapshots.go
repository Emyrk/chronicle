package api

import (
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/google/uuid"
)

// AdminTriggerParseSnapshot enqueues a parse snapshot publication job.
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

	result, err := servicerankings.EnqueueParseSnapshotBackfill(
		ctx,
		api.Queues,
		tenantID,
		time.Now(),
		req.LookbackDays,
		int16(parsepolicy.PolicyVersion),
		true, // Force: admin triggers always bypass the staleness guard.
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
