package chronicle

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbstatic"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/stretchr/testify/require"
)

// This exercises the actual worker factory, durable River handoff and primary
// finalizer against a disposable database and local object-store adapter. The
// separate process tests cover process isolation; this covers worker wiring.
func TestNativeWorkerDurableFinalizePipeline(t *testing.T) {
	// Environment selection is process-wide; these cases must not run in parallel.
	for _, label := range []string{"", "local-pipeline"} {
		name := "exact"
		if label != "" {
			name = "development"
		}
		t.Run(name, func(t *testing.T) {
			t.Setenv(version.ParserDevelopmentIdentityEnv, label)
			testNativeWorkerDurableFinalizePipeline(t)
		})
	}
}

func testNativeWorkerDurableFinalizePipeline(t *testing.T) {
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	db := database.New(pool)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	local, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	objects := opaquePipelineStorage{ObjectStorage: local}
	client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{})
	require.NoError(t, err)
	owner := uuid.New()
	_, err = db.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: owner.String()})
	require.NoError(t, err)
	now := database.Timestamptz(time.Now())
	group, err := db.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{ID: uuid.New(), Owner: owner, LogType: database.LogTypeV2, CreatedAt: now, UpdatedAt: now})
	require.NoError(t, err)
	require.NoError(t, db.UpdateWoWLogGroupFormatFlavor(ctx, database.UpdateWoWLogGroupFormatFlavorParams{ID: group.ID, Format: database.NullLogFormat{LogFormat: database.LogFormat112aCcAddon, Valid: true}, Flavor: database.ServerFlavor("turtle", database.FlavorVanilla).Strings()}))
	_, _, inputs := completeSessionFixture(t, true)
	payload := strings.Join(inputs, "\n")
	file, err := db.InsertLogFile(ctx, database.InsertLogFileParams{ID: uuid.New(), Owner: owner, WowLogID: group.ID, Hash: "fixture", MimeType: "text/plain", SizeBytes: int64(len(payload)), CreatedAt: now, UpdatedAt: now})
	require.NoError(t, err)
	_, err = objects.UploadFile(ctx, BucketRaidLogs, "logs/"+file.ID.String(), strings.NewReader(payload))
	require.NoError(t, err)
	resolved, err := ResolveNativeParseDataset(ctx, db, dbstatic.RealmUnknown(), false)
	require.NoError(t, err)
	require.NoError(t, db.UpsertDatasetTalentTrees(ctx, database.UpsertDatasetTalentTreesParams{DatasetID: resolved.DatasetID, Data: []byte(`{}`)}))
	identity, err := version.ParserCompatibilityIdentity()
	require.NoError(t, err)
	admissions, releases := 0, 0
	var admittedContext context.Context
	worker, err := NewHeadlessParseWorker(HeadlessParseOptions{Pool: pool, Storage: objects, Logger: logger, BinaryIdentity: identity, Admit: func(ctx context.Context, _ string) (context.Context, context.CancelFunc, error) {
		admissions++
		child, cancel := context.WithCancel(ctx)
		admittedContext = child
		return child, func() { releases++; cancel() }, nil
	}})
	require.NoError(t, err)
	args := ArgsNativeLogParse{ArgsLogParse: ArgsLogParse{LogID: group.ID, ParseGeneration: group.ParseGeneration, RealmID: dbstatic.RealmUnknown(), ParserEngine: chroniclesdk.ParserEngineNext, Verbose: true}, BinaryIdentity: identity, RequestID: uuid.New()}
	wrongBuild := args
	wrongBuild.BinaryIdentity = "not-the-producing-executable"
	require.Error(t, worker.Work(ctx, &river.Job[ArgsNativeLogParse]{Args: wrongBuild}))
	_, err = db.GetParserHandoff(ctx, group.ID)
	require.Error(t, err, "wrong-build producer must not claim or create durable state")
	require.NoError(t, worker.Work(ctx, &river.Job[ArgsNativeLogParse]{Args: args}))
	head, err := db.GetParserHandoff(ctx, group.ID)
	require.NoError(t, err)
	require.Equal(t, int64(1), head.HeadIteration)
	require.Zero(t, head.PublishedIteration)
	accepted, err := db.GetParserCheckpointAttempt(ctx, database.GetParserCheckpointAttemptParams{LogGroupID: group.ID, AttemptID: head.HeadAttemptID.UUID})
	require.NoError(t, err)
	checkpointBytes, err := objects.DownloadFile(ctx, BucketRaidLogs, accepted.ObjectKey)
	require.NoError(t, err)
	checkpoint, err := DecodeNativeCheckpoint(checkpointBytes)
	require.NoError(t, err)
	require.Equal(t, "COMPLETE/preFinalize", checkpoint.Boundary)
	require.Equal(t, identity, checkpoint.Identity.BuildIdentity)
	require.NotEmpty(t, checkpoint.Snapshot)
	_, err = db.GetParsedLogGroupByID(ctx, group.ID)
	require.Error(t, err, "producer must not stage or delete serving output")
	jobs, err := client.JobList(ctx, river.NewJobListParams().Kinds(KindFinalizeLogParse))
	require.NoError(t, err)
	require.Len(t, jobs.Jobs, 1)
	var finalizeArgs ArgsFinalizeLogParse
	require.NoError(t, json.Unmarshal(jobs.Jobs[0].EncodedArgs, &finalizeArgs))
	require.Equal(t, identity, finalizeArgs.BinaryIdentity)
	require.Equal(t, head.HeadAttemptID.UUID, finalizeArgs.AttemptID)
	resolved, err = ResolveNativeParseDataset(ctx, db, dbstatic.RealmUnknown(), false)
	require.NoError(t, err)
	gameDB, err := gamedb.New(ctx, gamedb.Options{Pool: pool, DB: db, DatasetID: resolved.DatasetID, Talents: talents.NewFetcher(db, nil, 1)})
	require.NoError(t, err)
	t.Cleanup(func() { _ = gameDB.Close() })
	primary := &Chronicle{registryByFlavor: make(map[string]*registry.Registry), Zed: authz.NewDatabaseOnly(logger, db), Storage: objects, logger: logger, WoWDB: gameDB, ItemFetcher: gameDB, metrics: newLogParseMetrics(nil), resolveParseDataset: ResolveNativeParseDataset, queue: &riverqueue.Queues{Client: client}}
	wrongFinalize := finalizeArgs
	wrongFinalize.BinaryIdentity = "not-the-producing-executable"
	require.Error(t, primary.NewWorkerFinalizeLogParse().Work(ctx, &river.Job[ArgsFinalizeLogParse]{JobRow: jobs.Jobs[0], Args: wrongFinalize}))
	rejected, err := db.GetParserHandoff(ctx, group.ID)
	require.NoError(t, err)
	require.Zero(t, rejected.PublishedIteration)
	require.False(t, rejected.PublicationToken.Valid)
	_, err = db.GetParsedLogGroupByID(ctx, group.ID)
	require.Error(t, err, "wrong-build finalizer must not stage serving output")
	require.NoError(t, primary.NewWorkerFinalizeLogParse().Work(ctx, &river.Job[ArgsFinalizeLogParse]{JobRow: jobs.Jobs[0], Args: finalizeArgs}))
	published, err := db.GetParserHandoff(ctx, group.ID)
	require.NoError(t, err)
	require.Equal(t, head.HeadIteration, published.PublishedIteration)
	require.False(t, published.PublicationToken.Valid)
	_, err = db.GetParsedLogGroupByID(ctx, group.ID)
	require.NoError(t, err)
	instances, err := db.GetInstancesByLogGroupID(ctx, group.ID)
	require.NoError(t, err)
	require.NotEmpty(t, instances, "finalizer must publish fixture encounters, not merely advance metadata")
	artifacts, err := db.ListLogGroupArtifacts(ctx, group.ID)
	require.NoError(t, err)
	require.Len(t, artifacts, 1)
	require.Equal(t, ArtifactKindParserSnapshot, artifacts[0].Kind)
	require.NotEqual(t, accepted.ObjectKey, artifacts[0].ObjectKey, "debug attachment must have a separate lifecycle from the durable head")
	download, err := objects.DownloadFile(ctx, BucketRaidLogs, artifacts[0].ObjectKey)
	require.NoError(t, err)
	debugReader, err := gzip.NewReader(bytes.NewReader(download))
	require.NoError(t, err)
	debugSnapshot, err := io.ReadAll(debugReader)
	require.NoError(t, err)
	require.NoError(t, debugReader.Close())
	require.JSONEq(t, string(checkpoint.Snapshot), string(debugSnapshot), "verbose download must preserve the exact accepted preFinalize snapshot")
	unchangedCheckpoint, err := objects.DownloadFile(ctx, BucketRaidLogs, accepted.ObjectKey)
	require.NoError(t, err)
	require.Equal(t, checkpointBytes, unchangedCheckpoint)
	// Redelivery must not delete/rewrite output or acquire new publication authority.
	require.NoError(t, primary.NewWorkerFinalizeLogParse().Work(ctx, &river.Job[ArgsFinalizeLogParse]{JobRow: jobs.Jobs[0], Args: finalizeArgs}))
	// An immutable raw append stays in this generation. Its replayed checkpoint
	// replaces instance IDs only at primary publication, retaining stable slugs.
	var appendPayload bytes.Buffer
	writer := gzip.NewWriter(&appendPayload)
	_, err = writer.Write([]byte("\n"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	require.NoError(t, primary.AppendServerLog(ctx, group, bytes.NewReader(appendPayload.Bytes()), dbstatic.RealmUnknown(), ServerLogAppendMeta{}))
	queued, err := client.JobList(ctx, river.NewJobListParams().Kinds(KindNativeLogParse))
	require.NoError(t, err)
	require.Len(t, queued.Jobs, 1)
	var appendArgs ArgsNativeLogParse
	require.NoError(t, json.Unmarshal(queued.Jobs[0].EncodedArgs, &appendArgs))
	require.Equal(t, args.ParseGeneration, appendArgs.ParseGeneration)
	require.NoError(t, worker.Work(ctx, &river.Job[ArgsNativeLogParse]{JobRow: queued.Jobs[0], Args: appendArgs}))
	pending, err := db.GetParserHandoff(ctx, group.ID)
	require.NoError(t, err)
	require.Equal(t, int64(2), pending.HeadIteration)
	require.Equal(t, int64(1), pending.PublishedIteration)
	stillPublished, err := db.GetInstancesByLogGroupID(ctx, group.ID)
	require.NoError(t, err)
	require.Equal(t, instances[0].ID, stillPublished[0].ID)
	finalizeArgs.AttemptID = pending.HeadAttemptID.UUID
	require.NoError(t, primary.NewWorkerFinalizeLogParse().Work(ctx, &river.Job[ArgsFinalizeLogParse]{JobRow: jobs.Jobs[0], Args: finalizeArgs}))
	replacement, err := db.GetInstancesByLogGroupID(ctx, group.ID)
	require.NoError(t, err)
	require.Len(t, replacement, len(instances))
	require.NotEqual(t, instances[0].ID, replacement[0].ID)
	require.Equal(t, instances[0].HashedSlug, replacement[0].HashedSlug)
	require.Equal(t, 2, admissions, "exactly one entry admission per parse job")
	require.Equal(t, 2, releases, "each admitted context is released exactly once")
	require.ErrorIs(t, admittedContext.Err(), context.Canceled)
	latest, err := db.GetParserCheckpointAttempt(ctx, database.GetParserCheckpointAttemptParams{LogGroupID: group.ID, AttemptID: pending.HeadAttemptID.UUID})
	require.NoError(t, err)
	// Ordinary raw retention preserves the continuation head and its metadata.
	require.NoError(t, primary.DeleteWoWLogGroupFiles(ctx, group.ID))
	_, err = objects.DownloadFile(ctx, BucketRaidLogs, latest.ObjectKey)
	require.NoError(t, err)
	_, err = db.GetParserCheckpointAttempt(ctx, database.GetParserCheckpointAttemptParams{LogGroupID: group.ID, AttemptID: latest.AttemptID})
	require.NoError(t, err)
	// Explicit deletion (also used by account purge) must not cascade metadata
	// until accepted-object deletion succeeds. The failed attempt stays retryable.
	primary.Storage = failAcceptedCheckpointDeletion{ObjectStorage: objects, key: latest.ObjectKey}
	require.ErrorContains(t, primary.DeleteWoWLogGroup(ctx, group.ID), "checkpoint delete unavailable")
	_, err = db.GetWoWLogGroupByID(ctx, group.ID)
	require.NoError(t, err)
	_, err = db.GetParserCheckpointAttempt(ctx, database.GetParserCheckpointAttemptParams{LogGroupID: group.ID, AttemptID: latest.AttemptID})
	require.NoError(t, err)
	primary.Storage = objects
	require.NoError(t, primary.DeleteWoWLogGroup(ctx, group.ID))
	for _, key := range []string{accepted.ObjectKey, latest.ObjectKey} {
		_, err = objects.DownloadFile(ctx, BucketRaidLogs, key)
		require.Error(t, err, "accepted checkpoint must not outlive explicit log deletion")
	}
	_, err = db.GetParserHandoff(ctx, group.ID)
	require.Error(t, err)
}

// Object-store keys are opaque: S3 permits both "logs/id" and "logs/id/parts/x".
// Encode keys for the filesystem adapter so it models that behavior rather than
// requiring a key to be both a filesystem file and a directory.
type opaquePipelineStorage struct{ storage.ObjectStorage }

func (s opaquePipelineStorage) UploadFile(ctx context.Context, bucket, key string, input io.Reader, options ...storage.FileOptions) (storage.FileUploadResponse, error) {
	return s.ObjectStorage.UploadFile(ctx, bucket, base64.RawURLEncoding.EncodeToString([]byte(key)), input, options...)
}
func (s opaquePipelineStorage) DownloadFile(ctx context.Context, bucket, key string, options ...storage.UrlOptions) ([]byte, error) {
	return s.ObjectStorage.DownloadFile(ctx, bucket, base64.RawURLEncoding.EncodeToString([]byte(key)), options...)
}
func (s opaquePipelineStorage) RemoveFile(ctx context.Context, bucket string, keys []string) ([]storage.FileUploadResponse, error) {
	encoded := make([]string, len(keys))
	for i, key := range keys {
		encoded[i] = base64.RawURLEncoding.EncodeToString([]byte(key))
	}
	return s.ObjectStorage.RemoveFile(ctx, bucket, encoded)
}
