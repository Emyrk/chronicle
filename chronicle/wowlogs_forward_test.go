package chronicle

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestArgsForwardWoWLogsInsertOpts(t *testing.T) {
	t.Parallel()

	opts := (ArgsForwardWoWLogs{}).InsertOpts()
	require.Equal(t, riverqueue.QueueExternalUploads, opts.Queue)
	require.Equal(t, riverqueue.PriorityLow, opts.Priority)
	require.Equal(t, 1, opts.MaxAttempts)
	require.True(t, opts.UniqueOpts.ByArgs)
}

func TestWoWLogsServerName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		tenantName string
		tenantSlug string
		realmName  string
		want       string
		wantErr    string
	}{
		{name: "chromiecraft", tenantName: "ChromieCraft", realmName: "ChromieCraft", want: "Chromiecraft"},
		{name: "chromie slug", tenantName: "Wrath", tenantSlug: "chromie", realmName: "ChromieCraft", want: "Chromiecraft"},
		{name: "warmane icecrown", tenantName: "Warmane", realmName: "Icecrown", want: "Warmane_Icecrown"},
		{name: "warmane lordaeron", tenantName: "Warmane", realmName: "Lordaeron", want: "Warmane_Lordaeron"},
		{name: "warmane onyxia", tenantName: "Warmane", realmName: "Onyxia", want: "Warmane_Onyxia"},
		{name: "unsupported warmane realm", tenantName: "Warmane", realmName: "Blackrock", wantErr: "unsupported Warmane realm"},
		{name: "unsupported tenant", tenantName: "Turtle WoW", realmName: "Nordanaar", wantErr: "is not supported"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			tenant := database.Tenant{Name: tt.tenantName}
			if tt.tenantSlug != "" {
				tenant.Slug = pgtype.Text{String: tt.tenantSlug, Valid: true}
			}
			got, err := wowLogsServerName(tenant, database.WowServerRealm{Name: tt.realmName})
			if tt.wantErr != "" {
				require.ErrorContains(t, err, tt.wantErr)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestWoWLogsClientPreprocess(t *testing.T) {
	t.Parallel()

	const logContents = "1/1 00:00:00.000  TEST_EVENT\n"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/v5/uploader/preprocess", r.URL.Path)
		assert.Equal(t, "1", r.Header.Get(wowLogsNativeUploaderHeader))
		assert.Equal(t, "secret", r.Header.Get("X-API-Token"))
		assert.Equal(t, "chronicle-server", r.Header.Get("X-Socket-ID"))
		if !assert.NoError(t, r.ParseMultipartForm(2<<20)) {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		assert.Equal(t, "Warmane_Icecrown", r.FormValue("serverName"))
		assert.Equal(t, "true", r.FormValue("unlisted"))

		file, _, err := r.FormFile("logFile")
		if !assert.NoError(t, err) {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		defer file.Close()
		zipBytes, err := io.ReadAll(file)
		if !assert.NoError(t, err) {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		zipReader, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
		if !assert.NoError(t, err) || !assert.Len(t, zipReader.File, 1) {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		assert.Equal(t, "WoWCombatLog.txt", zipReader.File[0].Name)
		entry, err := zipReader.File[0].Open()
		if !assert.NoError(t, err) {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		defer entry.Close()
		contents, err := io.ReadAll(entry)
		if !assert.NoError(t, err) {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		assert.Equal(t, logContents, string(contents))

		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"preprocessId":42,"instances":[{"name":"Icecrown Citadel","startMs":1,"endMs":2,"lineStart":3,"lineEnd":4}],"autoQueued":false}`)
	}))
	defer server.Close()

	client := wowLogsClient{baseURL: server.URL, apiToken: "secret", httpClient: server.Client()}
	result, err := client.preprocess(context.Background(), []byte(logContents), "Warmane_Icecrown", true)
	require.NoError(t, err)
	require.Equal(t, 42, result.PreprocessID)
	require.Len(t, result.Instances, 1)
}

func TestWoWLogsClientEnqueue(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/api/v5/uploader/enqueue-jobs", r.URL.Path)
		assert.Equal(t, "1", r.Header.Get(wowLogsNativeUploaderHeader))
		assert.Equal(t, "secret", r.Header.Get("X-API-Token"))

		var body struct {
			PreprocessID      int               `json:"preprocessId"`
			SelectedInstances []wowLogsInstance `json:"selectedInstances"`
			SocketID          string            `json:"socketId"`
			Unlisted          bool              `json:"unlisted"`
		}
		if !assert.NoError(t, json.NewDecoder(r.Body).Decode(&body)) {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		assert.Equal(t, 42, body.PreprocessID)
		assert.Equal(t, "chronicle-server", body.SocketID)
		assert.True(t, body.Unlisted)
		assert.Len(t, body.SelectedInstances, 1)
		if len(body.SelectedInstances) == 1 {
			assert.True(t, body.SelectedInstances[0].Unlisted)
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	client := wowLogsClient{baseURL: server.URL, apiToken: "secret", httpClient: server.Client()}
	err := client.enqueue(context.Background(), wowLogsPreprocessResponse{
		PreprocessID: 42,
		Instances:    []wowLogsInstance{{Name: "Icecrown Citadel"}},
	}, true)
	require.NoError(t, err)
}
