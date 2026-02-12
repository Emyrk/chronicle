package api

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/slice"
	"github.com/go-chi/chi/v5"
)

func (api *API) WoWLogGroups(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	uc := chronauth.MustAuthenticatedClaims(ctx)

	groups, err := api.Opts.DB.GetWoWLogGroupsByOwner(ctx, uc.Subject)
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
	file, err := api.Opts.DB.GetFileByHash(ctx, fileHash)
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
