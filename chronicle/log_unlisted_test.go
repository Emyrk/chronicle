package chronicle

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestReconcileUnlistedLogGroupUnlinksDuplicates(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitMedium)
	store, _ := dbtestutil.NewDB(t)
	zed := authz.NewDatabaseOnly(slog.Default(), store)
	chron := &Chronicle{Zed: zed}

	ownerID, realmID := insertVisibilityTestOwnerAndRealm(t, ctx, store)
	startedAt := time.Now().UTC().Add(-time.Hour)
	publicLogID := insertVisibilityTestLogGroup(t, ctx, store, ownerID)
	unlistedLogID := insertVisibilityTestLogGroup(t, ctx, store, ownerID)
	publicInstanceID := insertVisibilityTestInstance(t, ctx, store, publicLogID, realmID, "Molten Core", startedAt)
	unlistedInstanceID := insertVisibilityTestInstance(t, ctx, store, unlistedLogID, realmID, "Molten Core", startedAt.Add(time.Minute))

	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: publicInstanceID, Valid: true},
		Ids:              []uuid.UUID{publicInstanceID, unlistedInstanceID},
	}))
	_, err := zed.MarkWoWLogGroupUnlisted(ctx, unlistedLogID)
	require.NoError(t, err)
	require.NoError(t, chron.ReconcileUnlistedLogGroup(ctx, unlistedLogID))

	unlistedInstance, err := store.Instance(ctx, unlistedInstanceID)
	require.NoError(t, err)
	require.False(t, unlistedInstance.DuplicateGroupID.Valid)
	publicInstance, err := store.Instance(ctx, publicInstanceID)
	require.NoError(t, err)
	require.True(t, publicInstance.DuplicateGroupID.Valid)
	require.Equal(t, publicInstanceID, publicInstance.DuplicateGroupID.UUID)
}

func insertVisibilityTestOwnerAndRealm(t *testing.T, ctx context.Context, store database.Store) (uuid.UUID, uuid.UUID) {
	t.Helper()
	ownerID := uuid.New()
	serverID := uuid.New()
	realmID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "visibility-owner-" + ownerID.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: serverID, Name: "visibility-server-" + serverID.String()})
	require.NoError(t, err)
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realmID, ServerID: serverID, Name: "Test Realm"})
	require.NoError(t, err)
	return ownerID, realmID
}

func insertVisibilityTestLogGroup(t *testing.T, ctx context.Context, store database.Store, ownerID uuid.UUID) uuid.UUID {
	t.Helper()
	logGroupID := uuid.New()
	now := database.Timestamptz(time.Now())
	_, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: ownerID, LogType: database.LogTypeV1, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))
	return logGroupID
}

func insertVisibilityTestInstance(t *testing.T, ctx context.Context, store database.Store, logGroupID, realmID uuid.UUID, name string, startedAt time.Time) uuid.UUID {
	t.Helper()
	instanceID := uuid.New()
	_, err := store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID, Name: name,
		StartTime: database.Timestamptz(startedAt), EndTime: database.Timestamptz(startedAt.Add(time.Hour)),
		Capabilities: []string{}, DifficultyName: "Normal", MaxPlayers: 40,
	})
	require.NoError(t, err)
	return instanceID
}
