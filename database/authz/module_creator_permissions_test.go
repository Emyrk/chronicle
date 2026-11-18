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

func TestModuleCreatorRole(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))
	p := policy.New()
	userID := uuid.New()
	user := p.User(userID)
	chronicle := p.GlobalChronicle()

	checkCreation := func(want bool) {
		t.Helper()
		allowed, err := zed.CheckOne(ctx, nil, chronicle.CanCreate_lua_project_User(user))
		require.NoError(t, err)
		require.Equal(t, want, allowed)
	}
	checkCreation(false)
	require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, []string{"module-creator"}))
	checkCreation(true)
	roles, err := zed.UserChronicleRoles(ctx, userID)
	require.NoError(t, err)
	require.Contains(t, roles, "module-creator", "API role names must round-trip through manual assignment")
	require.NotContains(t, roles, "module_creator")

	// This is a narrow creation grant, not a supporter tier or administrative role.
	for _, permission := range []rel.Interface{
		chronicle.CanHas_honored_User(user),
		chronicle.CanHas_revered_User(user),
		chronicle.CanAd_free_User(user),
		chronicle.CanHas_exalted_User(user),
		chronicle.CanLinked_characters_ad_free_User(user),
		chronicle.CanUploaded_logs_ad_free_User(user),
		chronicle.CanDownload_raw_logs_User(user),
		chronicle.CanUnlisted_logs_User(user),
		chronicle.CanCreate_live_session_User(user),
		chronicle.CanRevered_cosmetics_User(user),
		chronicle.CanAdminister_User(user),
	} {
		allowed, err := zed.CheckOne(ctx, nil, permission)
		require.NoError(t, err)
		require.False(t, allowed, "module-creator must not grant unrelated permissions: %v", permission)
	}

	// Saving the returned API role list retains the grant.
	require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, roles))
	checkCreation(true)
	require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, nil))
	checkCreation(false)
	roles, err = zed.UserChronicleRoles(ctx, userID)
	require.NoError(t, err)
	require.NotContains(t, roles, "module-creator")
	require.Contains(t, roles, "chronicle_member", "revocation preserves baseline membership")
}
