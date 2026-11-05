package chronicle

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type failAfterUploadStorage struct {
	storage.ObjectStorage
	remaining int
}

func (s *failAfterUploadStorage) UploadFile(ctx context.Context, bucketID, key string, data io.Reader, opts ...storage.FileOptions) (storage.FileUploadResponse, error) {
	if s.remaining == 0 {
		return storage.FileUploadResponse{}, errors.New("upload failed")
	}
	s.remaining--
	return s.ObjectStorage.UploadFile(ctx, bucketID, key, data, opts...)
}

func TestEventStreamStorePrepareR2AndCompensate(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	local, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	store, err := NewEventStreamStore(database.LogEventStorageR2, local, slog.New(slog.NewTextHandler(io.Discard, nil)))
	require.NoError(t, err)
	groupID, instanceID := uuid.New(), uuid.New()

	params, cleanup, err := store.Prepare(ctx, groupID, instanceID, encounterevents.NewEvents())
	require.NoError(t, err)
	require.NotEmpty(t, params)
	for _, param := range params {
		require.Equal(t, database.LogEventStorageR2, param.Storage)
		require.Nil(t, param.Events)
		require.True(t, param.ObjectKey.Valid)
		require.Positive(t, param.SizeBytes)
		_, err := local.DownloadFile(ctx, "", param.ObjectKey.String)
		require.NoError(t, err)
	}

	cleanup()
	for _, param := range params {
		_, err := local.DownloadFile(ctx, "", param.ObjectKey.String)
		require.ErrorIs(t, err, storage.ErrFileNotFound)
	}
}

func TestEventStreamStoreCompensatesPartialUploadFailure(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	local, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	failing := &failAfterUploadStorage{ObjectStorage: local, remaining: 1}
	store, err := NewEventStreamStore(database.LogEventStorageR2, failing, slog.New(slog.NewTextHandler(io.Discard, nil)))
	require.NoError(t, err)
	groupID, instanceID := uuid.New(), uuid.New()

	_, _, err = store.Prepare(ctx, groupID, instanceID, encounterevents.NewEvents())
	require.ErrorContains(t, err, "upload event stream")
	firstKey := EventStreamObjectKey(groupID, instanceID, database.LogInstanceEventTypeDamage)
	_, err = local.DownloadFile(ctx, "", firstKey)
	require.ErrorIs(t, err, storage.ErrFileNotFound)
}
