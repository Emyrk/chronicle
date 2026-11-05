package chronicle

import (
	"bytes"
	"compress/gzip"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/storage"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
	"io"
	"testing"
)

func TestLoadRawLogFileWithParts(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	st, err := storage.NewLocalStorageAt(t.TempDir())
	require.NoError(t, err)
	fileID := uuid.New()
	file := database.LogFile{ID: fileID, ContentEncoding: pgtype.Text{String: "gzip", Valid: true}}
	parts := []database.LogFilePart{
		{ID: uuid.New(), ObjectKey: "logs/parts/1.gz", ContentEncoding: pgtype.Text{String: "gzip", Valid: true}},
		{ID: uuid.New(), ObjectKey: "logs/parts/2.gz", ContentEncoding: pgtype.Text{String: "gzip", Valid: true}},
	}
	uploadGzip := func(key, value string) {
		var buf bytes.Buffer
		zw := gzip.NewWriter(&buf)
		_, writeErr := io.WriteString(zw, value)
		require.NoError(t, writeErr)
		require.NoError(t, zw.Close())
		_, uploadErr := st.UploadFile(ctx, BucketRaidLogs, key, bytes.NewReader(buf.Bytes()))
		require.NoError(t, uploadErr)
	}
	uploadGzip("logs/"+fileID.String(), "base\n")
	uploadGzip(parts[0].ObjectKey, "one\n")
	uploadGzip(parts[1].ObjectKey, "two\n")

	reader, err := loadRawLogFileWithParts(ctx, st, file, parts)
	require.NoError(t, err)
	got, err := io.ReadAll(reader)
	require.NoError(t, err)
	require.Equal(t, "base\none\ntwo\n", string(got))
}
