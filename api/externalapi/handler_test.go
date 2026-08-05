package externalapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/externalapi"
	"github.com/stretchr/testify/require"
)

func TestHealth(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	externalapi.New().Routes().ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "application/json; charset=utf-8", rec.Header().Get("Content-Type"))

	var response externalapi.HealthResponse
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&response))
	require.Equal(t, externalapi.HealthResponse{Status: "ok"}, response)
}
