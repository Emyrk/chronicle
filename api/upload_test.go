package api

import (
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestUserLogAppendMeta(t *testing.T) {
	t.Parallel()
	uploadID := uuid.New()
	meta, err := userLogAppendMeta(http.Header{
		"X-Chronicle-Upload-Id":      []string{uploadID.String()},
		"X-Chronicle-Chunk-Sequence": []string{"3"},
	})
	require.NoError(t, err)
	require.Equal(t, uploadID, meta.UploadID)
	require.Equal(t, int64(3), meta.SourceSequence.Int64)
	require.True(t, meta.SourceSequence.Valid)
}

func TestUserLogAppendMetaRequiresIdempotencyAndOrderingHeaders(t *testing.T) {
	t.Parallel()

	_, err := userLogAppendMeta(http.Header{"X-Chronicle-Chunk-Sequence": []string{"1"}})
	require.ErrorContains(t, err, "Upload-ID")

	_, err = userLogAppendMeta(http.Header{"X-Chronicle-Upload-Id": []string{uuid.NewString()}})
	require.ErrorContains(t, err, "Chunk-Sequence")
}
