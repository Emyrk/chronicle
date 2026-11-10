package chronicle

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/stretchr/testify/require"
)

func TestUserLogAppendQuotaError(t *testing.T) {
	t.Parallel()
	owner := database.ChronicleUser{ConsumedStorageBytes: 80, MaxStorageBytes: 100}

	require.NoError(t, userLogAppendQuotaError(owner, 20))
	err := userLogAppendQuotaError(owner, 21)
	require.ErrorIs(t, err, ErrUserStorageQuotaExceeded)
}

func TestAppendUserLogFreesStorageWithoutDeletingActiveGroup(t *testing.T) {
	t.Parallel()
	for _, failUpload := range []bool{false, true} {
		t.Run(fmt.Sprintf("upload_failure=%t", failUpload), func(t *testing.T) {
			t.Parallel()
			ctx := testutil.Context(t, testutil.WaitMedium)
			pool, _ := dbtestutil.NewPGXPool(t)
			store := database.New(pool)
			logger := slog.New(slog.NewTextHandler(io.Discard, nil))
			riverClient, err := river.NewClient(riverpgxv5.New(pool), &river.Config{})
			require.NoError(t, err)
			objectStorage, err := storage.NewLocalStorageAt(t.TempDir())
			require.NoError(t, err)
			chron := &Chronicle{
				Storage: objectStorage,
				logger:  logger,
				queue:   &riverqueue.Queues{Client: riverClient},
				Zed:     authz.NewDatabaseOnly(logger, store),
			}

			ownerID := uuid.New()
			_, err = store.InsertUser(ctx, database.InsertUserParams{
				ID: ownerID, Username: "append-cleanup-" + ownerID.String(), Email: ownerID.String() + "@example.com",
			})
			require.NoError(t, err)
			_, err = store.UpsertDataGrant(ctx, database.UpsertDataGrantParams{
				UserID: ownerID, Source: "append-cleanup-test", StorageBytes: 160,
			})
			require.NoError(t, err)
			owner, err := store.GetUserByID(ctx, ownerID)
			require.NoError(t, err)
			require.Greater(t, owner.MaxStorageBytes, int64(20))

			insertParsedLog := func(createdAt time.Time, storedBytes int64, uploadObject bool) (database.WoWLogGroup, uuid.UUID) {
				t.Helper()
				now := database.Timestamptz(createdAt)
				group, insertErr := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
					ID: uuid.New(), Owner: ownerID, LogType: database.LogTypeAzerothcoreClientside,
					Format:    database.NullLogFormat{LogFormat: database.LogFormat335aCcAddon, Valid: true},
					CreatedAt: now, UpdatedAt: now,
				})
				require.NoError(t, insertErr)
				fileID := uuid.New()
				_, insertErr = store.InsertLogFile(ctx, database.InsertLogFileParams{
					ID: fileID, Owner: ownerID, Hash: uuid.NewString(), WowLogID: group.ID,
					SizeBytes: storedBytes, MimeType: "application/gzip",
					CompressedSizeBytes: pgtype.Int8{Int64: storedBytes, Valid: true},
					ContentEncoding:     pgtype.Text{String: "gzip", Valid: true},
					CreatedAt:           now, UpdatedAt: now,
				})
				require.NoError(t, insertErr)
				require.NoError(t, store.InsertParsedLogGroup(ctx, group.ID))
				if uploadObject {
					_, insertErr = objectStorage.UploadFile(ctx, BucketRaidLogs, chron.logPath(fileID), bytes.NewReader([]byte("raw")))
					require.NoError(t, insertErr)
				}
				return group, fileID
			}

			// The active group is deliberately older. Cleanup must exclude it and delete
			// the next-oldest eligible group instead.
			activeGroup, activeFileID := insertParsedLog(time.Now().Add(-2*time.Hour), 10, false)
			cleanupGroup, cleanupFileID := insertParsedLog(time.Now().Add(-time.Hour), owner.MaxStorageBytes-20, true)

			var compressed bytes.Buffer
			gz := gzip.NewWriter(&compressed)
			_, err = gz.Write([]byte("10/30 12:00:00.000  SPELL_DAMAGE,append cleanup example\n"))
			require.NoError(t, err)
			require.NoError(t, gz.Close())
			require.Greater(t, int64(compressed.Len())+owner.MaxStorageBytes-10, owner.MaxStorageBytes)

			if failUpload {
				chron.Storage = failingAppendUploadStorage{ObjectStorage: objectStorage}
			}
			uploadID := uuid.New()
			report, err := chron.AppendUserLogWithCleanup(ctx, activeGroup, bytes.NewReader(compressed.Bytes()), nil, uuid.Nil, LogAppendMeta{
				UploadID: uploadID, SourceSequence: pgtype.Int8{Int64: 1, Valid: true},
			}, 5)
			if failUpload {
				require.ErrorContains(t, err, "injected upload failure")
				require.Equal(t, []uuid.UUID{cleanupGroup.ID}, report.DeletedLogIDs)
				return
			}
			require.NoError(t, err)

			require.Equal(t, []uuid.UUID{cleanupGroup.ID}, report.DeletedLogIDs)
			report, err = chron.AppendUserLogWithCleanup(ctx, activeGroup, bytes.NewReader(compressed.Bytes()), nil, uuid.Nil, LogAppendMeta{
				UploadID: uploadID, SourceSequence: pgtype.Int8{Int64: 1, Valid: true},
			}, 5)
			require.NoError(t, err)
			require.Nil(t, report, "idempotent retries did not perform cleanup")
			activeFile, err := store.GetLogFile(ctx, activeFileID)
			require.NoError(t, err)
			require.False(t, activeFile.StorageDeletedAt.Valid)
			cleanupFile, err := store.GetLogFile(ctx, cleanupFileID)
			require.NoError(t, err)
			require.True(t, cleanupFile.StorageDeletedAt.Valid)
			parts, err := store.ListFinalizedLogFileParts(ctx, activeFileID)
			require.NoError(t, err)
			require.Len(t, parts, 1)

		})
	}
}

func TestAppendUserLogPersistsArtifactIdempotently(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	riverClient, err := river.NewClient(riverpgxv5.New(pool), &river.Config{})
	require.NoError(t, err)
	queue := &riverqueue.Queues{Client: riverClient}
	objectStorage, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	chron := &Chronicle{
		Storage: objectStorage,
		logger:  logger,
		queue:   queue,
		Zed:     authz.NewDatabaseOnly(logger, store),
	}

	ownerID := uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{
		ID: ownerID, Username: "append-artifact-" + ownerID.String(), Email: ownerID.String() + "@example.com",
	})
	require.NoError(t, err)
	_, err = store.UpsertDataGrant(ctx, database.UpsertDataGrantParams{
		UserID: ownerID, Source: "test", StorageBytes: 1 << 20,
		Description: pgtype.Text{String: "test quota", Valid: true},
	})
	require.NoError(t, err)

	now := database.Timestamptz(time.Now())
	group, err := store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: uuid.New(), Owner: ownerID, LogType: database.LogTypeAzerothcoreClientside,
		Format:    database.NullLogFormat{LogFormat: database.LogFormat335aCcAddon, Valid: true},
		CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	fileID := uuid.New()
	_, err = store.InsertLogFile(ctx, database.InsertLogFileParams{
		ID: fileID, Owner: ownerID, Hash: uuid.NewString(), WowLogID: group.ID,
		SizeBytes: 10, MimeType: "text/plain;charset=UTF-8",
		CompressedSizeBytes: pgtype.Int8{Int64: 10, Valid: true},
		ContentEncoding:     pgtype.Text{String: "gzip", Valid: true},
		CreatedAt:           now, UpdatedAt: now,
	})
	require.NoError(t, err)

	var compressed bytes.Buffer
	gz := gzip.NewWriter(&compressed)
	_, err = gz.Write([]byte("10/30 12:00:00.000  SPELL_DAMAGE,example\n"))
	require.NoError(t, err)
	require.NoError(t, gz.Close())
	uploadID := uuid.New()
	artifactBytes := []byte("ChronicleSidekickBridgeWoTLKDB = { position_payload = {} }")
	artifact := func() *ArtifactInput {
		return &ArtifactInput{
			Kind: ArtifactKindSidekickStorage, SchemaVersion: 2,
			Reader: bytes.NewReader(artifactBytes), MimeType: "text/plain;charset=UTF-8",
			OriginalFilename: "ChronicleSidekickBridgeWoTLK.lua",
		}
	}

	err = chron.AppendUserLog(ctx, group, bytes.NewReader(compressed.Bytes()), artifact(), uuid.Nil, LogAppendMeta{
		UploadID: uploadID, SourceSequence: pgtype.Int8{Int64: 1, Valid: true},
	}, 5)
	require.NoError(t, err)

	parts, err := store.ListFinalizedLogFileParts(ctx, fileID)
	require.NoError(t, err)
	require.Len(t, parts, 1)
	artifacts, err := store.ListLogGroupArtifacts(ctx, group.ID)
	require.NoError(t, err)
	require.Len(t, artifacts, 1)
	require.Equal(t, parts[0].ID, artifacts[0].LogFilePartID.UUID)
	require.Equal(t, int64(len(artifactBytes)), artifacts[0].SizeBytes)
	storedArtifact, err := objectStorage.DownloadFile(ctx, BucketRaidLogs, artifacts[0].ObjectKey)
	require.NoError(t, err)
	require.Equal(t, artifactBytes, storedArtifact)

	err = chron.AppendUserLog(ctx, group, bytes.NewReader(compressed.Bytes()), artifact(), uuid.Nil, LogAppendMeta{
		UploadID: uploadID, SourceSequence: pgtype.Int8{Int64: 1, Valid: true},
	}, 5)
	require.NoError(t, err)
	artifacts, err = store.ListLogGroupArtifacts(ctx, group.ID)
	require.NoError(t, err)
	require.Len(t, artifacts, 1)

	owner, err := store.GetUserByID(context.Background(), ownerID)
	require.NoError(t, err)
	require.Equal(t, int64(10+compressed.Len()+len(artifactBytes)), owner.ConsumedStorageBytes)
}

type failingAppendUploadStorage struct{ storage.ObjectStorage }

func (s failingAppendUploadStorage) UploadFile(context.Context, string, string, io.Reader, ...storage.FileOptions) (storage.FileUploadResponse, error) {
	return storage.FileUploadResponse{}, errors.New("injected upload failure")
}
