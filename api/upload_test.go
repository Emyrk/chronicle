package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestWoWLogUploadRetired(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/raidlogs/logs/upload", nil)
	resp := httptest.NewRecorder()

	new(API).WoWLogUpload(resp, req)

	require.Equal(t, http.StatusGone, resp.Code)
	var body chroniclesdk.Response
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&body))
	require.Equal(t, "This upload endpoint has been retired.", body.Message)
	require.Equal(t, "Use /api/v1/raidlogs/logs/upload-v2 instead.", body.CallToAction)
}

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
