package api

import (
	"context"
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/serviceblog"
	"github.com/authzed/gochugaru/rel"
)

// blogPermission is a closed allowlist. Unknown actions never become arbitrary
// SpiceDB permission names or reach a mutation handler.
func blogPermission(actor *policy.ObjUser, action string) (rel.Relationship, bool) {
	c := policy.New().GlobalChronicle()
	switch action {
	case "vote_blog":
		return c.CanVote_blog_User(actor), true
	case "read_own_blog_vote":
		return c.CanRead_own_blog_vote_User(actor), true
	case "read_own_blog_feedback":
		return c.CanRead_own_blog_feedback_User(actor), true
	case "submit_blog_feedback":
		return c.CanSubmit_blog_feedback_User(actor), true
	case "create_blog_feedback":
		return c.CanCreate_blog_feedback_User(actor), true
	case "edit_blog_feedback":
		return c.CanEdit_blog_feedback_User(actor), true
	case "withdraw_blog_feedback":
		return c.CanWithdraw_blog_feedback_User(actor), true
	case "list_blog_feedback":
		return c.CanList_blog_feedback_User(actor), true
	case "read_blog_vote_totals":
		return c.CanRead_blog_vote_totals_User(actor), true
	case "approve":
		return c.CanApprove_blog_feedback_User(actor), true
	case "reject":
		return c.CanReject_blog_feedback_User(actor), true
	case "delete":
		return c.CanDelete_blog_feedback_User(actor), true
	case "ban":
		return c.CanBan_blog_feedback_User(actor), true
	case "unban":
		return c.CanUnban_blog_feedback_User(actor), true
	default:
		return rel.Relationship{}, false
	}
}
func checkBlogPermission(ctx context.Context, actor *policy.ObjUser, action string, check func(context.Context, rel.Relationship) (bool, error)) error {
	if actor == nil {
		return serviceblog.ErrForbidden
	}
	permission, ok := blogPermission(actor, action)
	if !ok {
		return serviceblog.ErrForbidden
	}
	if check == nil {
		return errors.New("blog authorization unavailable")
	}
	allowed, err := check(ctx, permission)
	if err != nil {
		return err
	}
	if !allowed {
		return serviceblog.ErrForbidden
	}
	return nil
}
func (a *API) requireBlogPermission(w http.ResponseWriter, r *http.Request, action string) bool {
	actor, _ := authz.ActorFromContext(r.Context())
	var check func(context.Context, rel.Relationship) (bool, error)
	if a.Zed != nil {
		check = func(ctx context.Context, p rel.Relationship) (bool, error) { return a.Zed.CheckOne(ctx, nil, p) }
	}
	err := checkBlogPermission(r.Context(), actor, action, check)
	if err == nil {
		return true
	}
	if errors.Is(err, serviceblog.ErrForbidden) {
		httpapi.Forbidden(w, nil)
	} else {
		httpapi.InternalServerError(w, err)
	}
	return false
}

// Denied or unavailable own-state authorization must not take public content away.
func (a *API) canReadOwnBlog(r *http.Request, action string) bool {
	actor, ok := authz.ActorFromContext(r.Context())
	if !ok || a.Zed == nil {
		return false
	}
	return checkBlogPermission(r.Context(), actor, action, func(ctx context.Context, p rel.Relationship) (bool, error) { return a.Zed.CheckOne(ctx, nil, p) }) == nil
}
