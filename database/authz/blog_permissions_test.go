package authz_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestBlogActionPermissions(t *testing.T) {
	t.Parallel()
	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	ctx := testutil.Context(t, testutil.WaitLong)
	c := policy.New().GlobalChronicle()
	permissions := []struct {
		name                 string
		check                func(*policy.ObjUser) rel.Relationship
		member, banSensitive bool
	}{
		{"vote", c.CanVote_blog_User, true, false},
		{"own vote", c.CanRead_own_blog_vote_User, true, false},
		{"own feedback", c.CanRead_own_blog_feedback_User, true, false},
		{"withdraw", c.CanWithdraw_blog_feedback_User, true, false},
		{"submit", c.CanSubmit_blog_feedback_User, true, true},
		{"create", c.CanCreate_blog_feedback_User, true, true},
		{"edit", c.CanEdit_blog_feedback_User, true, true},
		{"list", c.CanList_blog_feedback_User, false, false},
		{"totals", c.CanRead_blog_vote_totals_User, false, false},
		{"approve", c.CanApprove_blog_feedback_User, false, false},
		{"reject", c.CanReject_blog_feedback_User, false, false},
		{"delete", c.CanDelete_blog_feedback_User, false, false},
		{"ban", c.CanBan_blog_feedback_User, false, false},
		{"unban", c.CanUnban_blog_feedback_User, false, false},
	}
	for _, role := range []string{"outsider", "member", "guild member", "admin", "technical_admin", "is_admin_users"} {
		user := uuid.New()
		p := policy.New()
		actor := p.User(user)
		switch role {
		case "member":
			p.GlobalChronicle().Chronicle_member(actor)
		case "guild member":
			p.GlobalChronicle().Chronicle_guild_member(actor)
		case "admin":
			p.GlobalChronicle().Admin(actor)
		case "technical_admin":
			p.GlobalChronicle().Technical_admin(actor)
		case "is_admin_users":
			p.GlobalChronicle().Is_admin_users(actor)
		}
		if role != "outsider" {
			_, err := zed.Write(ctx, *p.Txn())
			require.NoError(t, err)
		}
		for _, banned := range []bool{false, true, false} {
			p = policy.New()
			if banned {
				p.GlobalChronicle().Feedback_banned(p.User(user))
			} else {
				p.GlobalChronicle().Delete().Feedback_banned(p.User(user))
			}
			_, err := zed.Write(ctx, *p.Txn())
			require.NoError(t, err)
			for _, permission := range permissions {
				allowed, err := zed.CheckOne(ctx, nil, permission.check(actor))
				require.NoError(t, err)
				admin := role == "admin" || role == "technical_admin"
				member := role == "member" || role == "guild member" || admin
				want := ((!permission.member && (admin || role == "is_admin_users")) || permission.member && member) && (!banned || !permission.banSensitive)
				require.Equal(t, want, allowed, "role=%s action=%s banned=%v", role, permission.name, banned)
			}
		}
	}
}
