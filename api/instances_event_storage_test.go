package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestEventStreamRedirectURL(t *testing.T) {
	t.Parallel()

	_, ok := eventStreamRedirectURL("https://events.example.com", database.LogInstanceEvent{
		Storage: database.LogEventStorageDatabase,
		Events:  []byte("inline"),
	})
	require.False(t, ok)

	target, ok := eventStreamRedirectURL("https://events.example.com/base/", database.LogInstanceEvent{
		Storage:   database.LogEventStorageR2,
		ObjectKey: pgtype.Text{String: "events/group/instance/damage", Valid: true},
	})
	require.True(t, ok)
	require.Equal(t, "https://events.example.com/base/events/group/instance/damage", target)
}

func TestWriteInstanceEventDatabaseAndR2(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "/events/damage", nil)

	dbRecorder := httptest.NewRecorder()
	writeInstanceEvent(dbRecorder, req, database.LogInstanceEvent{
		Storage: database.LogEventStorageDatabase,
		Events:  []byte("inline"),
	}, "", true)
	require.Equal(t, http.StatusOK, dbRecorder.Code)
	require.Equal(t, "inline", dbRecorder.Body.String())
	require.Equal(t, "application/octet-stream", dbRecorder.Header().Get("Content-Type"))
	require.Equal(t, "public, max-age=604800", dbRecorder.Header().Get("Cache-Control"))

	r2Recorder := httptest.NewRecorder()
	writeInstanceEvent(r2Recorder, req, database.LogInstanceEvent{
		Storage:   database.LogEventStorageR2,
		ObjectKey: pgtype.Text{String: "events/group/instance/damage", Valid: true},
	}, "https://events.example.com", true)
	require.Equal(t, http.StatusTemporaryRedirect, r2Recorder.Code)
	require.Equal(t, "https://events.example.com/events/group/instance/damage", r2Recorder.Header().Get("Location"))
}
