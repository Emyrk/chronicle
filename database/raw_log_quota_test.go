package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestListRawLogGroupsForQuotaCleanup(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)

	ownerID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: ownerID, Username: "quota-" + ownerID.String()[:8], Email: ownerID.String() + "@example.com",
	})
	require.NoError(t, err)

	insertGroup := func(createdAt time.Time, parsed, pinned bool) uuid.UUID {
		t.Helper()
		groupID := uuid.New()
		now := database.Timestamptz(createdAt)
		_, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
			ID: groupID, Owner: ownerID, LogType: database.LogTypeV2, CreatedAt: now, UpdatedAt: now,
		})
		require.NoError(t, err)
		_, err = store.InsertLogFile(ctx, database.InsertLogFileParams{
			ID: uuid.New(), Owner: ownerID, Hash: uuid.NewString(), WowLogID: groupID,
			SizeBytes: 100, MimeType: "text/plain", CreatedAt: now, UpdatedAt: now,
		})
		require.NoError(t, err)
		if parsed {
			require.NoError(t, store.InsertParsedLogGroup(ctx, groupID))
		}
		if pinned {
			_, err = store.UpdateWoWLogGroupRawFilesPinned(ctx, database.UpdateWoWLogGroupRawFilesPinnedParams{
				ID: groupID, RawFilesPinned: true,
			})
			require.NoError(t, err)
		}
		return groupID
	}

	oldest := insertGroup(time.Now().Add(-3*time.Hour), true, false)
	pinned := insertGroup(time.Now().Add(-2*time.Hour), true, true)
	_ = insertGroup(time.Now().Add(-time.Hour), false, false)

	groups, err := store.ListRawLogGroupsForQuotaCleanup(ctx, ownerID)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{oldest}, groups)

	_, err = store.UpdateWoWLogGroupRawFilesPinned(ctx, database.UpdateWoWLogGroupRawFilesPinnedParams{
		ID: pinned, RawFilesPinned: false,
	})
	require.NoError(t, err)
	groups, err = store.ListRawLogGroupsForQuotaCleanup(ctx, ownerID)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{oldest, pinned}, groups)
}
