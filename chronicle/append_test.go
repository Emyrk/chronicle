package chronicle

import (
	"bytes"
	"compress/gzip"
	"context"
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
	require.ErrorContains(t, err, "storage limit exceeded")
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
