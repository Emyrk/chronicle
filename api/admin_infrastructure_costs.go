package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/infrastructurecosts"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func boundedOffset(r *http.Request, defaultLimit, maxLimit int32) (int32, int32, error) {
	limit, offset := int64(defaultLimit), int64(0)
	var err error
	if v := r.URL.Query().Get("limit"); v != "" {
		limit, err = strconv.ParseInt(v, 10, 32)
		if err != nil {
			return 0, 0, err
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		offset, err = strconv.ParseInt(v, 10, 32)
		if err != nil {
			return 0, 0, err
		}
	}
	if limit < 1 || limit > int64(maxLimit) || offset < 0 {
		return 0, 0, errors.New("invalid limit or offset")
	}
	return int32(limit), int32(offset), nil
}

func (api *API) AdminListInfrastructureCosts(w http.ResponseWriter, r *http.Request) {
	limit, offset, err := boundedOffset(r, 50, 200)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid pagination."})
		return
	}
	store := database.New(api.Opts.Pool)
	rows, err := store.ListInfrastructureCostReports(r.Context(), database.ListInfrastructureCostReportsParams{OffsetCount: offset, LimitCount: limit})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	total, err := store.CountInfrastructureCostReports(r.Context())
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	reports := make([]chroniclesdk.InfrastructureCostReportListItem, 0, len(rows))
	for _, row := range rows {
		var detail chroniclesdk.InfrastructureCostReport
		if err := json.Unmarshal(row.Report, &detail); err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		reports = append(reports, chroniclesdk.InfrastructureCostReportListItem{ID: row.ID, PeriodStart: row.PeriodStart.Time, PeriodEnd: row.PeriodEnd.Time, Revision: row.Revision, Status: row.Status, GeneratedAt: row.CreatedAt.Time, StorageAsOf: row.StorageAsOf.Time, TotalCostMicrodollars: row.TotalCostMicrodollars, PreviousTotalCostMicrodollars: detail.PreviousTotalCostMicrodollars, ActiveUploaderCount: row.ActiveUploaderCount, StorageOwnerCount: row.StorageOwnerCount, WarningCount: row.WarningCount})
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.ListInfrastructureCostReportsResponse{Reports: reports, Total: total, Limit: limit, Offset: offset})
}

func (api *API) AdminGetInfrastructureCost(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "reportID"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid report ID."})
		return
	}
	row, err := database.New(api.Opts.Pool).GetInfrastructureCostReport(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Infrastructure cost report not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	var report chroniclesdk.InfrastructureCostReport
	if err := json.Unmarshal(row.Report, &report); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, report)
}

func (api *API) AdminListInfrastructureCostUsers(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "reportID"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid report ID."})
		return
	}
	limit, offset, err := boundedOffset(r, 100, 500)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid pagination."})
		return
	}
	store := database.New(api.Opts.Pool)
	if _, err := store.GetInfrastructureCostReport(r.Context(), id); errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Infrastructure cost report not found."})
		return
	} else if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	rows, err := store.ListInfrastructureCostReportUsers(r.Context(), database.ListInfrastructureCostReportUsersParams{ReportID: id, OffsetCount: offset, LimitCount: limit})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	total, err := store.CountInfrastructureCostReportUsers(r.Context(), id)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	users := make([]chroniclesdk.InfrastructureCostReportUser, 0, len(rows))
	for _, u := range rows {
		users = append(users, chroniclesdk.InfrastructureCostReportUser{
			UserID: u.UserID, UsernameSnapshot: u.UsernameSnapshot, ActiveUploader: u.ActiveUploader,
			UploadedFiles: u.UploadedFiles, MonthlyParsedBytes: u.MonthlyParsedBytes, CurrentParsedBytes: u.CurrentParsedBytes,
			SharedCostMicrodollars: u.SharedCostMicrodollars, ActivityCostMicrodollars: u.ActivityCostMicrodollars,
			StorageCostMicrodollars: u.StorageCostMicrodollars, TotalCostMicrodollars: u.TotalCostMicrodollars,
		})
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.ListInfrastructureCostReportUsersResponse{Users: users, Total: total, Limit: limit, Offset: offset})
}

func (api *API) AdminGenerateInfrastructureCost(w http.ResponseWriter, r *http.Request) {
	if api.Opts.InfrastructureCosts == nil || api.Queues == nil {
		httpapi.Write(r.Context(), w, http.StatusServiceUnavailable, chroniclesdk.Response{Message: "Infrastructure cost reports are unavailable."})
		return
	}
	var req chroniclesdk.GenerateInfrastructureCostReportRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	var start, end time.Time
	if req.PeriodStart != nil {
		start = *req.PeriodStart
	}
	if req.PeriodEnd != nil {
		end = *req.PeriodEnd
	}
	start, end, err := api.Opts.InfrastructureCosts.ResolvePeriod(r.Context(), start, end)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid report period.", Detail: err.Error()})
		return
	}
	result, err := api.Queues.Insert(r.Context(), infrastructurecosts.ArgsGenerate{PeriodStart: start, PeriodEnd: end, Force: req.Force}, nil)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusAccepted, chroniclesdk.GenerateInfrastructureCostReportResponse{JobID: result.Job.ID, PeriodStart: start, PeriodEnd: end, Force: req.Force, Duplicate: result.UniqueSkippedAsDuplicate})
}
