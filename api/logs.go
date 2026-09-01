package api

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/slice"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func (api *API) WoWLogGroups(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uc := chronauth.MustAuthenticatedClaims(ctx)

	var createdAfter, createdBefore pgtype.Timestamptz
	if v := r.URL.Query().Get("start"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid start parameter, expected RFC3339 timestamp",
			})
			return
		}
		createdAfter = pgtype.Timestamptz{Time: t, Valid: true}
	}
	if v := r.URL.Query().Get("end"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "Invalid end parameter, expected RFC3339 timestamp",
			})
			return
		}
		createdBefore = pgtype.Timestamptz{Time: t, Valid: true}
	}

	// By default, the realm/server/tenant fields on each parsed instance are
	// scoped by the requesting subdomain's tenant RLS — a log whose realm
	// belongs to a different tenant than the one being browsed comes back
	// with those fields blank. all_tenants=true (used by the account storage
	// page, which always lists every log the user owns regardless of which
	// tenant they're currently on) bypasses that RLS for this lookup only;
	// the query is still scoped to the caller's own logs via Owner below.
	if r.URL.Query().Get("all_tenants") == "true" {
		ctx = servicetenant.AdminBypass(ctx)
	}

	groups, err := api.Opts.Zed.GetWoWLogGroupsByOwner(ctx, database.GetWoWLogGroupsByOwnerParams{
		Owner:         uc.Subject,
		CreatedAfter:  createdAfter,
		CreatedBefore: createdBefore,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Internal server error",
				Detail:  err.Error(),
			},
			Status:  http.StatusInternalServerError,
			Wrapped: err,
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, slice.List(groups, db2sdk.WoWLogGroupRow))
}

func (api *API) WoWLogGroupByFile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	fileHash := chi.URLParam(r, "file-hash")

	// Look up the log file by hash to get the log group ID
	file, err := api.Opts.Zed.GetFileByHash(ctx, fileHash)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
			Message: "Log file not found",
			Detail:  err.Error(),
		})
		return
	}

	logID := file.WowLogID
	actor, _ := authz.ActorFromContext(ctx)
	ok, err := api.Zed.CheckOne(ctx, nil, policy.New().Raid_log(logID).CanView_User(actor))
	if !ok || err != nil {
		httpapi.Forbidden(w, err)
		return
	}

	resp, err := api.Chronicle.WoWLogGroup(ctx, logID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Internal server error",
				Detail:  err.Error(),
			},
			Status:  http.StatusInternalServerError,
			Wrapped: err,
		})
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func (api *API) WoWLogGroup(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logID := httpmw.LogID(ctx)
	actor, _ := authz.ActorFromContext(ctx)
	ok, err := api.Zed.CheckOne(ctx, nil, policy.New().Raid_log(logID).CanView_User(actor))
	if !ok || err != nil {
		httpapi.Forbidden(w, err)
		return
	}

	resp, err := api.Chronicle.WoWLogGroup(ctx, logID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Internal server error",
				Detail:  err.Error(),
			},
			Status:  http.StatusInternalServerError,
			Wrapped: err,
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func (api *API) WoWLogDeleteGroup(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logID := httpmw.LogID(ctx)
	actor, _ := authz.ActorFromContext(ctx)

	ok, err := api.Zed.CheckOne(ctx, nil, policy.New().Raid_log(logID).CanDelete_User(actor))
	if err != nil || !ok {
		httpapi.Forbidden(w, err)
		return
	}

	err = api.Chronicle.DeleteWoWLogGroup(ctx, logID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to delete log group",
				Detail:  err.Error(),
			},
			Status: http.StatusInternalServerError,
		})
	}
	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}

func (api *API) WoWLogDeleteInstance(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logID := httpmw.LogID(ctx)
	instanceID, err := uuid.Parse(chi.URLParam(r, "instance_id"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid instance ID",
			Detail:  err.Error(),
		})
		return
	}
	actor, _ := authz.ActorFromContext(ctx)

	ok, err := api.Zed.CheckOne(ctx, nil, policy.New().Raid_log(logID).CanDelete_User(actor))
	if err != nil || !ok {
		httpapi.Forbidden(w, err)
		return
	}

	err = api.Chronicle.DeleteWoWLogInstance(ctx, logID, instanceID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to delete instance",
				Detail:  err.Error(),
			},
			Status: http.StatusInternalServerError,
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}

func (api *API) WoWLogFileDownload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	fileID, err := uuid.Parse(chi.URLParam(r, "fileID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid file ID",
		})
		return
	}

	// Get file metadata first to find the log group
	file, err := api.Opts.Zed.GetLogFile(ctx, fileID)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{
			Message: "File not found",
		})
		return
	}

	actor, _ := authz.ActorFromContext(ctx)
	// Check if user can view the raid log this file belongs to
	ok, err := api.Zed.CheckOne(ctx, nil, policy.New().Raid_log(file.WowLogID).CanView_User(actor))
	if !ok || err != nil {
		httpapi.Forbidden(w, err)
		return
	}

	// Check if file is deleted from storage
	if file.StorageDeletedAt.Valid {
		httpapi.Write(ctx, w, http.StatusGone, chroniclesdk.Response{
			Message: "File has been deleted from storage",
		})
		return
	}

	// Download from storage
	contents, err := api.Chronicle.Storage.DownloadFile(ctx, chronicle.BucketRaidLogs,
		filepath.Join("logs", fileID.String()))
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to download file from storage",
				Detail:  err.Error(),
			},
			Status:  http.StatusInternalServerError,
			Wrapped: err,
		})
		return
	}

	// Set headers for file download - serve as-is (compressed if stored compressed)
	if file.ContentEncoding.Valid && file.ContentEncoding.String == "gzip" {
		w.Header().Set("Content-Type", "application/gzip")
		w.Header().Set("Content-Disposition",
			fmt.Sprintf("attachment; filename=\"combatlog-%s.txt.gz\"", file.ID.String()))
	} else {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Content-Disposition",
			fmt.Sprintf("attachment; filename=\"combatlog-%s.txt\"", file.ID.String()))
	}
	w.Header().Set("Content-Length", strconv.Itoa(len(contents)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(contents)
}
