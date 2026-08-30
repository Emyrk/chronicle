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
	characterLogs, ok := document.Paths["/characters/{server}/{realm}/{character}/instances"]["get"]
	require.True(t, ok)
	require.Len(t, characterLogs.Parameters, 5)
	require.Equal(t, "page_size", characterLogs.Parameters[4].Name)

	leaderboard, ok := document.Paths["/leaderboards/speedruns"]["get"]
	require.True(t, ok)
	require.Len(t, leaderboard.Parameters, 10)
	require.Equal(t, "instance_name", leaderboard.Parameters[0].Name)
	require.True(t, leaderboard.Parameters[0].Required)
	require.Equal(t, "timing", leaderboard.Parameters[1].Name)

	recent, ok := document.Paths["/raidlogs/recent"]["get"]
	require.True(t, ok)
	require.Equal(t, "List recent raid activity", recent.Summary)
	require.Len(t, recent.Parameters, 7)
	require.Equal(t, "after_date", recent.Parameters[0].Name)
	require.Equal(t, "page_size", recent.Parameters[6].Name)

	instance, ok := document.Paths["/raidlogs/instances/{slug}"]["get"]
	require.True(t, ok)
	require.Equal(t, "Get a raid instance", instance.Summary)
	require.Len(t, instance.Parameters, 1)
	require.Equal(t, "slug", instance.Parameters[0].Name)

	events, ok := document.Paths["/raidlogs/instances/{slug}/events/{type}"]["get"]
	require.True(t, ok)
	require.Equal(t, "Get a raid-instance event stream", events.Summary)
	require.Len(t, events.Parameters, 2)
	require.Contains(t, events.Responses["200"].Content, "application/octet-stream")

	health, ok := document.Paths["/health"]["get"]
	require.True(t, ok)
	require.Equal(t, "Check API health", health.Summary)
	require.Contains(t, health.Responses, "200")
}
