package chronicle

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"os"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type trackingObjectStorage struct {
	storage.ObjectStorage
	downloads []string
}

func (s *trackingObjectStorage) DownloadFile(ctx context.Context, bucketID, filePath string, options ...storage.UrlOptions) ([]byte, error) {
	s.downloads = append(s.downloads, filePath)
	return s.ObjectStorage.DownloadFile(ctx, bucketID, filePath, options...)
}

func TestSidekickArtifactSourceLoadsSequentiallyAndSkipsMissing(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	local, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	tracked := &trackingObjectStorage{ObjectStorage: local}

	contents, err := os.ReadFile("../combatlog/parser/wotlk/sidekickstorage/testdata/realistic.lua")
	require.NoError(t, err)
	for _, key := range []string{"base.lua", "part-2.lua"} {
		_, err = local.UploadFile(ctx, BucketRaidLogs, key, bytes.NewReader(contents))
		require.NoError(t, err)
	}

	groupID := uuid.New()
	source := newSidekickArtifactSource(tracked, slog.New(slog.NewTextHandler(io.Discard, nil)), []database.LogGroupArtifact{
		{ID: uuid.New(), LogGroupID: groupID, Kind: "other-artifact", ObjectKey: "other.bin", SchemaVersion: 1},
		{ID: uuid.New(), LogGroupID: groupID, Kind: ArtifactKindSidekickStorage, ObjectKey: "base.lua", SchemaVersion: 2},
		{ID: uuid.New(), LogGroupID: groupID, Kind: ArtifactKindSidekickStorage, ObjectKey: "missing.lua", SchemaVersion: 2},
		{ID: uuid.New(), LogGroupID: groupID, Kind: ArtifactKindSidekickStorage, ObjectKey: "part-2.lua", SchemaVersion: 2},
	})

	first, err := source.Advance(ctx)
	require.NoError(t, err)
	require.NotEmpty(t, first)
	require.Equal(t, []string{"base.lua"}, tracked.downloads)

	second, err := source.Advance(ctx)
	require.NoError(t, err)
	require.NotEmpty(t, second)
	require.Equal(t, []string{"base.lua", "missing.lua", "part-2.lua"}, tracked.downloads)
	require.True(t, source.SawUnitPosition())
	require.True(t, source.SawUnitResources())

	_, err = source.Advance(ctx)
	require.ErrorIs(t, err, io.EOF)
}

func TestSidekickArtifactSourceRejectsCorruptArtifact(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	local, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	_, err = local.UploadFile(ctx, BucketRaidLogs, "corrupt.lua", bytes.NewBufferString("not lua"))
	require.NoError(t, err)

	source := newSidekickArtifactSource(local, slog.New(slog.NewTextHandler(io.Discard, nil)), []database.LogGroupArtifact{
		{ID: uuid.New(), LogGroupID: uuid.New(), Kind: ArtifactKindSidekickStorage, ObjectKey: "corrupt.lua", SchemaVersion: 2},
	})
	_, err = source.Advance(ctx)
	require.ErrorContains(t, err, "decode Sidekick storage artifact")
}
