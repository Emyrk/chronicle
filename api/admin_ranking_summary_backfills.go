package api

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var errCrossTenantRankingSummaryBackfill = errors.New("ranking summary backfill scope contains a duplicate group spanning multiple tenants")

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
	var preview database.PreviewRankingSummaryBackfillRow
	var latest *chroniclesdk.AdminRankingSummaryBackfill
	err := store.InTx(ctx, func(tx database.Store) error {
		if err := tx.SetLocalRankingSummaryBackfillStatementTimeout(ctx); err != nil {
			return err
		}
		var err error
		preview, err = tx.PreviewRankingSummaryBackfill(ctx, database.PreviewRankingSummaryBackfillParams{
			ScopeAll: scopeAll, TenantID: tenantID, TargetSummaryVersion: targetVersion,
		})
		if err != nil {
			return err
		}
		if preview.CrossTenantDuplicateRuns > 0 {
			return errCrossTenantRankingSummaryBackfill
		}
		row, err := tx.LatestRankingSummaryBackfill(ctx, database.LatestRankingSummaryBackfillParams{
			ScopeAll: scopeAll, TenantID: tenantID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		converted := rankingSummaryBackfill(row)
		latest = &converted
		return nil
	}, nil)
	if errors.Is(err, errCrossTenantRankingSummaryBackfill) {
		rankingSummaryBackfillConflict(w, r)
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.AdminRankingSummaryBackfillsResponse{
		Preview: rankingSummaryBackfillPreview(tenantID, scopeAll, targetVersion, preview),
		Latest:  latest,
	})
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
	var created database.RankingSummaryBackfill
	err := store.InTx(ctx, func(tx database.Store) error {
		if err := tx.SetLocalRankingSummaryBackfillStatementTimeout(ctx); err != nil {
			return err
		}
		preview, err := tx.PreviewRankingSummaryBackfill(ctx, database.PreviewRankingSummaryBackfillParams{
			ScopeAll: scopeAll, TenantID: tenantID, TargetSummaryVersion: req.TargetSummaryVersion,
		})
		if err != nil {
			return err
		}
		if preview.CrossTenantDuplicateRuns > 0 {
			return errCrossTenantRankingSummaryBackfill
		}
		created, err = tx.CreateRankingSummaryBackfill(ctx, database.CreateRankingSummaryBackfillParams{
			ScopeAll: scopeAll, TenantID: tenantID,
			RequestedBy:          chronauth.MustAuthenticatedClaims(r.Context()).Subject,
			TargetSummaryVersion: req.TargetSummaryVersion,
			BatchSize:            req.BatchSize, MaxBatches: req.MaxBatches, DelayMs: req.DelayMS,
			PreviewTotalRuns: preview.TotalRuns, PreviewSourceRows: preview.SourceRows,
			PreviewMissingRuns: preview.MissingRuns, PreviewStaleRuns: preview.StaleRuns,
			PreviewCurrentRuns: preview.CurrentRuns, PreviewDirtyRuns: preview.DirtyRuns,
			EstimatedWalBytes: preview.EstimatedWalBytes,
		})
		return err
	}, nil)
	if errors.Is(err, errCrossTenantRankingSummaryBackfill) {
		rankingSummaryBackfillConflict(w, r)
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusCreated, rankingSummaryBackfill(created))
}

// AdminControlRankingSummaryBackfill pauses, resumes, or retries a persisted backfill.
func (api *API) AdminControlRankingSummaryBackfill(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "backfillID"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "backfillID must be a UUID"})
		return
	}
	ctx := servicetenant.AdminBypass(r.Context())
	store := database.New(api.Opts.Pool)
	var row database.RankingSummaryBackfill
	switch chi.URLParam(r, "action") {
	case "pause":
		row, err = store.PauseRankingSummaryBackfill(ctx, id)
	case "resume", "retry":
		row, err = store.StartRankingSummaryBackfill(ctx, id)
		if err == nil {
			_, err = api.Queues.Insert(ctx, rankingargs.ArgsBackfillRankingRunSummaries{BackfillID: id}, nil)
		}
	default:
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "action must be pause, resume, or retry"})
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "backfill is not in a state that supports this action"})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusAccepted, rankingSummaryBackfill(row))
}

func rankingSummaryBackfillConflict(w http.ResponseWriter, r *http.Request) {
	httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{
		Message: "ranking summary backfill scope contains a duplicate group spanning multiple tenants",
	})
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
		TargetSummaryVersion: targetVersion, TotalRuns: row.TotalRuns, SourceRows: row.SourceRows,
		MissingRuns: row.MissingRuns, StaleRuns: row.StaleRuns,
		CurrentRuns: row.CurrentRuns, DirtyRuns: row.DirtyRuns,
		EstimatedWALBytes: &row.EstimatedWalBytes,
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
			SourceRows: row.PreviewSourceRows, MissingRuns: row.PreviewMissingRuns,
			StaleRuns: row.PreviewStaleRuns, CurrentRuns: row.PreviewCurrentRuns,
			DirtyRuns: row.PreviewDirtyRuns, EstimatedWALBytes: &row.EstimatedWalBytes,
		},
		CursorRunID: row.CursorRunID, BatchesCompleted: row.BatchesCompleted,
		RunsMarkedDirty: row.RunsMarkedDirty,
		CreatedAt:       row.CreatedAt.Time,
	}
	if row.TenantID.Valid {
		result.TenantID = &row.TenantID.UUID
		result.Preview.TenantID = &row.TenantID.UUID
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
