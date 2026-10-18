package api

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/billing"
)

// AdminResyncBilling enqueues the authoritative Stripe subscription and
// entitlement reconciliation job.
//
//	POST /api/v1/admin/billing/resync
func (api *API) AdminResyncBilling(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if api.Queues == nil {
		httpapi.Write(ctx, w, http.StatusServiceUnavailable, chroniclesdk.Response{
			Message: "Billing reconciliation queue is unavailable.",
		})
		return
	}

	result, err := api.Queues.Insert(ctx, billing.ArgsReconcileSubscriptions{}, nil)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to enqueue billing resync.",
				Detail:  err.Error(),
			},
		})
		return
	}

	message := "Billing resync queued."
	if result.UniqueSkippedAsDuplicate {
		message = "A billing resync is already queued or running."
	}
	httpapi.Write(ctx, w, http.StatusAccepted, chroniclesdk.Response{Message: message})
}
