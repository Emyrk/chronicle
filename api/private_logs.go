package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/api/shortcode"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const privateLogShareCodeLength = 24

func (api *API) canManagePrivateLogAccess(r *http.Request, logGroupID uuid.UUID) (bool, error) {
	actor, ok := authz.ActorFromContext(r.Context())
	if !ok {
		return false, nil
	}
	return api.Zed.CheckOne(r.Context(), nil, policy.New().Raid_log(logGroupID).CanManage_access_User(actor))
}

func privateLogAccessRequest(row database.PrivateLogAccessRequest, requesterName string) chroniclesdk.PrivateLogAccessRequest {
	out := chroniclesdk.PrivateLogAccessRequest{
		ID:            row.ID,
		LogGroupID:    row.LogGroupID,
		RequesterID:   row.RequesterID,
		RequesterName: requesterName,
		Status:        row.Status,
		CreatedAt:     row.CreatedAt.Time,
		UpdatedAt:     row.UpdatedAt.Time,
	}
	if row.DecidedBy.Valid {
		out.DecidedBy = &row.DecidedBy.UUID
	}
	if row.DecidedAt.Valid {
		out.DecidedAt = &row.DecidedAt.Time
	}
	return out
}

func (api *API) UpdatePrivateLogVisibility(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logGroupID := httpmw.LogID(ctx)

	var req chroniclesdk.UpdateLogPrivacyRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}

	actor, _ := authz.ActorFromContext(ctx)
	permission := policy.New().Raid_log(logGroupID).CanMark_public_User(actor)
	visibility := "public"
	if req.Private {
		permission = policy.New().Raid_log(logGroupID).CanMark_private_User(actor)
		visibility = "private"
	}
	allowed, err := api.Zed.CheckOne(ctx, nil, permission)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !allowed {
		httpapi.Write(ctx, w, http.StatusForbidden, chroniclesdk.Response{
			Message: "You do not have permission to mark this log " + visibility + ".",
		})
		return
	}

	current, err := api.Zed.GetWoWLogGroupPrivacy(ctx, logGroupID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	alreadyRequestedVisibility := current == req.Private
	if !alreadyRequestedVisibility {
		_, err = api.Zed.UpdateWoWLogGroupPrivacy(ctx, database.UpdateWoWLogGroupPrivacyParams{
			ID:      logGroupID,
			Private: req.Private,
		})
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
	}

	// Intrinsic metrics are persisted for every log. Reconcile only the shared
	// duplicate, ranking, and cohort state when visibility changes (or when an
	// idempotent retry repairs a previous partial failure).
	if err := api.Chronicle.ReconcileLogGroupVisibility(ctx, logGroupID, !req.Private); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	if alreadyRequestedVisibility {
		httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{Message: "Log is already " + visibility + "."})
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{Message: "Log is now " + visibility + "."})
}

func (api *API) CreatePrivateLogShareLink(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logGroupID := httpmw.LogID(ctx)
	canManage, err := api.canManagePrivateLogAccess(r, logGroupID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !canManage {
		httpapi.Forbidden(w, nil)
		return
	}
	private, err := api.Zed.GetWoWLogGroupPrivacy(ctx, logGroupID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !private {
		httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{Message: "share links are only needed for private logs"})
		return
	}

	claims := chronauth.MustAuthenticatedClaims(ctx)
	var link database.PrivateLogShareLink
	for range 10 {
		code, genErr := shortcode.RandomBase62(privateLogShareCodeLength)
		if genErr != nil {
			httpapi.InternalServerError(w, genErr)
			return
		}
		link, err = api.Zed.CreatePrivateLogShareLink(ctx, database.CreatePrivateLogShareLinkParams{
			ID: uuid.New(), LogGroupID: logGroupID, Code: code, CreatedBy: claims.Subject,
		})
		if err == nil {
			break
		}
		if !isUniqueViolation(err) {
			httpapi.InternalServerError(w, err)
			return
		}
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, chroniclesdk.PrivateLogShareLink{
		ID: link.ID, LogGroupID: link.LogGroupID, Code: link.Code,
		URL: requestOrigin(r) + "/private-log-shares/" + link.Code, CreatedAt: link.CreatedAt.Time,
	})
}

func (api *API) RevokePrivateLogShareLink(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logGroupID := httpmw.LogID(ctx)
	canManage, err := api.canManagePrivateLogAccess(r, logGroupID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !canManage {
		httpapi.Forbidden(w, nil)
		return
	}
	linkID, err := uuid.Parse(chi.URLParam(r, "linkID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid share link ID"})
		return
	}
	count, err := api.Zed.RevokePrivateLogShareLink(ctx, database.RevokePrivateLogShareLinkParams{ID: linkID, LogGroupID: logGroupID})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if count == 0 {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "share link not found"})
		return
	}
	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}

func (api *API) ResolvePrivateLogShareLink(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	code := strings.TrimSpace(chi.URLParam(r, "code"))
	link, err := api.Zed.GetActivePrivateLogShareLinkByCode(ctx, code)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "share link not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}

	response := chroniclesdk.PrivateLogShareResolution{
		LogGroupID: link.PrivateLogShareLink.LogGroupID,
		OwnerName:  link.OwnerName,
		Private:    link.Private,
	}
	if claims, ok := chronauth.AuthenticatedClaims(ctx); ok {
		actor, _ := authz.ActorFromContext(ctx)
		canView, checkErr := api.Zed.CheckOne(ctx, nil, policy.New().Raid_log(link.PrivateLogShareLink.LogGroupID).CanView_User(actor))
		if checkErr != nil {
			httpapi.InternalServerError(w, checkErr)
			return
		}
		if canView {
			if claims.Subject == link.Owner {
				response.AccessStatus = "owner"
			} else {
				response.AccessStatus = "approved"
			}
		} else if request, requestErr := api.Zed.GetPrivateLogAccessRequestForUser(ctx, database.GetPrivateLogAccessRequestForUserParams{
			LogGroupID: link.PrivateLogShareLink.LogGroupID, RequesterID: claims.Subject,
		}); requestErr == nil {
			response.AccessStatus = request.Status
		} else if !errors.Is(requestErr, pgx.ErrNoRows) {
			httpapi.InternalServerError(w, requestErr)
			return
		}
	}
	httpapi.Write(ctx, w, http.StatusOK, response)
}

func (api *API) RequestPrivateLogAccess(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	code := strings.TrimSpace(chi.URLParam(r, "code"))
	link, err := api.Zed.GetActivePrivateLogShareLinkByCode(ctx, code)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "share link not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}
	if !link.Private {
		httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{Message: "log is public"})
		return
	}
	actor, _ := authz.ActorFromContext(ctx)
	canView, err := api.Zed.CheckOne(ctx, nil, policy.New().Raid_log(link.PrivateLogShareLink.LogGroupID).CanView_User(actor))
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if canView {
		httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{Message: "you already have access to this log"})
		return
	}

	request, err := api.Zed.UpsertPrivateLogAccessRequest(ctx, database.UpsertPrivateLogAccessRequestParams{
		ID: uuid.New(), LogGroupID: link.PrivateLogShareLink.LogGroupID,
		ShareLinkID: link.PrivateLogShareLink.ID, RequesterID: claims.Subject,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusCreated, privateLogAccessRequest(request, ""))
}

func (api *API) ListPrivateLogAccessRequests(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	logGroupID := httpmw.LogID(ctx)
	canManage, err := api.canManagePrivateLogAccess(r, logGroupID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !canManage {
		httpapi.Forbidden(w, nil)
		return
	}
	rows, err := api.Zed.ListPrivateLogAccessRequests(ctx, logGroupID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	out := make([]chroniclesdk.PrivateLogAccessRequest, 0, len(rows))
	for _, row := range rows {
		out = append(out, privateLogAccessRequest(row.PrivateLogAccessRequest, row.RequesterName))
	}
	httpapi.Write(ctx, w, http.StatusOK, out)
}

func (api *API) privateLogAccessDecision(w http.ResponseWriter, r *http.Request, decision string) {
	ctx := r.Context()
	logGroupID := httpmw.LogID(ctx)
	canManage, err := api.canManagePrivateLogAccess(r, logGroupID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !canManage {
		httpapi.Forbidden(w, nil)
		return
	}
	requestID, err := uuid.Parse(chi.URLParam(r, "requestID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid access request ID"})
		return
	}
	claims := chronauth.MustAuthenticatedClaims(ctx)
	decidedBy := uuid.NullUUID{UUID: claims.Subject, Valid: true}

	var request database.PrivateLogAccessRequest
	switch decision {
	case "approve":
		err = api.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
			request, err = tx.ApprovePrivateLogAccessRequest(ctx, database.ApprovePrivateLogAccessRequestParams{
				ID: requestID, LogGroupID: logGroupID, DecidedBy: decidedBy,
			})
			return err
		}, nil)
	case "deny":
		request, err = api.Zed.DenyPrivateLogAccessRequest(ctx, database.DenyPrivateLogAccessRequestParams{
			ID: requestID, LogGroupID: logGroupID, DecidedBy: decidedBy,
		})
	case "revoke":
		err = api.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
			request, err = tx.RevokePrivateLogAccessRequest(ctx, database.RevokePrivateLogAccessRequestParams{
				ID: requestID, LogGroupID: logGroupID, DecidedBy: decidedBy,
			})
			return err
		}, nil)
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "access request not found"})
			return
		}
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, privateLogAccessRequest(request, ""))
}

func (api *API) ApprovePrivateLogAccessRequest(w http.ResponseWriter, r *http.Request) {
	api.privateLogAccessDecision(w, r, "approve")
}

func (api *API) DenyPrivateLogAccessRequest(w http.ResponseWriter, r *http.Request) {
	api.privateLogAccessDecision(w, r, "deny")
}

func (api *API) RevokePrivateLogAccessRequest(w http.ResponseWriter, r *http.Request) {
	api.privateLogAccessDecision(w, r, "revoke")
}
