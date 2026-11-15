package chronicle

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
)

func TestNativeCheckpointGCRetainsHead(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	f := newHandoffFixture(t, ctx)
	first, err := f.handoff.Accept(ctx, f.arg, f.enqueue)
	require.NoError(t, err)
	next := f.arg
	next.AttemptID = uuid.New()
	next.ObjectKey = "immutable/second"
	next.PredecessorIteration = first.Iteration
	next.PredecessorAttemptID = uuid.NullUUID{UUID: first.AttemptID, Valid: true}
	second, err := f.handoff.Accept(ctx, next, f.enqueue)
	require.NoError(t, err)
	fence := f.reserve(t, ctx, second)
	require.NoError(t, f.handoff.Publish(ctx, fence, true, func(context.Context, database.Store) error { return nil }))
	objects, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	for _, key := range []string{first.ObjectKey, second.ObjectKey} {
		_, err = objects.UploadFile(ctx, BucketRaidLogs, key, strings.NewReader("checkpoint"))
		require.NoError(t, err)
	}
	c := &Chronicle{Zed: authz.NewDatabaseOnly(slog.New(slog.NewTextHandler(io.Discard, nil)), f.db), Storage: objects}
	worker := c.NewWorkerNativeCheckpointGC().(*workerNativeCheckpointGC)
	worker.now = func() time.Time { return second.AcceptedAt.Time.Add(48 * time.Hour) }
	require.NoError(t, worker.Work(ctx, &river.Job[ArgsNativeCheckpointGC]{Args: ArgsNativeCheckpointGC{LogID: first.LogGroupID, Cursor: first.AttemptID}}))
	_, err = objects.DownloadFile(ctx, BucketRaidLogs, first.ObjectKey)
	require.Error(t, err)
	_, err = objects.DownloadFile(ctx, BucketRaidLogs, second.ObjectKey)
	require.NoError(t, err)
	require.Error(t, worker.Work(ctx, &river.Job[ArgsNativeCheckpointGC]{Args: ArgsNativeCheckpointGC{LogID: second.LogGroupID, Cursor: second.AttemptID}}))
	_, err = objects.DownloadFile(ctx, BucketRaidLogs, second.ObjectKey)
	require.NoError(t, err)
}
