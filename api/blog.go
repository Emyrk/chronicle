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
	case errors.Is(err, serviceblog.ErrBanned), errors.Is(err, serviceblog.ErrForbidden):
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
	return chroniclesdk.BlogOwnFeedback{ID: f.ID, Body: f.Body, Status: f.Status, Deleted: f.Deleted, Consent: f.Consent}
}
func (a *API) GetBlogInteractions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	user := uuid.Nil
	ownVote, ownFeedback := false, false
	if claims, ok := chronauth.AuthenticatedClaims(r.Context()); ok {
		ownVote = a.canReadOwnBlog(r, "read_own_blog_vote")
		ownFeedback = a.canReadOwnBlog(r, "read_own_blog_feedback")
		user = claims.Subject
	}
	state, err := a.blog.ReadWithAccess(r.Context(), chi.URLParam(r, "slug"), user, ownVote, ownFeedback)
	if err != nil {
		blogError(w, r, err)
		return
	}
	out := chroniclesdk.BlogInteractions{VotingEnabled: state.VotingEnabled, FeedbackEnabled: state.FeedbackEnabled, Enabled: state.Enabled, UpVotes: state.Votes.Up, Feedback: []chroniclesdk.BlogPublicFeedback{}}
	if ownVote {
		out.OwnVote = &state.Votes.Own
	}
	if ownFeedback {
		out.FeedbackBanned = &state.Banned
	}
	tenant := servicetenant.TenantFromContext(r.Context())
	for _, f := range state.Feedback {
		relation := "Another server"
		if tenant != nil && tenant.ID != uuid.Nil && f.TenantID != uuid.Nil && tenant.ID == f.TenantID {
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

// ListBlogInteractionSummaries returns public counts for the blog index.
func (a *API) ListBlogInteractionSummaries(w http.ResponseWriter, r *http.Request) {
	summaries, err := a.blog.Summaries(r.Context())
	if err != nil {
		blogError(w, r, err)
		return
	}
	out := make([]chroniclesdk.BlogInteractionSummary, 0, len(summaries))
	for _, s := range summaries {
		out = append(out, chroniclesdk.BlogInteractionSummary{Slug: s.Slug, UpVotes: s.UpVotes, PublicFeedback: s.PublicFeedback})
	}
	w.Header().Set("Cache-Control", "private, max-age=60")
	httpapi.Write(r.Context(), w, http.StatusOK, out)
}
func (a *API) PutBlogVote(w http.ResponseWriter, r *http.Request) {
	if !a.requireBlogPermission(w, r, "vote_blog") {
		return
	}
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
	if !a.requireBlogPermission(w, r, "submit_blog_feedback") {
		return
	}
	var req chroniclesdk.BlogFeedbackRequest
	if !httpapi.Read(r.Context(), w, r, &req) {
		return
	}
	tenant := servicetenant.TenantFromContext(r.Context())
	tenantID := uuid.Nil
	if tenant != nil {
		tenantID = tenant.ID
	}
	f, err := a.blog.Save(r.Context(), chi.URLParam(r, "slug"), chronauth.MustAuthenticatedClaims(r.Context()).Subject, tenantID, req.Body, req.Consent)
	if err != nil {
		blogError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, blogOwn(f))
}
func (a *API) DeleteBlogFeedback(w http.ResponseWriter, r *http.Request) {
	if !a.requireBlogPermission(w, r, "withdraw_blog_feedback") {
		return
	}
	err := a.blog.Delete(r.Context(), chi.URLParam(r, "slug"), chronauth.MustAuthenticatedClaims(r.Context()).Subject)
	if err != nil {
		blogError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusNoContent, nil)
}
func (a *API) AdminBlogFeedback(w http.ResponseWriter, r *http.Request) {
	if !a.requireBlogPermission(w, r, "list_blog_feedback") {
		return
	}
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
	action := chi.URLParam(r, "action")
	if action != "approve" && action != "reject" && action != "delete" {
		httpapi.Forbidden(w, nil)
		return
	}
	if !a.requireBlogPermission(w, r, action) {
		return
	}
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
	action := chi.URLParam(r, "action")
	if action != "ban" && action != "unban" {
		httpapi.Forbidden(w, nil)
		return
	}
	if !a.requireBlogPermission(w, r, action) {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "user_id"))
	if err != nil {
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
	if !a.requireBlogPermission(w, r, "read_blog_vote_totals") {
		return
	}
	votes, err := a.blog.AdminVotes(r.Context(), chi.URLParam(r, "slug"))
	if err != nil {
		blogError(w, r, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.BlogAdminVotes{UpVotes: votes.Up, DownVotes: votes.Down})
}
