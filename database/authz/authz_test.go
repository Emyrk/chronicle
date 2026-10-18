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
