package chronicle

import (
	"encoding/json"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

func TestParserEngineJobRoundTrip(t *testing.T) {
	t.Parallel()
	for _, engine := range []chroniclesdk.ParserEngine{"", chroniclesdk.ParserEngineLegacy, chroniclesdk.ParserEngineNext} {
		original := ArgsLogParse{ParserEngine: engine}
		data, err := json.Marshal(original)
		require.NoError(t, err)
		var restored ArgsLogParse
		require.NoError(t, json.Unmarshal(data, &restored))
		require.Equal(t, engine, restored.ParserEngine)
		reparse := ArgsLogReparse{ParserEngine: engine}
		data, err = json.Marshal(reparse)
		require.NoError(t, err)
		var retry ArgsLogReparse
		require.NoError(t, json.Unmarshal(data, &retry))
		require.Equal(t, engine, retry.ParserEngine)
	}
	var old ArgsLogParse
	require.NoError(t, json.Unmarshal([]byte(`{}`), &old))
	require.NoError(t, old.ParserEngine.Validate())
	require.NoError(t, old.ParserEngine.ValidateFormat(database.LogFormat112aSuperwowAddon))
	require.Error(t, chroniclesdk.ParserEngineNext.ValidateFormat(database.LogFormat112aSuperwowAddon))
	require.Error(t, chroniclesdk.ParserEngine("parsernext-vanilla").Validate())
}
func TestNormalWorkerRejectsInvalidEngineBeforeDependencies(t *testing.T) {
	t.Parallel()
	err := new(WorkerLogParse).Work(t.Context(), &river.Job[ArgsLogParse]{Args: ArgsLogParse{ParserEngine: "invalid"}})
	require.ErrorContains(t, err, "unsupported parser engine")
}
func TestNormalWorkerEngineIsPerJob(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, id := parseGenerationFixture(t, ctx)
	require.NoError(t, db.UpdateWoWLogGroupFormatFlavor(ctx, database.UpdateWoWLogGroupFormatFlavorParams{ID: id, Format: database.NullLogFormat{LogFormat: database.LogFormat112aSuperwowAddon, Valid: true}}))
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	c := &Chronicle{Zed: authz.NewDatabaseOnly(logger, db), logger: logger, metrics: newLogParseMetrics(nil)}
	worker := c.NewWorkerLogParse().(*WorkerLogParse)
	job := &river.Job[ArgsLogParse]{JobRow: &rivertype.JobRow{Attempt: 1, MaxAttempts: 5}, Args: ArgsLogParse{LogID: id, ParseGeneration: 1, ParserEngine: chroniclesdk.ParserEngineNext, Replacement: true}}
	for range 2 {
		require.ErrorContains(t, worker.Work(ctx, job), "does not support format")
	}
	require.Empty(t, worker.parserEngine, "job selection must not mutate shared worker")
	_, err := db.GetParsedLogGroupByID(ctx, id)
	require.Error(t, err)
}

func TestParserEngineDurableEnqueueAndReparse(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	db := database.New(pool)
	client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{})
	require.NoError(t, err)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	c := &Chronicle{Zed: authz.NewDatabaseOnly(logger, db), logger: logger, queue: &riverqueue.Queues{Client: client}}
	owner := uuid.New()
	_, err = db.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: owner.String()})
	require.NoError(t, err)
	now := database.Timestamptz(time.Now())
	group, err := db.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{ID: uuid.New(), Owner: owner, LogType: database.LogTypeV2, CreatedAt: now, UpdatedAt: now})
	require.NoError(t, err)
	inserted, err := c.EnqueueParseLog(ctx, group, false, false, uuid.Nil, chroniclesdk.ParserEngineNext)
	require.NoError(t, err)
	var initial ArgsLogParse
	require.NoError(t, json.Unmarshal(inserted.Job.EncodedArgs, &initial))
	require.Equal(t, chroniclesdk.ParserEngineNext, initial.ParserEngine)
	retried, err := client.JobRetry(ctx, inserted.Job.ID)
	require.NoError(t, err)
	require.Equal(t, inserted.Job.EncodedArgs, retried.EncodedArgs)
	reparse, err := c.enqueueReParseLog(ctx, db, nil, group.ID, false, false, false, uuid.Nil, chroniclesdk.ParserEngineNext)
	require.NoError(t, err)
	var args ArgsLogReparse
	require.NoError(t, json.Unmarshal(reparse.Job.EncodedArgs, &args))
	require.Equal(t, chroniclesdk.ParserEngineNext, args.ParserEngine)
	worker := c.NewWorkerReLogParse()
	require.NoError(t, worker.Work(ctx, &river.Job[ArgsLogReparse]{JobRow: reparse.Job, Args: args}))
	jobs, err := c.ListLogGroupJobs(ctx, group.ID)
	require.NoError(t, err)
	found := false
	for _, job := range jobs.Jobs {
		if job.Kind != KindLogParse {
			continue
		}
		var got ArgsLogParse
		require.NoError(t, json.Unmarshal(job.EncodedArgs, &got))
		if got.ParseGeneration == args.ParseGeneration {
			require.Equal(t, chroniclesdk.ParserEngineNext, got.ParserEngine)
			require.True(t, got.Replacement)
			found = true
		}
	}
	require.True(t, found, "reparse must durably stage a native replacement parse")
	// A fresh request does not inherit an earlier attempt's selection.
	legacy, err := c.enqueueReParseLog(ctx, db, nil, group.ID, false, false, false, uuid.Nil)
	require.NoError(t, err)
	var fresh ArgsLogReparse
	require.NoError(t, json.Unmarshal(legacy.Job.EncodedArgs, &fresh))
	require.Empty(t, fresh.ParserEngine)
}
