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

func TestAccountRemovalBlockers(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)
	userID := insertAccountTestUser(t, db, "removal")

	blockers, err := db.GetAccountRemovalBlockers(ctx, userID)
	require.NoError(t, err)
	require.Empty(t, blockers)

	_, err = db.UpsertDataGrant(ctx, database.UpsertDataGrantParams{
		UserID: userID, Source: "test", StorageBytes: 1024,
	})
	require.NoError(t, err)
	blockers, err = db.GetAccountRemovalBlockers(ctx, userID)
	require.NoError(t, err)
	require.Contains(t, blockers, "storage grants")
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
