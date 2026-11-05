package database_test

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func insertEventStorageFixture(t *testing.T, store database.Store, realmID uuid.UUID, backend database.LogEventStorage) (uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)
	ownerID, groupID, instanceID := uuid.New(), uuid.New(), uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "event-" + ownerID.String()[:8]})
	require.NoError(t, err)
	now := time.Now()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: groupID, Owner: ownerID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(now), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, groupID))
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: groupID, Name: "Event Test",
		Capabilities: []string{}, EventStorage: string(backend),
	})
	require.NoError(t, err)
	return ownerID, groupID, instanceID
}

func TestEventStorageAccountingAndInstanceDeletionOutbox(t *testing.T) {
	t.Parallel()
	_, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	ownerID, groupID, instanceID := insertEventStorageFixture(t, store, realmID, database.LogEventStorageR2)
	key := chronicle.EventStreamObjectKey(groupID, instanceID, database.LogInstanceEventTypeDamage)
	require.NoError(t, store.InsertLogInstanceEvents(ctx, []database.InsertLogInstanceEventsParams{{
		InstanceID: instanceID, Type: database.LogInstanceEventTypeDamage,
		Storage: database.LogEventStorageR2, ObjectKey: pgtype.Text{String: key, Valid: true}, SizeBytes: 123,
	}}).Close())

	usage, err := store.GetParsedBytesByOwner(ctx, ownerID)
	require.NoError(t, err)
	require.Equal(t, int64(123), usage.ParsedBytes)
	require.Equal(t, int64(1), usage.ParsedInstanceCount)

	_, err = store.DeleteLogInstanceByIDAndGroup(ctx, database.DeleteLogInstanceByIDAndGroupParams{ID: instanceID, LogGroupID: groupID})
	require.NoError(t, err)
	rows, err := store.ListEventObjectDeletionOutbox(ctx, 10)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, key, rows[0].ObjectKey)
}

func TestDatabaseEventRowsRemainReadable(t *testing.T) {
	t.Parallel()
	_, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	_, _, instanceID := insertEventStorageFixture(t, store, realmID, database.LogEventStorageDatabase)
	payload := []byte("legacy-inline-bytes")
	require.NoError(t, store.InsertLogInstanceEvents(ctx, []database.InsertLogInstanceEventsParams{{
		InstanceID: instanceID, Type: database.LogInstanceEventTypeDamage,
		Storage: database.LogEventStorageDatabase, Events: payload, SizeBytes: int64(len(payload)),
	}}).Close())

	event, err := store.InstanceEvent(ctx, database.InstanceEventParams{InstanceID: instanceID, Type: "damage"})
	require.NoError(t, err)
	require.Equal(t, database.LogEventStorageDatabase, event.Storage)
	require.Equal(t, payload, event.Events)
	require.False(t, event.ObjectKey.Valid)
}

func TestGroupDeletionEnqueuesEventObjects(t *testing.T) {
	t.Parallel()
	_, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	_, groupID, instanceID := insertEventStorageFixture(t, store, realmID, database.LogEventStorageR2)
	key := chronicle.EventStreamObjectKey(groupID, instanceID, database.LogInstanceEventTypeDamage)
	require.NoError(t, store.InsertLogInstanceEvents(ctx, []database.InsertLogInstanceEventsParams{{
		InstanceID: instanceID, Type: database.LogInstanceEventTypeDamage,
		Storage: database.LogEventStorageR2, ObjectKey: pgtype.Text{String: key, Valid: true}, SizeBytes: 4,
	}}).Close())

	require.NoError(t, store.DeleteWoWLogGroup(ctx, groupID))
	rows, err := store.ListEventObjectDeletionOutbox(ctx, 10)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, key, rows[0].ObjectKey)
}

func TestEventStoragePayloadConstraints(t *testing.T) {
	t.Parallel()
	_, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	_, _, instanceID := insertEventStorageFixture(t, store, realmID, database.LogEventStorageDatabase)

	err := store.InsertLogInstanceEvents(ctx, []database.InsertLogInstanceEventsParams{{
		InstanceID: instanceID, Type: database.LogInstanceEventTypeDamage,
		Storage: database.LogEventStorageDatabase, ObjectKey: pgtype.Text{String: "unexpected", Valid: true}, SizeBytes: 1,
	}}).Close()
	require.Error(t, err)

	err = store.InsertLogInstanceEvents(ctx, []database.InsertLogInstanceEventsParams{{
		InstanceID: instanceID, Type: database.LogInstanceEventTypeHeal,
		Storage: database.LogEventStorageR2, Events: []byte("unexpected"), SizeBytes: 10,
	}}).Close()
	require.Error(t, err)
}

type retryDeleteStorage struct {
	storage.ObjectStorage
	fail bool
}

func (s *retryDeleteStorage) RemoveFile(ctx context.Context, bucketID string, paths []string) ([]storage.FileUploadResponse, error) {
	if s.fail {
		return nil, errors.New("delete failed")
	}
	return s.ObjectStorage.RemoveFile(ctx, bucketID, paths)
}

func TestEventObjectDeletionWorkerRetriesAndIsIdempotent(t *testing.T) {
	t.Parallel()
	_, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	_, groupID, instanceID := insertEventStorageFixture(t, store, realmID, database.LogEventStorageR2)
	key := chronicle.EventStreamObjectKey(groupID, instanceID, database.LogInstanceEventTypeDamage)
	require.NoError(t, store.InsertLogInstanceEvents(ctx, []database.InsertLogInstanceEventsParams{{
		InstanceID: instanceID, Type: database.LogInstanceEventTypeDamage,
		Storage: database.LogEventStorageR2, ObjectKey: pgtype.Text{String: key, Valid: true}, SizeBytes: 3,
	}}).Close())
	_, err := store.DeleteLogInstanceByIDAndGroup(ctx, database.DeleteLogInstanceByIDAndGroupParams{ID: instanceID, LogGroupID: groupID})
	require.NoError(t, err)

	local, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	_, err = local.UploadFile(ctx, "", key, bytes.NewBufferString("abc"))
	require.NoError(t, err)
	retrying := &retryDeleteStorage{ObjectStorage: local, fail: true}
	worker := &chronicle.WorkerEventObjectDeletion{Store: store, Objects: retrying}
	require.Error(t, worker.Work(ctx, nil))
	rows, err := store.ListEventObjectDeletionOutbox(ctx, 10)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, int32(1), rows[0].Attempts)

	retrying.fail = false
	require.NoError(t, worker.Work(ctx, nil))
	require.NoError(t, worker.Work(ctx, nil))
	rows, err = store.ListEventObjectDeletionOutbox(ctx, 10)
	require.NoError(t, err)
	require.Empty(t, rows)
	_, err = local.DownloadFile(ctx, "", key)
	require.ErrorIs(t, err, storage.ErrFileNotFound)
}
