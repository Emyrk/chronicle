package api

import (
	"errors"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

func leaderboardOperationSDK(o database.LeaderboardOperation) chroniclesdk.LeaderboardOperation {
	out := chroniclesdk.LeaderboardOperation{MissingDates: o.MissingDates, DateBasis: "run_end_time", ID: o.ID, TenantID: o.TenantID, RequestedBy: o.RequestedBy, Purpose: o.Purpose, Scope: o.Scope, BeforeDate: o.BeforeDate.Time.Format("2006-01-02"), Cutoff: o.Cutoff.Time, State: o.State, Phase: o.Phase, Discovered: o.Discovered, DiscoveryComplete: o.DiscoveryComplete, StartedAt: o.StartedAt.Time, LastProgressAt: o.LastProgressAt.Time, RetryCount: o.RetryCount, LastError: o.LastError}
	if o.RunID.Valid {
		out.RunID = &o.RunID.UUID
	}
	if o.CompletedAt.Valid {
		out.CompletedAt = &o.CompletedAt.Time
	}
	return out
}

func parseLeaderboardOperation(req chroniclesdk.CreateLeaderboardOperationRequest, now time.Time) (database.CreateLeaderboardOperationParams, error) {
	p := database.CreateLeaderboardOperationParams{TenantID: req.TenantID, Purpose: req.Purpose, Scope: req.Scope}
	if req.TenantID == uuid.Nil {
		return p, errors.New("tenant_id is required")
	}
	if req.Purpose != "bootstrap" && req.Purpose != "repair" {
		return p, errors.New("purpose must be bootstrap or repair")
	}
	if req.Scope != "tenant" && req.Scope != "run" {
		return p, errors.New("scope must be tenant or run")
	}
	if (req.Scope == "run") != (req.RunID != nil) {
		return p, errors.New("run_id required only for run scope")
	}
	if req.RunID != nil {
		if *req.RunID == uuid.Nil {
			return p, errors.New("invalid run_id")
		}
		p.RunID = uuid.NullUUID{UUID: *req.RunID, Valid: true}
	}
	today := now.UTC().Truncate(24 * time.Hour)
	before := today
	if req.BeforeDate != "" {
		var err error
		before, err = time.Parse("2006-01-02", req.BeforeDate)
		if err != nil {
			return p, errors.New("before_date must be YYYY-MM-DD (exclusive UTC)")
		}
	}
	if before.After(today) {
		return p, errors.New("before_date cannot be after today UTC")
	}
	p.BeforeDate = pgtype.Date{Time: before, Valid: true}
	return p, nil
}

func (api *API) AdminCreateLeaderboardOperation(w http.ResponseWriter, r *http.Request) {
	var req chroniclesdk.CreateLeaderboardOperationRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	p, err := parseLeaderboardOperation(req, time.Now())
	if err != nil {
		httpapi.Write(r.Context(), w, 400, chroniclesdk.Response{Message: err.Error()})
		return
	}
	p.RequestedBy = chronauth.MustAuthenticatedClaims(r.Context()).Subject
	ctx := servicetenant.WithTenantID(r.Context(), p.TenantID)
	o, err := database.New(api.Opts.Pool).CreateLeaderboardOperation(ctx, p)
	var pgerr *pgconn.PgError
	if errors.As(err, &pgerr) && pgerr.Code == "23505" {
		httpapi.Write(ctx, w, 409, chroniclesdk.Response{Message: "Tenant already has an unfinished leaderboard operation."})
		return
	}
	if errors.As(err, &pgerr) && pgerr.Code == "23503" {
		httpapi.Write(ctx, w, 400, chroniclesdk.Response{Message: "Unknown tenant."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, 202, leaderboardOperationSDK(o))
}

func (api *API) AdminListLeaderboardOperations(w http.ResponseWriter, r *http.Request) {
	tenant, err := uuid.Parse(r.URL.Query().Get("tenant_id"))
	if err != nil || tenant == uuid.Nil {
		httpapi.Write(r.Context(), w, 400, chroniclesdk.Response{Message: "tenant_id is required"})
		return
	}
	ctx := servicetenant.WithTenantID(r.Context(), tenant)
	rows, err := database.New(api.Opts.Pool).ListLeaderboardOperations(ctx, tenant)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	out := chroniclesdk.LeaderboardOperationList{Operations: []chroniclesdk.LeaderboardOperation{}}
	for _, row := range rows {
		out.Operations = append(out.Operations, leaderboardOperationSDK(row))
	}
	httpapi.Write(ctx, w, 200, out)
}

func (api *API) AdminLeaderboardOperation(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "operationID"))
	if err != nil {
		httpapi.Write(r.Context(), w, 400, chroniclesdk.Response{Message: "Invalid operation ID"})
		return
	}
	// Admin permission is enforced by route middleware. Resolve identity before switching tenant.
	db := database.New(api.Opts.Pool)
	o, err := db.LookupLeaderboardOperation(servicetenant.AdminBypass(r.Context()), id)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, 404, chroniclesdk.Response{Message: "Operation not found"})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	ctx := servicetenant.WithTenantID(r.Context(), o.TenantID)
	switch chi.URLParam(r, "action") {
	case "pause":
		if o.State != "completed" {
			o, err = db.PauseLeaderboardOperation(ctx, database.PauseLeaderboardOperationParams{ID: id, TenantID: o.TenantID})
		}
	case "resume":
		if o.State == "paused" {
			o, err = db.ResumeLeaderboardOperation(ctx, database.ResumeLeaderboardOperationParams{ID: id, TenantID: o.TenantID})
		}
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	out := leaderboardOperationSDK(o)
	backlog, err := db.LeaderboardOperationBacklog(ctx, o.TenantID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	out.Backlog = &chroniclesdk.LeaderboardOperationBacklog{D1Pending: backlog.D1Pending, D2Pending: backlog.D2Pending, PendingRetries: backlog.PendingRetries}
	if backlog.OldestPendingAt.Valid {
		out.Backlog.OldestPendingAt = &backlog.OldestPendingAt.Time
	}
	httpapi.Write(ctx, w, 200, out)
}

func operationMaintenance(op database.LeaderboardOperation) *chroniclesdk.LeaderboardMaintenance {
	kind, message := "repair_in_progress", "Leaderboard repair is in progress; results may reflect mixed calculation versions."
	if op.Purpose == "bootstrap" {
		kind, message = "partial_coverage", "Historical leaderboard coverage is incomplete while backfill is in progress."
	}
	message += " Runs completed before " + op.BeforeDate.Time.Format("2006-01-02") + " 00:00 UTC."
	if op.MissingDates > 0 {
		message += " Runs without completion dates are excluded; use specific-run repair."
	}
	return &chroniclesdk.LeaderboardMaintenance{Kind: kind, State: op.State, Message: message, BeforeDate: op.BeforeDate.Time.Format("2006-01-02"), Cutoff: op.Cutoff.Time, MissingDates: op.MissingDates, DateBasis: "run_end_time"}
}

func (api *API) LeaderboardMaintenance(w http.ResponseWriter, r *http.Request) {
	tenant := servicetenant.TenantFromContext(r.Context())
	if tenant == nil {
		httpapi.Write(r.Context(), w, 400, chroniclesdk.Response{Message: "Open a tenant site to view leaderboard maintenance."})
		return
	}
	rows, err := database.New(api.Opts.Pool).ActiveLeaderboardOperation(r.Context(), tenant.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	out := chroniclesdk.LeaderboardMaintenanceResponse{}
	if len(rows) > 0 {
		out.Maintenance = operationMaintenance(rows[0])
	}
	httpapi.Write(r.Context(), w, 200, out)
}
