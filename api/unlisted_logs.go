package api

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
)

func (api *API) MarkLogUnlisted(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logGroupID := httpmw.LogID(ctx)

	var req chroniclesdk.MarkLogUnlistedRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	if !req.Unlisted {
		httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{
			Message: "Unlisted logs cannot be made public.",
		})
		return
	}

	actor, _ := authz.ActorFromContext(ctx)
	allowed, err := api.Zed.CheckOne(ctx, nil, policy.New().Raid_log(logGroupID).CanMark_unlisted_User(actor))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !allowed {
		httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
			Message: "You do not have permission to mark this log unlisted.",
		})
		return
	}

	current, err := api.Zed.GetWoWLogGroupUnlisted(ctx, logGroupID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !current {
		if _, err := api.Zed.MarkWoWLogGroupUnlisted(ctx, logGroupID); err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
	}

	// Intrinsic metrics remain persisted. Idempotent retries rerun reconciliation
	// so a prior partial failure can still be repaired.
	if err := api.Chronicle.ReconcileUnlistedLogGroup(ctx, logGroupID); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	if current {
		httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{Message: "Log is already unlisted."})
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{Message: "Log is now unlisted."})
}
