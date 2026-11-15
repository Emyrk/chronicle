package chronicle

import (
	"bytes"
	"compress/gzip"
	"errors"
	"io"
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestParserSnapshotReplacement(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, id := parseGenerationFixture(t, ctx)
	objects, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	c := &Chronicle{Zed: authz.NewDatabaseOnly(logger, db), Storage: objects, logger: logger}
	capture := func(w io.Writer) error { _, err := io.WriteString(w, `{"version":2}`); return err }
	require.NoError(t, c.storeParserSnapshot(ctx, id, 1, 101, capture))
	rows, err := db.ListLogGroupArtifacts(ctx, id)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	first := rows[0]
	require.Equal(t, ArtifactKindParserSnapshot, first.Kind)
	require.Equal(t, "gzip", first.ContentEncoding.String)
	require.Contains(t, first.OriginalFilename.String, "generation-1-job-101")
	data, err := objects.DownloadFile(ctx, BucketRaidLogs, first.ObjectKey)
	require.NoError(t, err)
	gz, err := gzip.NewReader(bytes.NewReader(data))
	require.NoError(t, err)
	raw, err := io.ReadAll(gz)
	require.NoError(t, err)
	require.NoError(t, gz.Close())
	require.JSONEq(t, `{"version":2}`, string(raw))
	require.ErrorContains(t, c.storeParserSnapshot(ctx, id, 1, 102, func(io.Writer) error { return errors.New("capture failed") }), "capture failed")
	require.ErrorContains(t, c.storeParserSnapshot(ctx, id, 2, 103, capture), "superseded")
	c.Storage = failingAppendUploadStorage{ObjectStorage: objects}
	require.Error(t, c.storeParserSnapshot(ctx, id, 1, 103, capture))
	c.Storage = objects
	rows, err = db.ListLogGroupArtifacts(ctx, id)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, first.ID, rows[0].ID)
	_, err = objects.DownloadFile(ctx, BucketRaidLogs, first.ObjectKey)
	require.NoError(t, err)
	require.NoError(t, c.storeParserSnapshot(ctx, id, 1, 104, capture))
	rows, err = db.ListLogGroupArtifacts(ctx, id)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.NotEqual(t, first.ID, rows[0].ID)
	require.Contains(t, rows[0].OriginalFilename.String, "job-104")
	_, err = db.GetLogGroupArtifact(ctx, database.GetLogGroupArtifactParams{LogGroupID: id, ID: first.ID})
	require.Error(t, err)
	_, err = objects.DownloadFile(ctx, BucketRaidLogs, first.ObjectKey)
	require.Error(t, err)
}
