package api

import (
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/Emyrk/chronicle/internal/services/serviceblog"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func blogError(w http.ResponseWriter, r *http.Request, err error) {
	var limited *serviceblog.RateLimited
	var status int
	switch {
	case errors.As(err, &limited):
		ratelimit.SetHeaders(w, limited.Result.Status)
		ratelimit.SetRetryAfter(w, limited.Result)
		status = http.StatusTooManyRequests
	case errors.Is(err, serviceblog.ErrInvalid):
		status = http.StatusBadRequest
	case errors.Is(err, serviceblog.ErrDisabled), errors.Is(err, serviceblog.ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, serviceblog.ErrBanned):
		status = http.StatusForbidden
	case errors.Is(err, serviceblog.ErrReserved), errors.Is(err, serviceblog.ErrConflict):
		status = http.StatusConflict
	default:
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, status, chroniclesdk.Response{Message: err.Error()})
}
func blogOwn(f serviceblog.Feedback) chroniclesdk.BlogOwnFeedback {
	return chroniclesdk.BlogOwnFeedback{ID: f.ID, Body: f.Body, Status: f.Status, Deleted: f.Deleted}
}
func (a *API) GetBlogInteractions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	user := uuid.Nil
	if claims, ok := chronauth.AuthenticatedClaims(r.Context()); ok {
		user = claims.Subject
	}
	state, err := a.blog.Read(r.Context(), chi.URLParam(r, "slug"), user)
	if err != nil {
		blogError(w, r, err)
		return
	}
	out := chroniclesdk.BlogInteractions{VotingEnabled: state.VotingEnabled, FeedbackEnabled: state.FeedbackEnabled, Enabled: state.Enabled, UpVotes: state.Votes.Up, OwnVote: state.Votes.Own, Feedback: []chroniclesdk.BlogPublicFeedback{}, FeedbackBanned: state.Banned}
	tenant := servicetenant.TenantFromContext(r.Context())
	for _, f := range state.Feedback {
		relation := "Another server"
		if tenant != nil && tenant.ID == f.TenantID {
			relation = "This server"
		}
		out.Feedback = append(out.Feedback, chroniclesdk.BlogPublicFeedback{ID: f.ID, Body: f.Body, ServerRelation: relation})
	}
	if state.Own != nil {
		own := blogOwn(*state.Own)
		out.OwnFeedback = &own
	}
	httpapi.Write(r.Context(), w, http.StatusOK, out)
}
func (a *API) PutBlogVote(w http.ResponseWriter, r *http.Request) {
	var req chroniclesdk.BlogVoteRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	err := a.blog.Vote(r.Context(), chi.URLParam(r, "slug"), chronauth.MustAuthenticatedClaims(r.Context()).Subject, req.Vote)
	if err != nil {
		blogError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusNoContent, nil)
}
func (a *API) PutBlogFeedback(w http.ResponseWriter, r *http.Request) {
	var req chroniclesdk.BlogFeedbackRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	tenant := servicetenant.TenantFromContext(r.Context())
	if tenant == nil {
		blogError(w, r, serviceblog.ErrDisabled)
		return
	}
	f, err := a.blog.Save(r.Context(), chi.URLParam(r, "slug"), chronauth.MustAuthenticatedClaims(r.Context()).Subject, tenant.ID, req.Body, req.Consent)
	if err != nil {
		blogError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, blogOwn(f))
}
func (a *API) DeleteBlogFeedback(w http.ResponseWriter, r *http.Request) {
	err := a.blog.Delete(r.Context(), chi.URLParam(r, "slug"), chronauth.MustAuthenticatedClaims(r.Context()).Subject)
	if err != nil {
		blogError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusNoContent, nil)
}
func (a *API) AdminBlogFeedback(w http.ResponseWriter, r *http.Request) {
	rows, err := a.blog.List(r.Context())
	if err != nil {
		blogError(w, r, err)
		return
	}
	out := make([]chroniclesdk.BlogAdminFeedback, 0, len(rows))
	for _, f := range rows {
		out = append(out, chroniclesdk.BlogAdminFeedback{UpdatedAt: f.UpdatedAt, ID: f.ID, PostSlug: f.PostSlug, UserID: f.UserID, TenantID: f.TenantID, Body: f.Body, Status: f.Status, Consent: f.Consent, Deleted: f.Deleted})
	}
	httpapi.Write(r.Context(), w, http.StatusOK, out)
}
func (a *API) AdminModerateBlogFeedback(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		blogError(w, r, serviceblog.ErrInvalid)
		return
	}
	var req chroniclesdk.BlogModerationRequest
	if chi.URLParam(r, "action") != "delete" && !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	if err = a.blog.Moderate(r.Context(), id, chi.URLParam(r, "action"), req.ExpectedUpdatedAt); err != nil {
		blogError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusNoContent, nil)
}
func (a *API) AdminBanBlogFeedback(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "user_id"))
	if err != nil {
		blogError(w, r, serviceblog.ErrInvalid)
		return
	}
	action := chi.URLParam(r, "action")
	if action != "ban" && action != "unban" {
		blogError(w, r, serviceblog.ErrInvalid)
		return
	}
	if err = a.blog.Ban(r.Context(), id, action == "ban"); err != nil {
		blogError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusNoContent, nil)
}

func (a *API) AdminBlogVotes(w http.ResponseWriter, r *http.Request) {
	votes, err := a.blog.AdminVotes(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		blogError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.BlogAdminVotes{UpVotes: votes.Up, DownVotes: votes.Down})
}
