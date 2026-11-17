package authz_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestRaidLogReparseAndViewPermissions(t *testing.T) {
	t.Parallel()

	zed := serviceauthz.Authz(testservices.Authz(t))
	ctx := testutil.Context(t, testutil.WaitLong)

	for _, tc := range []struct {
		name     string
		role     string
		uploader bool
		allowed  bool
	}{
		{name: "unrelated user"},
		{name: "ordinary uploader", uploader: true},
		{name: "technical user", role: "technical_user"},
		{name: "technical uploader", role: "technical_user", uploader: true, allowed: true},
		{name: "moderator", role: "moderate_logs", allowed: true},
		{name: "moderator uploader", role: "moderate_logs", uploader: true, allowed: true},
		{name: "admin", role: "admin", allowed: true},
		{name: "technical admin", role: "technical_admin", allowed: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			p := policy.New()
			userID := uuid.New()
			user := p.User(userID)
			log := p.Raid_log(uuid.New()).Chronicle(p.GlobalChronicle())
			if tc.uploader {
				log.Uploader(user)
			} else {
				log.Uploader(p.User(uuid.New()))
			}
			switch tc.role {
			case "technical_user":
				p.GlobalChronicle().Technical_user(user)
			case "moderate_logs":
				p.GlobalChronicle().Moderate_logs(user)
			case "admin":
				p.GlobalChronicle().Admin(user)
			case "technical_admin":
				p.GlobalChronicle().Technical_admin(user)
			}
			_, err := zed.Write(ctx, *p.Txn())
			require.NoError(t, err)

			allowed, err := zed.CheckOne(ctx, nil, log.CanReparse_User(user))
			require.NoError(t, err)
			require.Equal(t, tc.allowed, allowed)

			canView, err := zed.CheckOne(ctx, nil, log.CanView_User(user))
			require.NoError(t, err)
			require.Equal(t, tc.uploader || tc.allowed, canView)

			if tc.role == "moderate_logs" {
				require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, nil))
				allowed, err = zed.CheckOne(ctx, nil, log.CanReparse_User(user))
				require.NoError(t, err)
				require.False(t, allowed, "revoked moderators must lose reparse access")
				canView, err = zed.CheckOne(ctx, nil, log.CanView_User(user))
				require.NoError(t, err)
				require.Equal(t, tc.uploader, canView, "revoked moderators only retain view access to their own logs")
			}
		})
	}
}
