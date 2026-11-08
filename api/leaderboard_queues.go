package api

import (
	"context"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"net/http"
	"time"
)

// AdminLeaderboardQueues reports durable queue truth independently of operation history.
func (api *API) AdminLeaderboardQueues(w http.ResponseWriter, r *http.Request) {
	tenant, err := uuid.Parse(r.URL.Query().Get("tenant_id"))
	if err != nil || tenant == uuid.Nil {
		httpapi.Write(r.Context(), w, 400, chroniclesdk.Response{Message: "tenant_id is required"})
		return
	}
	ctx, cancel := context.WithTimeout(servicetenant.WithTenantID(r.Context(), tenant), 5*time.Second)
	defer cancel()
	rows, err := database.New(api.Opts.Pool).LeaderboardQueueDiagnostics(ctx, tenant)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	out := chroniclesdk.LeaderboardQueueDiagnostics{TenantID: tenant, CollectedAt: time.Now().UTC(), Queues: make([]chroniclesdk.LeaderboardQueueStatus, 0, len(rows))}
	for _, row := range rows {
		status := chroniclesdk.LeaderboardQueueStatus{Family: row.Family, Pending: row.Pending, Due: row.Due, Claimed: row.Claimed, Retrying: row.Retrying}
		if row.OldestPendingAt.Valid {
			value := row.OldestPendingAt.Time
			status.OldestPendingAt = &value
		}
		if row.OldestDueAt.Valid {
			value := row.OldestDueAt.Time
			status.OldestDueAt = &value
		}
		out.Queues = append(out.Queues, status)
	}
	httpapi.Write(ctx, w, 200, out)
}
