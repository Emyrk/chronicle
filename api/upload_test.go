package api

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/database"
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

func TestClientUploadSource(t *testing.T) {
	t.Parallel()

	require.Equal(t, database.UploadSourceWeb, clientUploadSource(false))
	require.Equal(t, database.UploadSourceSidekick, clientUploadSource(true))
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

func TestForeverEventsArtifact(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name         string
		payload      string
		format       database.LogFormat
		missing      bool
		errorMessage string
	}{
		{name: "omitted", missing: true},
		{name: "unknown envelope", payload: ` {"schema_version":999,"kind":"future","extra":{"name":"名字","scouting_lua":"not parsed()"}} `},
		{name: "array", payload: `[1,true,null,{"unknown":"_"}]`},
		{name: "string", payload: `"anything"`},
		{name: "null", payload: `null`},
		{name: "boolean", payload: `false`},
		{name: "number", payload: `42`},
		{name: "empty object", payload: `{}`},
		{name: "malformed", payload: `{`, errorMessage: "Invalid Forever events JSON"},
		{name: "empty", errorMessage: "Invalid Forever events JSON"},
		{name: "multiple values", payload: `{} {}`, errorMessage: "Invalid Forever events JSON"},
		{name: "wrong format", payload: `{}`, format: database.LogFormat335aCcAddon, errorMessage: "only supported for v22-cleu"},
		{name: "at limit", payload: `"` + strings.Repeat("a", MaxLogArtifactSize-2) + `"`},
		{name: "over limit", payload: `"` + strings.Repeat("a", MaxLogArtifactSize-1) + `"`, errorMessage: "too large"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var body bytes.Buffer
			writer := multipart.NewWriter(&body)
			if !tc.missing {
				part, err := writer.CreateFormFile("forever_events", "forever-events-v1.json")
				require.NoError(t, err)
				_, err = io.WriteString(part, tc.payload)
				require.NoError(t, err)
			}
			require.NoError(t, writer.Close())
			req := httptest.NewRequest(http.MethodPost, "/", &body)
			req.Header.Set("Content-Type", writer.FormDataContentType())
			t.Cleanup(func() {
				if req.MultipartForm != nil {
					require.NoError(t, req.MultipartForm.RemoveAll())
				}
			})
			format := tc.format
			if format == "" {
				format = database.LogFormatV22Cleu
			}
			resp := httptest.NewRecorder()
			artifact, ok := foreverEventsArtifact(resp, req, format)
			if tc.errorMessage != "" {
				require.False(t, ok)
				require.Nil(t, artifact)
				require.Equal(t, http.StatusBadRequest, resp.Code)
				require.Contains(t, resp.Body.String(), tc.errorMessage)
				return
			}
			require.True(t, ok)
			if tc.missing {
				require.Nil(t, artifact)
				return
			}
			require.NotNil(t, artifact)
			require.Equal(t, chronicle.ArtifactKindForeverEvents, artifact.Kind)
			require.EqualValues(t, 1, artifact.SchemaVersion)
			require.Equal(t, "application/json", artifact.MimeType)
			require.Equal(t, "forever-events-v1.json", artifact.OriginalFilename)
			stored, err := io.ReadAll(artifact.Reader)
			require.NoError(t, err)
			require.Equal(t, tc.payload, string(stored))
		})
	}
}
