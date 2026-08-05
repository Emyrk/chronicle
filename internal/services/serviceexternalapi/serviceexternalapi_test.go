package serviceexternalapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestHealth(t *testing.T) {
	t.Parallel()

	service := &Service{}
	service.setupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "application/json; charset=utf-8", rec.Header().Get("Content-Type"))

	var response HealthResponse
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&response))
	require.Equal(t, HealthResponse{Status: "ok"}, response)
}

func TestOpenAPISpec(t *testing.T) {
	t.Parallel()

	service := &Service{}
	service.setupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/openapi.json", nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)

	var document OpenAPIDocument
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&document))
	require.Equal(t, "3.1.0", document.OpenAPI)
	require.Equal(t, "/api/external/v1", document.Servers[0].URL)
	health, ok := document.Paths["/health"]["get"]
	require.True(t, ok)
	require.Equal(t, "Check API health", health.Summary)
	require.Contains(t, health.Responses, "200")
}
