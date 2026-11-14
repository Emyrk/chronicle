package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/serviceblog"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/authzed/gochugaru/rel"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestBlogPermissionMappingAndFailure(t *testing.T) {
	t.Parallel()
	actor := policy.New().User(uuid.New())
	actions := map[string]string{
		"vote_blog": "vote_blog", "read_own_blog_vote": "read_own_blog_vote", "read_own_blog_feedback": "read_own_blog_feedback",
		"submit_blog_feedback": "submit_blog_feedback", "create_blog_feedback": "create_blog_feedback", "edit_blog_feedback": "edit_blog_feedback", "withdraw_blog_feedback": "withdraw_blog_feedback",
		"list_blog_feedback": "list_blog_feedback", "read_blog_vote_totals": "read_blog_vote_totals", "approve": "approve_blog_feedback", "reject": "reject_blog_feedback", "delete": "delete_blog_feedback", "ban": "ban_blog_feedback", "unban": "unban_blog_feedback",
	}
	for action, want := range actions {
		p, ok := blogPermission(actor, action)
		require.True(t, ok)
		require.Equal(t, want, p.ResourceRelation)
		require.Equal(t, "chronicle", p.ResourceType)
		require.Equal(t, "chronicle", p.ResourceID)
	}
	for _, action := range []string{"", "admin_users", "approve_blog_feedback", "unknown"} {
		calls := 0
		err := checkBlogPermission(context.Background(), actor, action, func(context.Context, rel.Relationship) (bool, error) { calls++; return true, nil })
		require.ErrorIs(t, err, serviceblog.ErrForbidden)
		require.Zero(t, calls)
	}
	require.ErrorIs(t, checkBlogPermission(context.Background(), nil, "vote_blog", nil), serviceblog.ErrForbidden)
	require.Error(t, checkBlogPermission(context.Background(), actor, "vote_blog", nil))
	require.ErrorIs(t, checkBlogPermission(context.Background(), actor, "vote_blog", func(context.Context, rel.Relationship) (bool, error) { return false, nil }), serviceblog.ErrForbidden)
	offline := errors.New("SpiceDB unavailable")
	require.ErrorIs(t, checkBlogPermission(context.Background(), actor, "vote_blog", func(context.Context, rel.Relationship) (bool, error) { return true, offline }), offline)
}

func TestBlogHandlersDenyWithoutDataAccess(t *testing.T) {
	t.Parallel()
	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	ctx := testutil.Context(t, testutil.WaitLong)
	user := uuid.New()
	p := policy.New()
	p.GlobalChronicle().Chronicle_member(p.User(user))
	_, err := zed.Write(ctx, *p.Txn())
	require.NoError(t, err)
	// A nil blog service makes accidental access fail loudly instead of hiding leaks.
	a := &API{Zed: zed}
	for _, tc := range []struct {
		name, action string
		handler      http.HandlerFunc
	}{
		{"list", "", a.AdminBlogFeedback}, {"totals", "", a.AdminBlogVotes},
		{"approve", "approve", a.AdminModerateBlogFeedback}, {"reject", "reject", a.AdminModerateBlogFeedback}, {"delete", "delete", a.AdminModerateBlogFeedback},
		{"ban", "ban", a.AdminBanBlogFeedback}, {"unban", "unban", a.AdminBanBlogFeedback},
		{"unknown moderation", "unknown", a.AdminModerateBlogFeedback}, {"unknown ban", "unknown", a.AdminBanBlogFeedback},
		{"wrong action moderation", "vote_blog", a.AdminModerateBlogFeedback},
		{"wrong action ban", "vote_blog", a.AdminBanBlogFeedback},
	} {
		route := chi.NewRouteContext()
		route.URLParams.Add("action", tc.action)
		r := httptest.NewRequest(http.MethodPost, "/", nil).WithContext(context.WithValue(authz.AsUser(ctx, user), chi.RouteCtxKey, route))
		w := httptest.NewRecorder()
		tc.handler(w, r)
		require.Equal(t, http.StatusForbidden, w.Code, tc.name)
		require.NotContains(t, w.Body.String(), "down_votes")
		require.NotContains(t, w.Body.String(), "user_id")
	}
	for _, handler := range []http.HandlerFunc{a.PutBlogVote, a.PutBlogFeedback, a.DeleteBlogFeedback, a.AdminBlogFeedback, a.AdminBlogVotes, a.AdminModerateBlogFeedback, a.AdminBanBlogFeedback} {
		w := httptest.NewRecorder()
		handler(w, httptest.NewRequest(http.MethodPost, "/", nil))
		require.Equal(t, http.StatusForbidden, w.Code)
	}
}

func TestOwnBlogReadPermissionFailsClosedWithoutBlockingPublic(t *testing.T) {
	t.Parallel()
	a := &API{}
	r := httptest.NewRequest(http.MethodGet, "/", nil).WithContext(authz.AsUser(context.Background(), uuid.New()))
	require.False(t, a.canReadOwnBlog(r, "read_own_blog_vote"))
	require.False(t, a.canReadOwnBlog(r, "read_own_blog_feedback"))
}
