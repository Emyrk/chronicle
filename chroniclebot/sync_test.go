package chroniclebot

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/storagegrants"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/authzed/gochugaru/rel"
	"github.com/bwmarrin/discordgo"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type recordingAuthorizer struct {
	writes   []rel.Txn
	writeErr error
}

func (a *recordingAuthorizer) Write(_ context.Context, txn rel.Txn) (string, error) {
	if a.writeErr != nil {
		return "", a.writeErr
	}
	a.writes = append(a.writes, txn)
	return "", nil
}

func (*recordingAuthorizer) Delete(context.Context, *rel.PreconditionedFilter) error {
	return nil
}

func TestAvailable(t *testing.T) {
	t.Parallel()

	require.False(t, (*Bot)(nil).Available())
	require.False(t, (&Bot{disabled: true}).Available())
	require.True(t, (&Bot{}).Available())
}

func TestEnsureProtectedTechnicalAdmin(t *testing.T) {
	t.Parallel()

	t.Run("protected user gets technical admin", func(t *testing.T) {
		userID := uuid.New()
		zed := &recordingAuthorizer{}

		err := ensureProtectedTechnicalAdmin(context.Background(), zed, protectedTechnicalAdminDiscordID, userID)
		require.NoError(t, err)
		require.Len(t, zed.writes, 1)

		expected := policy.New()
		expected.GlobalChronicle().Technical_admin(expected.User(userID))
		require.Equal(t, expected.Txn().V1Updates, zed.writes[0].V1Updates)
	})

	t.Run("other users are untouched", func(t *testing.T) {
		zed := &recordingAuthorizer{}

		err := ensureProtectedTechnicalAdmin(context.Background(), zed, "another-discord-user", uuid.New())
		require.NoError(t, err)
		require.Empty(t, zed.writes)
	})

	t.Run("write errors are returned", func(t *testing.T) {
		writeErr := errors.New("write failed")
		zed := &recordingAuthorizer{writeErr: writeErr}

		err := ensureProtectedTechnicalAdmin(context.Background(), zed, protectedTechnicalAdminDiscordID, uuid.New())
		require.ErrorIs(t, err, writeErr)
	})
}

func TestReconcileDiscordMembershipUsesSpiceDBRoleForGrant(t *testing.T) {
	t.Parallel()

	broker := testservices.Authz(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(broker)
	db := servicedbstore.DatabaseStore(broker)

	userID := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{
		ID:       userID,
		Username: "discord-sync-" + uuid.NewString()[:8],
		Email:    uuid.NewString() + "@example.com",
	})
	require.NoError(t, err)
	discordID := uuid.NewString()
	_, err = db.InsertUserAuth(ctx, database.InsertUserAuthParams{
		ID:       uuid.New(),
		LinkedID: discordID,
		UserID:   userID,
		Provider: "discord",
	})
	require.NoError(t, err)

	checkedAt := time.Now().UTC().Round(time.Microsecond)
	_, err = db.InsertDiscordMembershipGrantCheck(ctx, database.InsertDiscordMembershipGrantCheckParams{
		UserID:      userID,
		NextCheckAt: database.Timestamptz(checkedAt.Add(-time.Hour)),
	})
	require.NoError(t, err)
	claims, err := db.ClaimDueDiscordMembershipGrantChecks(ctx, database.ClaimDueDiscordMembershipGrantChecksParams{
		CheckTime:  database.Timestamptz(checkedAt),
		LimitCount: 1,
	})
	require.NoError(t, err)
	require.Len(t, claims, 1)

	bot := &Bot{
		logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		config: Config{DB: db, Zed: zed},
	}

	err = bot.reconcileDiscordMembership(ctx, zed, userID, checkedAt, &discordgo.Member{}, claims[0].ClaimToken)
	require.NoError(t, err)

	roles, err := zed.UserChronicleRoles(ctx, userID)
	require.NoError(t, err)
	require.Contains(t, roles, "chronicle_guild_member")
	grants, err := db.GetUserDataGrants(ctx, userID)
	require.NoError(t, err)
	require.Contains(t, grantSources(grants), storagegrants.DiscordMemberSource)

	loginClaim, err := db.ActivateDiscordMembershipGrantCheckOnLogin(ctx, database.ActivateDiscordMembershipGrantCheckOnLoginParams{
		UserID:    userID,
		CheckTime: database.Timestamptz(checkedAt.Add(time.Hour)),
	})
	require.NoError(t, err)
	err = bot.reconcileDiscordMembership(ctx, zed, userID, checkedAt.Add(2*time.Hour), nil, loginClaim.ClaimToken)
	require.NoError(t, err)

	roles, err = zed.UserChronicleRoles(ctx, userID)
	require.NoError(t, err)
	require.NotContains(t, roles, "chronicle_guild_member")
	grants, err = db.GetUserDataGrants(ctx, userID)
	require.NoError(t, err)
	require.NotContains(t, grantSources(grants), storagegrants.DiscordMemberSource)
}

func TestPersistDiscordMembershipIgnoresStaleClaim(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)

	userID := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{
		ID:       userID,
		Username: "discord-stale-" + uuid.NewString()[:8],
		Email:    uuid.NewString() + "@example.com",
	})
	require.NoError(t, err)
	_, err = db.InsertDiscordMembershipGrantCheck(ctx, database.InsertDiscordMembershipGrantCheckParams{
		UserID:      userID,
		NextCheckAt: database.Timestamptz(time.Now().UTC()),
	})
	require.NoError(t, err)

	bot := &Bot{config: Config{DB: db}}
	err = bot.persistDiscordMembership(ctx, userID, time.Now().UTC(), true, uuid.NullUUID{
		UUID:  uuid.New(),
		Valid: true,
	})
	require.NoError(t, err)

	grants, err := db.GetUserDataGrants(ctx, userID)
	require.NoError(t, err)
	require.NotContains(t, grantSources(grants), storagegrants.DiscordMemberSource)
}

func grantSources(grants []database.DataGrant) []string {
	sources := make([]string, 0, len(grants))
	for _, grant := range grants {
		sources = append(sources, grant.Source)
	}
	return sources
}
