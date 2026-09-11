package api

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// AdminRankingSummaryBackfills previews backfill scope and returns the latest plan.
//
//	GET /api/v1/admin/parses/ranking-run-summaries/backfills
func (api *API) AdminRankingSummaryBackfills(w http.ResponseWriter, r *http.Request) {
	ctx := servicetenant.AdminBypass(r.Context())
	tenantID, scopeAll, ok := rankingSummaryBackfillScope(w, r)
	if !ok {
		return
	}
	targetVersion := servicerankings.RankingPlayerRunSummaryVersion()
	if raw := r.URL.Query().Get("target_summary_version"); raw != "" {
		value, err := strconv.ParseInt(raw, 10, 16)
		if err != nil || value < 1 {
			httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "target_summary_version must be a positive integer"})
			return
		}
		targetVersion = int16(value)
	}

	store := database.New(api.Opts.Pool)
	preview, err := store.PreviewRankingSummaryBackfill(ctx, database.PreviewRankingSummaryBackfillParams{
		ScopeAll: scopeAll, TenantID: tenantID, TargetSummaryVersion: targetVersion,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	response := chroniclesdk.AdminRankingSummaryBackfillsResponse{
		Preview: rankingSummaryBackfillPreview(tenantID, scopeAll, targetVersion, preview),
	}
	latest, err := store.LatestRankingSummaryBackfill(ctx)
	if err == nil {
		converted := rankingSummaryBackfill(latest)
		response.Latest = &converted
	} else if !errors.Is(err, pgx.ErrNoRows) {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, response)
}

// AdminCreateRankingSummaryBackfill persists a planned record only.
//
//	POST /api/v1/admin/parses/ranking-run-summaries/backfills
func (api *API) AdminCreateRankingSummaryBackfill(w http.ResponseWriter, r *http.Request) {
	var req chroniclesdk.AdminRankingSummaryBackfillRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	if req.BatchSize < 1 || req.BatchSize > 500 {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "batch_size must be between 1 and 500"})
		return
	}
	if req.MaxBatches < 1 || req.MaxBatches > 100 {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "max_batches must be between 1 and 100"})
		return
	}
	if req.DelayMS < 100 || req.DelayMS > 60000 {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "delay_ms must be between 100 and 60000"})
		return
	}
	if req.TargetSummaryVersion < 1 {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "target_summary_version must be a positive integer"})
		return
	}

	tenantID := uuid.Nil
	scopeAll := req.TenantID == nil
	if req.TenantID != nil {
		tenantID = *req.TenantID
	}
	ctx := servicetenant.AdminBypass(r.Context())
	store := database.New(api.Opts.Pool)
	preview, err := store.PreviewRankingSummaryBackfill(ctx, database.PreviewRankingSummaryBackfillParams{
		ScopeAll: scopeAll, TenantID: tenantID, TargetSummaryVersion: req.TargetSummaryVersion,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	created, err := store.CreateRankingSummaryBackfill(ctx, database.CreateRankingSummaryBackfillParams{
		ScopeAll: scopeAll, TenantID: tenantID,
		RequestedBy:          chronauth.MustAuthenticatedClaims(r.Context()).Subject,
		TargetSummaryVersion: req.TargetSummaryVersion,
		BatchSize:            req.BatchSize, MaxBatches: req.MaxBatches, DelayMs: req.DelayMS,
		PreviewTotalRuns: preview.TotalRuns, PreviewMissingRuns: preview.MissingRuns,
		PreviewStaleRuns: preview.StaleRuns, PreviewCurrentRuns: preview.CurrentRuns,
		PreviewDirtyRuns: preview.DirtyRuns,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusCreated, rankingSummaryBackfill(created))
}

func rankingSummaryBackfillScope(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool, bool) {
	raw := r.URL.Query().Get("tenant_id")
	if raw == "" {
		return uuid.Nil, true, true
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "tenant_id must be a UUID"})
		return uuid.Nil, false, false
	}
	return id, false, true
}

func rankingSummaryBackfillPreview(tenantID uuid.UUID, scopeAll bool, targetVersion int16, row database.PreviewRankingSummaryBackfillRow) chroniclesdk.AdminRankingSummaryBackfillPreview {
	preview := chroniclesdk.AdminRankingSummaryBackfillPreview{
		TargetSummaryVersion: targetVersion, TotalRuns: row.TotalRuns,
		MissingRuns: row.MissingRuns, StaleRuns: row.StaleRuns,
		CurrentRuns: row.CurrentRuns, DirtyRuns: row.DirtyRuns,
		EstimatedWALBytes: nil,
	}
	if !scopeAll {
		preview.TenantID = &tenantID
	}
	return preview
}

func rankingSummaryBackfill(row database.RankingSummaryBackfill) chroniclesdk.AdminRankingSummaryBackfill {
	result := chroniclesdk.AdminRankingSummaryBackfill{
		ID: row.ID, RequestedBy: row.RequestedBy, Status: row.Status,
		TargetSummaryVersion: row.TargetSummaryVersion, BatchSize: row.BatchSize,
		MaxBatches: row.MaxBatches, DelayMS: row.DelayMs,
		Preview: chroniclesdk.AdminRankingSummaryBackfillPreview{
			TargetSummaryVersion: row.TargetSummaryVersion, TotalRuns: row.PreviewTotalRuns,
			MissingRuns: row.PreviewMissingRuns, StaleRuns: row.PreviewStaleRuns,
			CurrentRuns: row.PreviewCurrentRuns, DirtyRuns: row.PreviewDirtyRuns,
		},
		BatchesCompleted: row.BatchesCompleted, RunsMarkedDirty: row.RunsMarkedDirty,
		CreatedAt: row.CreatedAt.Time,
	}
	if row.TenantID.Valid {
		result.TenantID = &row.TenantID.UUID
		result.Preview.TenantID = &row.TenantID.UUID
	}
	if row.EstimatedWalBytes.Valid {
		result.Preview.EstimatedWALBytes = &row.EstimatedWalBytes.Int64
	}
	if row.StartedAt.Valid {
		result.StartedAt = &row.StartedAt.Time
	}
	if row.LastProgressAt.Valid {
		result.LastProgressAt = &row.LastProgressAt.Time
	}
	if row.LastErrorAt.Valid {
		result.LastErrorAt = &row.LastErrorAt.Time
	}
	if row.CompletedAt.Valid {
		result.CompletedAt = &row.CompletedAt.Time
	}
	if row.ErrorMessage.Valid {
		result.ErrorMessage = &row.ErrorMessage.String
	}
	return result
}
