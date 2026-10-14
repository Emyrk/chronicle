package serviceazerothcore

import (
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestServerLogAppendMeta(t *testing.T) {
	t.Parallel()
	uploadID := uuid.New()
	header := http.Header{
		"X-Chronicle-Upload-Id":      []string{uploadID.String()},
		"X-Chronicle-Chunk-Sequence": []string{"42"},
	}
	meta, err := serverLogAppendMeta(header)
	require.NoError(t, err)
	require.Equal(t, uploadID, meta.UploadID)
	require.True(t, meta.SourceSequence.Valid)
	require.Equal(t, int64(42), meta.SourceSequence.Int64)
}

func TestServerLogAppendMetaRejectsInvalidHeaders(t *testing.T) {
	t.Parallel()
	_, err := serverLogAppendMeta(http.Header{"X-Chronicle-Upload-Id": []string{"invalid"}})
	require.ErrorContains(t, err, "Upload-ID")
	_, err = serverLogAppendMeta(http.Header{"X-Chronicle-Chunk-Sequence": []string{"0"}})
	require.ErrorContains(t, err, "Chunk-Sequence")
}
