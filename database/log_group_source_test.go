package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestLogGroupSourceAndOwnerHashLookup(t *testing.T) {
	t.Parallel()

	store, _ := dbtestutil.NewDB(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	now := database.Timestamptz(time.Now())

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "u-" + userID.String()[:8]})
	require.NoError(t, err)

	groupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: groupID, Owner: userID, LogType: database.LogTypeV2, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	file, err := store.InsertLogFile(ctx, database.InsertLogFileParams{
		ID: uuid.New(), Owner: userID, Hash: "abc", WowLogID: groupID, SizeBytes: 10,
		MimeType: "text/plain", CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)

	// Exact duplicate: same owner + hash resolves to the existing file/group.
	got, err := store.GetLogFileByOwnerHash(ctx, database.GetLogFileByOwnerHashParams{Owner: userID, Hash: "abc"})
	require.NoError(t, err)
	require.Equal(t, file.ID, got.ID)
	require.Equal(t, groupID, got.WowLogID)

	_, err = store.GetLogFileByOwnerHash(ctx, database.GetLogFileByOwnerHashParams{Owner: uuid.New(), Hash: "abc"})
	require.ErrorIs(t, err, pgx.ErrNoRows)

	// Same source id resolves to the same group, scoped to the owner.
	require.NoError(t, store.InsertLogGroupSource(ctx, database.InsertLogGroupSourceParams{
		LogGroupID: groupID, Owner: userID, SourceID: "src-1",
	}))
	id, err := store.GetLogGroupIDBySource(ctx, database.GetLogGroupIDBySourceParams{Owner: userID, SourceID: "src-1"})
	require.NoError(t, err)
	require.Equal(t, groupID, id)

	_, err = store.GetLogGroupIDBySource(ctx, database.GetLogGroupIDBySourceParams{Owner: uuid.New(), SourceID: "src-1"})
	require.ErrorIs(t, err, pgx.ErrNoRows)

	// The pre-flight lookup also reports how many bytes the group holds.
	row, err := store.GetLogGroupBySource(ctx, database.GetLogGroupBySourceParams{Owner: userID, SourceID: "src-1"})
	require.NoError(t, err)
	require.Equal(t, groupID, row.LogGroupID)
	require.Equal(t, int64(10), row.SizeBytes)

	// It follows the file as the log grows and is replaced in place.
	require.NoError(t, store.UpdateLogFileAfterAppend(ctx, database.UpdateLogFileAfterAppendParams{
		ID: file.ID, Hash: "def", SizeBytes: 4096,
	}))
	row, err = store.GetLogGroupBySource(ctx, database.GetLogGroupBySourceParams{Owner: userID, SourceID: "src-1"})
	require.NoError(t, err)
	require.Equal(t, int64(4096), row.SizeBytes)

	_, err = store.GetLogGroupBySource(ctx, database.GetLogGroupBySourceParams{Owner: uuid.New(), SourceID: "src-1"})
	require.ErrorIs(t, err, pgx.ErrNoRows)
	_, err = store.GetLogGroupBySource(ctx, database.GetLogGroupBySourceParams{Owner: userID, SourceID: "src-nope"})
	require.ErrorIs(t, err, pgx.ErrNoRows)

	// A source whose group has no files at all is still found, holding nothing.
	emptyGroup := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: emptyGroup, Owner: userID, LogType: database.LogTypeV2, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertLogGroupSource(ctx, database.InsertLogGroupSourceParams{
		LogGroupID: emptyGroup, Owner: userID, SourceID: "src-2",
	}))
	row, err = store.GetLogGroupBySource(ctx, database.GetLogGroupBySourceParams{Owner: userID, SourceID: "src-2"})
	require.NoError(t, err)
	require.Equal(t, emptyGroup, row.LogGroupID)
	require.Zero(t, row.SizeBytes)
}
