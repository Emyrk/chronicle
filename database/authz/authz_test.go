package authz_test

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
)

func TestAuthz(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	logger, authz := servicelogger.Logger(broker), serviceauthz.Authz(broker)

	var _, _, _ = logger, authz, ctx

}

func TestInTx_UpsertGuildWritesSpiceDBRelationship(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	db := servicedbstore.DatabaseStore(broker)

	serverID := uuid.New()
	realmID := uuid.New()
	_, err := db.InsertWoWServer(ctx, database.InsertWoWServerParams{
		ID:          serverID,
		Name:        "authz transaction test server " + serverID.String(),
		Description: "authz transaction test",
	})
	require.NoError(t, err)
	_, err = db.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
		ID:          realmID,
		ServerID:    serverID,
		Name:        "authz transaction test realm " + realmID.String(),
		Description: "authz transaction test",
	})
	require.NoError(t, err)

	var guild database.Guild
	err = zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		var upsertErr error
		guild, upsertErr = tx.UpsertGuild(ctx, database.UpsertGuildParams{
			RealmID:   realmID,
			Name:      "Parser Guild",
			CreatedAt: database.Timestamptz(time.Now()),
		})
		return upsertErr
	}, nil)
	require.NoError(t, err)
	require.NotEqual(t, uuid.Nil, guild.ID)
}

func TestManageConsumablesRole(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	ctx := testutil.Context(t, testutil.WaitLong)

	for _, tc := range []struct {
		name  string
		roles []string
	}{
		{name: "dedicated role", roles: []string{"manage_consumables"}},
		{name: "admin", roles: []string{"admin"}},
		{name: "technical admin", roles: []string{"technical_admin"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			userID := uuid.New()
			require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, tc.roles))

			canManage, err := zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_consumables_User(policy.New().User(userID)))
			require.NoError(t, err)
			require.True(t, canManage)
		})
	}

	dedicatedUserID := uuid.New()
	require.NoError(t, zed.SetUserChronicleRoles(ctx, dedicatedUserID, []string{"manage_consumables"}))
	canManageWorldData, err := zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_world_data_User(policy.New().User(dedicatedUserID)))
	require.NoError(t, err)
	require.False(t, canManageWorldData)
}

func TestInferenceChatPermission(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	ctx := testutil.Context(t, testutil.WaitLong)

	for _, tc := range []struct {
		name     string
		roles    []string
		disabled bool
		allowed  bool
	}{
		{name: "dedicated capability", roles: []string{"inference_capable"}, allowed: true},
		{name: "capable user opted out", roles: []string{"inference_capable"}, disabled: true, allowed: false},
		{name: "admin", roles: []string{"admin"}, allowed: true},
		{name: "admin opted out", roles: []string{"admin"}, disabled: true, allowed: false},
		{name: "ordinary user", roles: nil, allowed: false},
		{name: "ordinary user opted out", roles: nil, disabled: true, allowed: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			userID := uuid.New()
			require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, tc.roles))
			if tc.disabled {
				require.NoError(t, zed.SetInferenceDisabled(ctx, userID, true))
			}

			allowed, err := zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanUse_inference_chat_User(policy.New().User(userID)))
			require.NoError(t, err)
			require.Equal(t, tc.allowed, allowed)
		})
	}

	userID := uuid.New()
	require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, []string{"inference_capable"}))
	require.NoError(t, zed.SetInferenceDisabled(ctx, userID, true))
	require.NoError(t, zed.SetInferenceDisabled(ctx, userID, false))
	allowed, err := zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanUse_inference_chat_User(policy.New().User(userID)))
	require.NoError(t, err)
	require.True(t, allowed)
}

func TestInferenceDebugPermission(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	ctx := testutil.Context(t, testutil.WaitLong)

	for _, tc := range []struct {
		name    string
		roles   []string
		allowed bool
	}{
		{name: "dedicated debug capability", roles: []string{"inference_debug_capable"}, allowed: true},
		{name: "admin", roles: []string{"admin"}, allowed: true},
		{name: "technical admin", roles: []string{"technical_admin"}, allowed: true},
		{name: "inference only", roles: []string{"inference_capable"}, allowed: false},
		{name: "ordinary user", roles: nil, allowed: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			userID := uuid.New()
			require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, tc.roles))

			allowed, err := zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanDebug_inference_chat_User(policy.New().User(userID)))
			require.NoError(t, err)
			require.Equal(t, tc.allowed, allowed)
		})
	}
}

func TestInvalidateLogsPermission(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	ctx := testutil.Context(t, testutil.WaitLong)

	for _, tc := range []struct {
		name    string
		roles   []string
		allowed bool
	}{
		{name: "technical admin", roles: []string{"technical_admin"}, allowed: true},
		{name: "admin", roles: []string{"admin"}, allowed: false},
		{name: "log moderator", roles: []string{"moderate_logs"}, allowed: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			userID := uuid.New()
			require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, tc.roles))

			allowed, err := zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanInvalidate_logs_User(policy.New().User(userID)))
			require.NoError(t, err)
			require.Equal(t, tc.allowed, allowed)
		})
	}
}

func TestStripeEntitlementRoles(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	ctx := testutil.Context(t, testutil.WaitLong)

	for _, tc := range []struct {
		role    string
		allowed []bool
	}{
		{role: "stripe_ad_free", allowed: []bool{true, false, false, false}},
		{role: "stripe_download_raw_logs", allowed: []bool{false, true, false, false}},
		{role: "stripe_unlisted_logs", allowed: []bool{false, false, true, true}},
	} {
		userID := uuid.New()
		user := policy.New().User(userID)
		chronicle := policy.New().GlobalChronicle()
		permissions := []rel.Interface{
			chronicle.CanAd_free_User(user),
			chronicle.CanDownload_raw_logs_User(user),
			chronicle.CanUnlisted_logs_User(user),
			chronicle.CanMark_log_unlisted_User(user),
		}

		require.NoError(t, zed.SetStripeEntitlementRole(ctx, userID, tc.role, true))
		allowed, err := zed.Check(ctx, nil, permissions...)
		require.NoError(t, err)
		require.Equal(t, tc.allowed, allowed)

		require.NoError(t, zed.SetStripeEntitlementRole(ctx, userID, tc.role, false))
		allowed, err = zed.Check(ctx, nil, permissions...)
		require.NoError(t, err)
		require.Equal(t, []bool{false, false, false, false}, allowed)
	}

	userID := uuid.New()
	builder := policy.New()
	builder.GlobalChronicle().Supporter(builder.User(userID))
	_, err := zed.Write(ctx, *builder.Txn())
	require.NoError(t, err)
	require.NoError(t, zed.SetStripeEntitlementRole(ctx, userID, "stripe_ad_free", true))
	require.NoError(t, zed.SetStripeEntitlementRole(ctx, userID, "stripe_ad_free", false))
	chronicle := policy.New().GlobalChronicle()
	user := policy.New().User(userID)
	allowed, err := zed.Check(ctx, nil,
		chronicle.CanShorter_urls_User(user),
		chronicle.CanAd_free_User(user),
	)
	require.NoError(t, err)
	require.Equal(t, []bool{true, true}, allowed, "revoking a Stripe role must preserve Discord-owned supporter permissions")

	require.ErrorContains(t, zed.SetStripeEntitlementRole(ctx, userID, "supporter", true), "invalid Stripe entitlement role")
}

func TestGuildDiscordBotPermissions(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	ctx := testutil.Context(t, testutil.WaitLong)

	guildID := uuid.New()
	leaderID := uuid.New()
	memberID := uuid.New()
	technicalAdminID := uuid.New()
	guildModeratorID := uuid.New()

	b := policy.New()
	guild := b.Guild(guildID)
	chronicle := b.GlobalChronicle()
	guild.Chronicle(chronicle)
	guild.Leader(b.User(leaderID))
	guild.Member(b.User(memberID))
	chronicle.Technical_admin(b.User(technicalAdminID))
	chronicle.Moderate_guilds(b.User(guildModeratorID))
	_, err := zed.Write(ctx, *b.Txn())
	require.NoError(t, err)

	checkManage := func(t *testing.T, userID uuid.UUID, expected bool) {
		t.Helper()
		allowed, err := zed.CheckOne(ctx, nil, policy.New().Guild(guildID).CanManage_discord_bot_User(policy.New().User(userID)))
		require.NoError(t, err)
		require.Equal(t, expected, allowed)
	}

	checkGuildAdmin := func(t *testing.T, userID uuid.UUID, expected bool) {
		t.Helper()
		allowed, err := zed.CheckOne(ctx, nil, policy.New().Guild(guildID).CanAdmin_guild_User(policy.New().User(userID)))
		require.NoError(t, err)
		require.Equal(t, expected, allowed)
	}
	checkGuildAdmin(t, leaderID, true)
	checkGuildAdmin(t, memberID, false)
	checkGuildAdmin(t, technicalAdminID, true)
	checkGuildAdmin(t, guildModeratorID, true)

	leaderCanEnable, err := zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_guilds_User(policy.New().User(leaderID)))
	require.NoError(t, err)
	require.False(t, leaderCanEnable)
	technicalAdminCanEnable, err := zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_guilds_User(policy.New().User(technicalAdminID)))
	require.NoError(t, err)
	require.True(t, technicalAdminCanEnable)
	guildModeratorCanEnable, err := zed.CheckOne(ctx, nil, policy.New().GlobalChronicle().CanAdmin_guilds_User(policy.New().User(guildModeratorID)))
	require.NoError(t, err)
	require.True(t, guildModeratorCanEnable)

	checkManage(t, leaderID, false)

	require.NoError(t, zed.SetGuildDiscordBotEnabled(ctx, guildID, true))

	entitled, err := zed.CheckOne(ctx, nil, policy.New().Guild(guildID).CanUse_discord_bot_User(policy.New().User(uuid.New())))
	require.NoError(t, err)
	require.True(t, entitled)
	checkManage(t, leaderID, true)
	checkManage(t, memberID, false)
	checkManage(t, technicalAdminID, true)
	checkManage(t, guildModeratorID, true)

	require.NoError(t, zed.SetGuildDiscordBotEnabled(ctx, guildID, false))
	checkManage(t, leaderID, false)
}

func TestPhotoProofPermissions(t *testing.T) {
	t.Parallel()
	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)
	ctx := testutil.Context(t, testutil.WaitLong)
	tenantA, tenantB := uuid.New(), uuid.New()
	applicant, reviewer, tenantAdmin, siteAdmin, technicalAdmin := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
	require.NoError(t, zed.SetTenantProofGrant(ctx, tenantA, applicant, true, false))
	require.NoError(t, zed.SetTenantProofGrant(ctx, tenantA, reviewer, false, true))
	require.NoError(t, zed.SetUserChronicleRoles(ctx, siteAdmin, []string{"admin"}))
	require.NoError(t, zed.SetUserChronicleRoles(ctx, technicalAdmin, []string{"technical_admin"}))
	b := policy.New()
	b.Wow_tenant(tenantA).Chronicle(b.GlobalChronicle()).Admin(b.User(tenantAdmin))
	b.Wow_tenant(tenantB).Chronicle(b.GlobalChronicle())
	_, err := zed.Write(ctx, *b.Txn())
	require.NoError(t, err)

	for _, tc := range []struct {
		name                               string
		user                               uuid.UUID
		submitA, reviewA, submitB, reviewB bool
	}{
		{"applicant", applicant, true, false, false, false},
		{"reviewer", reviewer, false, true, false, false},
		{"tenant admin", tenantAdmin, false, false, false, false},
		{"site admin", siteAdmin, false, false, false, false},
		{"technical admin", technicalAdmin, false, true, false, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := testutil.Context(t, testutil.WaitLong)
			b := policy.New()
			allowed, err := zed.Check(ctx, nil,
				b.Wow_tenant(tenantA).CanSubmit_photo_proof_User(b.User(tc.user)),
				b.Wow_tenant(tenantA).CanReview_photo_proof_User(b.User(tc.user)),
				b.Wow_tenant(tenantB).CanSubmit_photo_proof_User(b.User(tc.user)),
				b.Wow_tenant(tenantB).CanReview_photo_proof_User(b.User(tc.user)),
			)
			require.NoError(t, err)
			require.Equal(t, []bool{tc.submitA, tc.reviewA, tc.submitB, tc.reviewB}, allowed)
		})
	}

	// Global grants flow through each tenant's Chronicle relationship without
	// changing its direct roles. Root review separately accepts the global
	// reviewer permission or admin_users.
	siteSubmitter, siteReviewer := uuid.New(), uuid.New()
	require.NoError(t, zed.SetUserChronicleRoles(ctx, siteSubmitter, []string{"photo_proof_submitter"}))
	require.NoError(t, zed.SetUserChronicleRoles(ctx, siteReviewer, []string{"photo_proof_reviewer"}))
	global := policy.New()
	globalAllowed, err := zed.Check(ctx, nil,
		global.GlobalChronicle().CanSubmit_photo_proof_User(global.User(siteSubmitter)),
		global.GlobalChronicle().CanReview_photo_proof_User(global.User(siteSubmitter)),
		global.GlobalChronicle().CanSubmit_photo_proof_User(global.User(siteReviewer)),
		global.GlobalChronicle().CanReview_photo_proof_User(global.User(siteReviewer)),
		global.GlobalChronicle().CanReview_photo_proof_User(global.User(siteAdmin)),
		global.Wow_tenant(tenantA).CanSubmit_photo_proof_User(global.User(siteSubmitter)),
		global.Wow_tenant(tenantB).CanSubmit_photo_proof_User(global.User(siteSubmitter)),
		global.Wow_tenant(tenantA).CanReview_photo_proof_User(global.User(siteReviewer)),
		global.Wow_tenant(tenantB).CanReview_photo_proof_User(global.User(siteReviewer)),
	)
	require.NoError(t, err)
	require.Equal(t, []bool{true, false, false, true, false, true, true, true, true}, globalAllowed)
	require.NoError(t, zed.SetUserChronicleRoles(ctx, siteReviewer, nil))
	globalReview, err := zed.CheckOne(ctx, nil, global.GlobalChronicle().CanReview_photo_proof_User(global.User(siteReviewer)))
	require.NoError(t, err)
	require.False(t, globalReview)

	// The negative role wins even when a user has both site-wide and
	// tenant-specific submit grants. It does not remove their reviewer grant.
	require.NoError(t, zed.SetUserChronicleRoles(ctx, siteSubmitter, []string{"photo_proof_submitter", "photo_proof_banned"}))
	require.NoError(t, zed.SetUserChronicleRoles(ctx, applicant, []string{"photo_proof_banned", "photo_proof_reviewer"}))
	banChecks := policy.New()
	banned, err := zed.Check(ctx, nil,
		banChecks.GlobalChronicle().CanSubmit_photo_proof_User(banChecks.User(siteSubmitter)),
		banChecks.Wow_tenant(tenantA).CanSubmit_photo_proof_User(banChecks.User(siteSubmitter)),
		banChecks.Wow_tenant(tenantB).CanSubmit_photo_proof_User(banChecks.User(siteSubmitter)),
		banChecks.Wow_tenant(tenantA).CanSubmit_photo_proof_User(banChecks.User(applicant)),
		banChecks.Wow_tenant(tenantA).CanReview_photo_proof_User(banChecks.User(applicant)),
	)
	require.NoError(t, err)
	require.Equal(t, []bool{false, false, false, false, true}, banned)
	require.NoError(t, zed.SetUserChronicleRoles(ctx, applicant, nil))
	restored, err := zed.CheckOne(ctx, nil, banChecks.Wow_tenant(tenantA).CanSubmit_photo_proof_User(banChecks.User(applicant)))
	require.NoError(t, err)
	require.True(t, restored)

	grants, err := zed.TenantProofGrants(ctx, tenantA)
	require.NoError(t, err)
	require.Len(t, grants, 2)
	require.NoError(t, zed.SetTenantProofGrant(ctx, tenantA, applicant, false, false))
	allowed, err := zed.CheckOne(ctx, nil, policy.New().Wow_tenant(tenantA).CanSubmit_photo_proof_User(policy.New().User(applicant)))
	require.NoError(t, err)
	require.False(t, allowed)
	allowed, err = zed.CheckOne(ctx, nil, policy.New().Wow_tenant(tenantA).CanReview_photo_proof_User(policy.New().User(reviewer)))
	require.NoError(t, err)
	require.True(t, allowed)
}

func TestSetUserChronicleRolesSupportsAdFreeCapability(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	userID := uuid.New()

	require.NoError(t, zed.SetStripeEntitlementRole(ctx, userID, "stripe_download_raw_logs", true))
	require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, []string{"ad_free_capable"}))

	roles, err := zed.UserChronicleRoles(ctx, userID)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{"chronicle_member", "ad_free_capable", "stripe_download_raw_logs"}, roles)

	chronicle := policy.New().GlobalChronicle()
	user := policy.New().User(userID)
	allowed, err := zed.Check(ctx, nil,
		chronicle.CanAd_free_User(user),
		chronicle.CanDownload_raw_logs_User(user),
	)
	require.NoError(t, err)
	require.Equal(t, []bool{true, true}, allowed)

	require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, nil))
	roles, err = zed.UserChronicleRoles(ctx, userID)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{"chronicle_member", "stripe_download_raw_logs"}, roles)

	allowed, err = zed.Check(ctx, nil,
		chronicle.CanAd_free_User(user),
		chronicle.CanDownload_raw_logs_User(user),
	)
	require.NoError(t, err)
	require.Equal(t, []bool{false, true}, allowed)
}

func TestSetUserChronicleRolesSupportsUnlistedCapability(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	userID := uuid.New()

	require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, []string{"unlisted_log_capable"}))
	roles, err := zed.UserChronicleRoles(ctx, userID)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{"chronicle_member", "unlisted_log_capable"}, roles)

	require.NoError(t, zed.SetUserChronicleRoles(ctx, userID, nil))
	roles, err = zed.UserChronicleRoles(ctx, userID)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{"chronicle_member"}, roles)
}

func TestLogUnlistedRoles(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)

	ownerID := uuid.New()
	otherUnlistedID := uuid.New()
	adminID := uuid.New()
	logID := uuid.New()

	b := policy.New()
	chronicle := b.GlobalChronicle()
	chronicle.Unlisted_log_capable(b.User(ownerID))
	chronicle.Unlisted_log_capable(b.User(otherUnlistedID))
	chronicle.Moderate_logs(b.User(adminID))
	b.Raid_log(logID).Uploader(b.User(ownerID)).Chronicle(chronicle)
	_, err := zed.Write(ctx, *b.Txn())
	require.NoError(t, err)

	check := func(userID uuid.UUID, expected bool) {
		t.Helper()
		allowed, err := zed.CheckOne(ctx, nil, rel.Relationship{
			ResourceType: "raid_log", ResourceID: logID.String(), ResourceRelation: "mark_unlisted",
			SubjectType: "user", SubjectID: userID.String(),
		})
		require.NoError(t, err)
		require.Equal(t, expected, allowed)
	}

	check(ownerID, true)
	check(otherUnlistedID, false)
	check(adminID, true)
}

func TestMarkWoWLogGroupUnlistedKeepsInstancePublic(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	db := servicedbstore.DatabaseStore(broker)

	ownerID := uuid.New()
	otherID := uuid.New()
	serverID := uuid.New()
	realmID := uuid.New()
	logID := uuid.New()
	instanceID := uuid.New()

	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "unlisted-owner-" + ownerID.String()})
	require.NoError(t, err)
	_, err = db.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: serverID, Name: "unlisted-server-" + serverID.String()})
	require.NoError(t, err)
	_, err = db.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realmID, ServerID: serverID, Name: "unlisted-realm-" + realmID.String()})
	require.NoError(t, err)

	now := database.Timestamptz(time.Now())
	_, err = zed.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logID, Owner: ownerID, LogType: database.LogTypeV1, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	require.NoError(t, zed.InsertParsedLogGroup(ctx, logID))
	_, err = zed.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logID, Name: "Molten Core",
		Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
	})
	require.NoError(t, err)

	checkView := func() {
		t.Helper()
		allowed, err := zed.CheckOne(ctx, nil, rel.Relationship{
			ResourceType: "instance", ResourceID: instanceID.String(), ResourceRelation: "view",
			SubjectType: "user", SubjectID: otherID.String(),
		})
		require.NoError(t, err)
		require.True(t, allowed)
	}
	checkView()

	_, err = zed.MarkWoWLogGroupUnlisted(ctx, logID)
	require.NoError(t, err)
	checkView()
}

func TestInTx_NilWrapped(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	zed := serviceauthz.Authz(broker)

	// Use an already-cancelled context so BeginTx fails before the
	// callback is invoked, leaving wrapped == nil in the error path.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := zed.InTx(ctx, func(_ *authz.AuthzTX) error {
		t.Fatal("callback should not be invoked on a cancelled context")
		return nil
	}, nil)
	assert.Error(t, err, "InTx should return an error, not panic")
}
