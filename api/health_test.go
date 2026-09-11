package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestHealthz(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	healthz(recorder, httptest.NewRequest(http.MethodGet, "/api/v1/healthz", nil))

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "no-store", recorder.Header().Get("Cache-Control"))
	require.Equal(t, "application/json; charset=utf-8", recorder.Header().Get("Content-Type"))
	require.JSONEq(t, `"OK"`, recorder.Body.String())
}
