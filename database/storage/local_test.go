package storage_test

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database/storage"
	"github.com/stretchr/testify/require"
)

func TestNewLocalStorageAt(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	st, err := storage.NewLocalStorageAt(dir)
	require.NoError(t, err)
	require.NotNil(t, st)

	ctx := context.Background()

	// Create a bucket and upload a file.
	_, err = st.CreateBucket(ctx, "test-bucket", storage.BucketOptions{})
	require.NoError(t, err)

	_, err = st.UploadFile(ctx, "test-bucket", "hello.txt", strings.NewReader("world"))
	require.NoError(t, err)

	// Download and verify.
	data, err := st.DownloadFile(ctx, "test-bucket", "hello.txt")
	require.NoError(t, err)
	require.Equal(t, "world", string(data))
}

func TestNewLocalStorageAt_CreatesDir(t *testing.T) {
	t.Parallel()

	dir := t.TempDir() + "/nested/path"
	st, err := storage.NewLocalStorageAt(dir)
	require.NoError(t, err)
	require.NotNil(t, st)

	// Verify we can use the nested path.
	ctx := context.Background()
	_, err = st.CreateBucket(ctx, "b", storage.BucketOptions{})
	require.NoError(t, err)

	_, err = st.UploadFile(ctx, "b", "f.txt", io.LimitReader(strings.NewReader("ok"), 2))
	require.NoError(t, err)
}
