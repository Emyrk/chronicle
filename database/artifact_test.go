package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestLogGroupArtifactsLifecycle(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)

	ownerID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: ownerID, Username: "artifact-" + ownerID.String(), Email: ownerID.String() + "@example.com",
	})
	require.NoError(t, err)

	now := database.Timestamptz(time.Now())
	groupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: groupID, Owner: ownerID, LogType: database.LogTypeV2, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)

	artifactID := uuid.New()
	artifact, err := store.InsertLogGroupArtifact(ctx, database.InsertLogGroupArtifactParams{
		ID: artifactID, LogGroupID: groupID, Kind: "sidekick-storage", SchemaVersion: 1,
		Hash: "artifact-hash", SizeBytes: 123, MimeType: "text/plain", ObjectKey: "artifacts/test",
		CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	require.Equal(t, artifactID, artifact.ID)

	user, err := store.GetUserByID(ctx, ownerID)
	require.NoError(t, err)
	require.Equal(t, int64(123), user.ConsumedStorageBytes)

	artifacts, err := store.ListLogGroupArtifacts(ctx, groupID)
	require.NoError(t, err)
	require.Len(t, artifacts, 1)
	require.Equal(t, "sidekick-storage", artifacts[0].Kind)

	deletedAt := database.Timestamptz(time.Now().Add(time.Second))
	marked, err := store.MarkLogGroupArtifactsStorageDeleted(ctx, database.MarkLogGroupArtifactsStorageDeletedParams{
		StorageDeletedAt: deletedAt,
		LogGroupID:       groupID,
	})
	require.NoError(t, err)
	require.Len(t, marked, 1)
	require.True(t, marked[0].StorageDeletedAt.Valid)

	user, err = store.GetUserByID(ctx, ownerID)
	require.NoError(t, err)
	require.Zero(t, user.ConsumedStorageBytes)

	artifacts, err = store.ListLogGroupArtifacts(ctx, groupID)
	require.NoError(t, err)
	require.Empty(t, artifacts)

	allArtifacts, err := store.GetLogGroupArtifacts(ctx, groupID)
	require.NoError(t, err)
	require.Len(t, allArtifacts, 1)
	require.True(t, allArtifacts[0].StorageDeletedAt.Valid)

	fetched, err := store.GetLogGroupArtifact(ctx, database.GetLogGroupArtifactParams{LogGroupID: groupID, ID: artifactID})
	require.NoError(t, err)
	require.Equal(t, artifactID, fetched.ID)
	_, err = store.GetLogGroupArtifact(ctx, database.GetLogGroupArtifactParams{LogGroupID: uuid.New(), ID: artifactID})
	require.Error(t, err)

	secondID := uuid.New()
	_, err = store.InsertLogGroupArtifact(ctx, database.InsertLogGroupArtifactParams{
		ID: secondID, LogGroupID: groupID, Kind: "sidekick-storage", SchemaVersion: 1,
		Hash: "second-hash", SizeBytes: 456, MimeType: "text/plain", ObjectKey: "artifacts/second",
		CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	require.NoError(t, store.DeleteWoWLogGroup(ctx, groupID))

	artifacts, err = store.ListLogGroupArtifacts(ctx, groupID)
	require.NoError(t, err)
	require.Empty(t, artifacts)
}

func TestLogGroupArtifactsFollowFilePartOrder(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)

	ownerID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: ownerID, Username: "artifact-order-" + ownerID.String(), Email: ownerID.String() + "@example.com",
	})
	require.NoError(t, err)
	now := database.Timestamptz(time.Now())
	groupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: groupID, Owner: ownerID, LogType: database.LogTypeV2, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	fileID := uuid.New()
	_, err = store.InsertLogFile(ctx, database.InsertLogFileParams{
		ID: fileID, Owner: ownerID, Hash: uuid.NewString(), WowLogID: groupID,
		SizeBytes: 1, MimeType: "text/plain", CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)

	reservePart := func(sourceSequence int64) database.LogFilePart {
		var part database.LogFilePart
		require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
			if _, lockErr := tx.LockLogFilePartSequence(ctx, fileID); lockErr != nil {
				return lockErr
			}
			var reserveErr error
			part, reserveErr = tx.ReserveLogFilePart(ctx, database.ReserveLogFilePartParams{
				PartID: uuid.New(), LogFileID: fileID, UploadID: uuid.New(), ReservationID: uuid.New(),
				SourceSequence: pgtype.Int8{Int64: sourceSequence, Valid: true},
				ObjectKey:      "parts/" + uuid.NewString(),
			})
			return reserveErr
		}, nil))
		return part
	}
	partTwo := reservePart(2)
	partOne := reservePart(1)

	insertArtifact := func(id uuid.UUID, partID uuid.NullUUID, key string) error {
		_, insertErr := store.InsertLogGroupArtifact(ctx, database.InsertLogGroupArtifactParams{
			ID: id, LogGroupID: groupID, LogFilePartID: partID, Kind: "sidekick-storage", SchemaVersion: 2,
			Hash: uuid.NewString(), SizeBytes: 10, MimeType: "text/plain", ObjectKey: key,
			CreatedAt: now, UpdatedAt: now,
		})
		return insertErr
	}
	baseID, partOneArtifactID, partTwoArtifactID := uuid.New(), uuid.New(), uuid.New()
	require.NoError(t, insertArtifact(baseID, uuid.NullUUID{}, "artifacts/base"))
	require.NoError(t, insertArtifact(partTwoArtifactID, uuid.NullUUID{UUID: partTwo.ID, Valid: true}, "artifacts/two"))
	require.NoError(t, insertArtifact(partOneArtifactID, uuid.NullUUID{UUID: partOne.ID, Valid: true}, "artifacts/one"))

	otherGroupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: otherGroupID, Owner: ownerID, LogType: database.LogTypeV2, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	_, err = store.InsertLogGroupArtifact(ctx, database.InsertLogGroupArtifactParams{
		ID: uuid.New(), LogGroupID: otherGroupID,
		LogFilePartID: uuid.NullUUID{UUID: partOne.ID, Valid: true},
		Kind:          "sidekick-storage", SchemaVersion: 2, Hash: uuid.NewString(), SizeBytes: 10,
		MimeType: "text/plain", ObjectKey: "artifacts/cross-group", CreatedAt: now, UpdatedAt: now,
	})
	require.Error(t, err)

	ordered, err := store.ListLogGroupArtifactsForParse(ctx, groupID)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{baseID, partOneArtifactID, partTwoArtifactID}, []uuid.UUID{ordered[0].ID, ordered[1].ID, ordered[2].ID})

	err = insertArtifact(uuid.New(), uuid.NullUUID{UUID: partOne.ID, Valid: true}, "artifacts/duplicate")
	require.Error(t, err)
}
