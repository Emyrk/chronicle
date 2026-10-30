package database_test

import (
	"database/sql"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func insertAccountTestUser(t *testing.T, db database.Store, prefix string) uuid.UUID {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)
	id := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{
		ID: id, Username: prefix + "-" + id.String()[:8], Email: prefix + "-" + id.String()[:8] + "@example.com",
	})
	require.NoError(t, err)
	return id
}

func TestAccountDataCounts(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)
	userID := insertAccountTestUser(t, db, "counts")

	counts, err := db.GetAccountDataCounts(ctx, userID)
	require.NoError(t, err)
	require.Empty(t, counts)

	_, err = db.UpsertDataGrant(ctx, database.UpsertDataGrantParams{
		UserID: userID, Source: "test", StorageBytes: 1024,
	})
	require.NoError(t, err)
	counts, err = db.GetAccountDataCounts(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, []database.GetAccountDataCountsRow{
		{GroupKey: "billing", Label: "Bonus storage grants", Count: 1},
	}, counts)
}

func TestAccountDeletionBlockers(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)
	userID := insertAccountTestUser(t, db, "blockers")

	blockers, err := db.GetAccountDeletionBlockers(ctx, userID)
	require.NoError(t, err)
	require.Empty(t, blockers)

	subscription := database.UpsertBillingSubscriptionParams{
		UserID: userID, Provider: "stripe", ProviderCustomerID: "cus_test", ProductCode: "honored", Status: "active",
	}
	_, err = db.UpsertBillingSubscription(ctx, subscription)
	require.NoError(t, err)
	blockers, err = db.GetAccountDeletionBlockers(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, []string{"billing account"}, blockers)

	// Any billing history blocks, not just an active subscription.
	subscription.Status = "canceled"
	_, err = db.UpsertBillingSubscription(ctx, subscription)
	require.NoError(t, err)
	blockers, err = db.GetAccountDeletionBlockers(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, []string{"billing account"}, blockers)
}

func TestAccountPurgeLifecycle(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)
	userID := insertAccountTestUser(t, db, "purge")
	_, err := db.UpsertDataGrant(ctx, database.UpsertDataGrantParams{
		UserID: userID, Source: "test", StorageBytes: 1024,
	})
	require.NoError(t, err)

	purge, err := db.InsertAccountPurge(ctx, database.InsertAccountPurgeParams{ID: uuid.New(), UserID: userID})
	require.NoError(t, err)
	require.Equal(t, "pending", purge.Status)
	_, err = db.InsertAccountPurge(ctx, database.InsertAccountPurgeParams{ID: uuid.New(), UserID: userID})
	require.True(t, database.IsUniqueViolation(err), "only one active purge per user")

	active, err := db.GetActiveAccountPurgeByUser(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, purge.ID, active.ID)

	// Personal data cascades from the user row.
	deleted, err := db.DeleteUserAccountRow(ctx, userID)
	require.NoError(t, err)
	require.EqualValues(t, 1, deleted)
	require.NoError(t, db.FinishAccountPurge(ctx, database.FinishAccountPurgeParams{ID: purge.ID, Status: "succeeded"}))

	// The purge row outlives the account so its status stays readable.
	finished, err := db.GetAccountPurge(ctx, purge.ID)
	require.NoError(t, err)
	require.Equal(t, "succeeded", finished.Status)
	require.True(t, finished.FinishedAt.Valid)
	_, err = db.GetActiveAccountPurgeByUser(ctx, userID)
	require.ErrorIs(t, err, sql.ErrNoRows)
}

func TestCurrentUserAuthSessionRevocation(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)
	userID := insertAccountTestUser(t, db, "session")
	now := time.Now()
	authLink, err := db.InsertUserAuth(ctx, database.InsertUserAuthParams{
		ID: uuid.New(), LinkedID: "session@example.com", UserID: userID, Provider: "password",
		CreatedAt: database.Timestamptz(now), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	sessionID := uuid.New()
	jwtID := uuid.New()
	_, err = db.InsertUserAuthSession(ctx, database.InsertUserAuthSessionParams{
		ID: sessionID, JwtID: jwtID, UserID: userID, UserAuthID: authLink.ID,
		ExpiresAt: database.Timestamptz(now.Add(time.Hour)), CreatedAt: database.Timestamptz(now), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)

	_, err = db.GetCurrentUserAuthSession(ctx, database.GetCurrentUserAuthSessionParams{
		SessionID: sessionID, UserID: userID, UserAuthID: authLink.ID, JwtID: jwtID,
	})
	require.NoError(t, err)
	require.NoError(t, db.DeleteUserAuthSessionsByUserID(ctx, userID))
	_, err = db.GetCurrentUserAuthSession(ctx, database.GetCurrentUserAuthSessionParams{
		SessionID: sessionID, UserID: userID, UserAuthID: authLink.ID, JwtID: jwtID,
	})
	require.ErrorIs(t, err, sql.ErrNoRows)
}

func TestAccountPurgeKeepsCreatedServers(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)
	userID := insertAccountTestUser(t, db, "server-owner")
	server, err := db.InsertWoWServer(ctx, database.InsertWoWServerParams{
		ID: uuid.New(), Name: "purge-server-" + userID.String()[:8], CreatedBy: uuid.NullUUID{UUID: userID, Valid: true},
	})
	require.NoError(t, err)

	blockers, err := db.GetAccountDeletionBlockers(ctx, userID)
	require.NoError(t, err)
	require.Empty(t, blockers, "created servers do not block a purge")

	require.NoError(t, db.ClearServersCreatedByUser(ctx, userID))
	deleted, err := db.DeleteUserAccountRow(ctx, userID)
	require.NoError(t, err)
	require.EqualValues(t, 1, deleted)

	kept, err := db.GetWoWServer(ctx, server.ID)
	require.NoError(t, err)
	require.False(t, kept.CreatedBy.Valid)
}
