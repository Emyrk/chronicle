package chronicle

import (
	"bytes"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestFreeStorageForUploadDeletesOldestUnpinnedParsedRawLog(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)
	objects, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	chron := &Chronicle{Zed: authz.NewDatabaseOnly(testutil.Logger(t), store), Storage: objects, logger: testutil.Logger(t)}

	ownerID := uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{
		ID: ownerID, Username: "quota-cleanup-" + ownerID.String()[:8], Email: ownerID.String() + "@example.com",
	})
	require.NoError(t, err)
	_, err = store.UpsertDataGrant(ctx, database.UpsertDataGrantParams{
		UserID: ownerID, Source: "quota-cleanup-test", StorageBytes: 1_000,
	})
	require.NoError(t, err)
	user, err := store.GetUserByID(ctx, ownerID)
	require.NoError(t, err)
	require.True(t, user.AutoDeleteRawLogsAtStorageCapacity)

	insertRawLog := func(createdAt time.Time, size int64, pinned bool) (uuid.UUID, uuid.UUID) {
		t.Helper()
		groupID := uuid.New()
		fileID := uuid.New()
		now := database.Timestamptz(createdAt)
		_, insertErr := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID: groupID, Owner: ownerID, LogType: database.LogTypeV2, CreatedAt: now, UpdatedAt: now,
		})
		require.NoError(t, insertErr)
		_, insertErr = store.InsertLogFile(ctx, database.InsertLogFileParams{
			ID: fileID, Owner: ownerID, Hash: uuid.NewString(), WowLogID: groupID,
			SizeBytes: size, MimeType: "text/plain", CreatedAt: now, UpdatedAt: now,
		})
		require.NoError(t, insertErr)
		require.NoError(t, store.InsertParsedLogGroup(ctx, groupID))
		if pinned {
			_, insertErr = store.UpdateWoWLogGroupRawFilesPinned(ctx, database.UpdateWoWLogGroupRawFilesPinnedParams{
				ID: groupID, RawFilesPinned: true,
			})
			require.NoError(t, insertErr)
		}
		_, insertErr = objects.UploadFile(ctx, BucketRaidLogs, chron.logPath(fileID), bytes.NewReader([]byte("raw")))
		require.NoError(t, insertErr)
		return groupID, fileID
	}

	unpinnedGroupID, unpinnedFileID := insertRawLog(time.Now().Add(-2*time.Hour), user.MaxStorageBytes, false)
	pinnedGroupID, pinnedFileID := insertRawLog(time.Now().Add(-time.Hour), 10, true)
	user, err = store.GetUserByID(ctx, ownerID)
	require.NoError(t, err)
	require.Greater(t, user.ConsumedStorageBytes, user.MaxStorageBytes)

	updated, err := chron.freeStorageForUpload(ctx, user, 10)
	require.NoError(t, err)
	require.LessOrEqual(t, updated.ConsumedStorageBytes+10, updated.MaxStorageBytes)

	unpinnedFile, err := store.GetLogFile(ctx, unpinnedFileID)
	require.NoError(t, err)
	require.True(t, unpinnedFile.StorageDeletedAt.Valid)
	pinnedFile, err := store.GetLogFile(ctx, pinnedFileID)
	require.NoError(t, err)
	require.False(t, pinnedFile.StorageDeletedAt.Valid)

	unpinnedGroup, err := store.GetWoWLogGroupByID(ctx, unpinnedGroupID)
	require.NoError(t, err)
	require.False(t, unpinnedGroup.WoWLogGroup.RawFilesPinned)
	pinnedGroup, err := store.GetWoWLogGroupByID(ctx, pinnedGroupID)
	require.NoError(t, err)
	require.True(t, pinnedGroup.WoWLogGroup.RawFilesPinned)
}
