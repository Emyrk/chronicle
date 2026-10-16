package retention

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestRawLogWorkerStorageFailurePreservesRetryableState(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	logID := insertExpiredRawLogFixture(t, ctx, store)

	local, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	removeErr := errors.New("storage unavailable")
	failing := &failingRemoveStorage{ObjectStorage: local, err: removeErr}
	worker := &RawLogWorker{
		Store: store, Storage: failing,
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	}

	err = worker.Work(ctx, nil)
	require.ErrorIs(t, err, removeErr)
	require.Equal(t, 1, failing.calls)

	files, err := store.GetWoWLogFilesByGroupID(ctx, logID)
	require.NoError(t, err)
	require.Len(t, files, 1)
	require.False(t, files[0].StorageDeletedAt.Valid)
	candidates, err := store.GetExpiredRawLogGroups(ctx, 10)
	require.NoError(t, err)
	require.Contains(t, candidates, logID)

	worker.Storage = local
	require.NoError(t, worker.Work(ctx, nil))
	files, err = store.GetWoWLogFilesByGroupID(ctx, logID)
	require.NoError(t, err)
	require.True(t, files[0].StorageDeletedAt.Valid)
}

type failingRemoveStorage struct {
	storage.ObjectStorage
	err   error
	calls int
}

func (s *failingRemoveStorage) RemoveFile(context.Context, string, []string) ([]storage.FileUploadResponse, error) {
	s.calls++
	return nil, s.err
}

func insertExpiredRawLogFixture(t *testing.T, ctx context.Context, store database.Store) uuid.UUID {
	t.Helper()
	now := time.Now()
	ownerID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: ownerID, Username: "raw-retention-" + ownerID.String(), Email: ownerID.String() + "@example.com",
		CreatedAt: database.Timestamptz(now), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	_, err = store.UpdateUserRawLogRetentionHours(ctx, database.UpdateUserRawLogRetentionHoursParams{
		ID: ownerID, RawLogRetentionHours: pgtype.Int4{Int32: 1, Valid: true},
	})
	require.NoError(t, err)

	logID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logID, Owner: ownerID, LogType: database.LogTypeAzerothcore,
		CreatedAt: database.Timestamptz(now.Add(-2 * time.Hour)), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	_, err = store.InsertLogFile(ctx, database.InsertLogFileParams{
		ID: uuid.New(), Owner: ownerID, WowLogID: logID, Hash: uuid.NewString(), SizeBytes: 1,
		MimeType: "text/plain", CreatedAt: database.Timestamptz(now.Add(-2 * time.Hour)), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	return logID
}
