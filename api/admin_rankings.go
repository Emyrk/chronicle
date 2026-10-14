package api

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
)

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

	if _, err := api.Queues.Insert(ctx, rankingargs.ArgsRepairRankingRuns{}, nil); err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to enqueue ranking run repair",
				Detail:  err.Error(),
			},
		})
		return
	}

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
