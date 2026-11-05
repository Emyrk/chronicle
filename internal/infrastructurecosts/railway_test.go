package infrastructurecosts

import (
	"context"
	"encoding/json"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRailwayClientVerifiedProjectUsageQuery(t *testing.T) {
	t.Parallel()
	var received graphqlRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer secret", r.Header.Get("Authorization"))
		require.NoError(t, json.NewDecoder(r.Body).Decode(&received))
		require.Contains(t, received.Query, "usage(workspaceId:$workspaceId")
		require.Contains(t, received.Query, "groupBy:[PROJECT_ID,SERVICE_ID]")
		require.Contains(t, received.Query, "includeDeleted:true")
		_, _ = w.Write([]byte(`{"data":{"usage":[{"measurement":"CPU_USAGE","value":2160,"tags":{"projectId":"p1","serviceId":"s1"}},{"measurement":"MEMORY_USAGE_GB","value":4320,"tags":{"projectId":"p1","serviceId":"s1"}},{"measurement":"NETWORK_TX_GB","value":2,"tags":{"projectId":"p1","serviceId":"s1"}},{"measurement":"DISK_USAGE_GB","value":43200,"tags":{"projectId":"p1","serviceId":"s1"}},{"measurement":"BACKUP_USAGE_GB","value":43200,"tags":{"projectId":"p1","serviceId":"s1"}},{"measurement":"CPU_USAGE","value":999,"tags":{"projectId":"other","serviceId":"x"}}],"projects":{"edges":[{"node":{"id":"p1","name":"Chronicle","services":{"edges":[{"node":{"id":"s1","name":"API"}}]}}}]}}}`))
	}))
	defer srv.Close()
	c := RailwayClient{HTTPClient: srv.Client(), Endpoint: srv.URL, Token: "secret", WorkspaceID: "w1", ProjectID: "p1"}
	start := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	usage, raw, err := c.Fetch(context.Background(), start, start.AddDate(0, 1, 0))
	require.NoError(t, err)
	require.NotEmpty(t, raw)
	require.Equal(t, "Chronicle", usage.ProjectName)
	require.Len(t, usage.Services, 1)
	require.Equal(t, int64(1_000_000), usage.Costs.CPUMicrodollars)
	require.Equal(t, int64(1_000_000), usage.Costs.MemoryMicrodollars)
	require.Equal(t, int64(100_000), usage.Costs.EgressMicrodollars)
	require.Equal(t, int64(150_000), usage.Costs.VolumeMicrodollars)
	require.Equal(t, int64(150_000), usage.Costs.BackupMicrodollars)
}

func TestRailwayPreviousPeriodRetainsTimeOfDay(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"data":{"workspace":{"customer":{"billingPeriod":{"start":"2026-03-31T12:34:56Z","end":"2026-04-30T12:34:56Z"}}}}}`))
	}))
	defer srv.Close()
	c := RailwayClient{HTTPClient: srv.Client(), Endpoint: srv.URL, WorkspaceID: "w"}
	start, end, err := c.PreviousPeriod(context.Background())
	require.NoError(t, err)
	require.Equal(t, "2026-02-28T12:34:56Z", start.Format(time.RFC3339))
	require.Equal(t, "2026-03-30T12:34:56Z", end.Format(time.RFC3339))
}
