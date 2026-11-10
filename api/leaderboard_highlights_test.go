package api

import (
	"encoding/json"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/serviceratings"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestHighlightsRejectRootAndMultipleRealmSelection(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/leaderboards-v2/highlights", nil)
	rec := httptest.NewRecorder()
	(&API{}).LeaderboardHighlights(rec, req)
	require.Equal(t, 400, rec.Code)
	require.Empty(t, rec.Header().Get("Cache-Control"))
	require.Empty(t, rec.Header().Get("Cloudflare-CDN-Cache-Control"))
	require.Empty(t, rec.Header().Get("Cache-Tag"))
	req = httptest.NewRequest(http.MethodGet, "/api/v1/leaderboards-v2/highlights?realm_ids="+uuid.NewString()+","+uuid.NewString(), nil)
	req = req.WithContext(servicetenant.WithTenantID(req.Context(), uuid.New()))
	rec = httptest.NewRecorder()
	(&API{}).LeaderboardHighlights(rec, req)
	require.Equal(t, 200, rec.Code)
	require.Contains(t, rec.Body.String(), `"unsupported_scope"`)
	require.Equal(t, "public, max-age=60", rec.Header().Get("Cache-Control"))
	require.Contains(t, rec.Header().Get("Cloudflare-CDN-Cache-Control"), "stale-while-revalidate=30")
	require.Equal(t, "leaderboards", rec.Header().Get("Cache-Tag"))
	var out chroniclesdk.LeaderboardHighlightsResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	require.Empty(t, out.LandingPreviews)
}

func TestHighlightSnapshotStatesDoNotServeStalePolicy(t *testing.T) {
	t.Parallel()
	c := serviceratings.HighlightCohort{Instance: "Raid", Difficulty: "Normal", Size: 40}
	config := []database.ResolveLeaderboardConfigurationRow{{Kind: "instance", InstanceName: "Raid"}}
	out, refresh, err := highlightSnapshotResponse(config, []serviceratings.HighlightCohort{c}, nil)
	require.NoError(t, err)
	require.True(t, refresh)
	require.Equal(t, "not_prepared", out.Snapshots[0].Status)
	require.Empty(t, out.LandingPreviews)
	row := database.LeaderboardHighlight{InstanceName: c.Instance, DifficultyName: c.Difficulty, MaxPlayers: c.Size, ConfigurationFingerprint: "old", Payload: []byte(`{}`), RefreshedAt: database.Timestamptz(time.Now())}
	out, refresh, err = highlightSnapshotResponse(config, []serviceratings.HighlightCohort{c}, []database.LeaderboardHighlight{row})
	require.NoError(t, err)
	require.True(t, refresh)
	require.Equal(t, "rebuilding", out.Snapshots[0].Status)
	require.Empty(t, out.LandingPreviews)
	row.ConfigurationFingerprint = serviceratings.HighlightFingerprint(config, c)
	out, refresh, err = highlightSnapshotResponse(config, []serviceratings.HighlightCohort{c}, []database.LeaderboardHighlight{row})
	require.NoError(t, err)
	require.False(t, refresh)
	require.Equal(t, "empty", out.Snapshots[0].Status)
	require.Len(t, out.LandingPreviews, 1)
	row.RefreshedAt = database.Timestamptz(time.Now().Add(-2 * time.Hour))
	out, refresh, err = highlightSnapshotResponse(config, []serviceratings.HighlightCohort{c}, []database.LeaderboardHighlight{row})
	require.NoError(t, err)
	require.True(t, refresh)
	require.Equal(t, "stale", out.Snapshots[0].Status)
	require.Len(t, out.LandingPreviews, 1)

}

func TestHighlightsRepeatedRealmParametersNeverFallback(t *testing.T) {
	t.Parallel()
	for _, query := range []string{"realm=" + uuid.NewString() + "&realm=" + uuid.NewString(), "realm_ids=" + uuid.NewString() + "&realm_ids=" + uuid.NewString()} {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/leaderboards-v2/highlights?"+query, nil)
		req = req.WithContext(servicetenant.WithTenantID(req.Context(), uuid.New()))
		rec := httptest.NewRecorder()
		(&API{}).LeaderboardHighlights(rec, req)
		require.Equal(t, 200, rec.Code)
		require.Contains(t, rec.Body.String(), "unsupported_scope")
	}
}

func TestHighlightStalenessTwoHourBoundary(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	c := serviceratings.HighlightCohort{Instance: "Raid", Difficulty: "Normal", Size: 40}
	config := []database.ResolveLeaderboardConfigurationRow{{Kind: "instance", InstanceName: "Raid"}}
	for _, tc := range []struct {
		name   string
		age    time.Duration
		status string
	}{{"recent", time.Hour, "empty"}, {"before_boundary", 2*time.Hour - time.Nanosecond, "empty"}, {"boundary", 2 * time.Hour, "empty"}, {"after_boundary", 2*time.Hour + time.Nanosecond, "stale"}, {"older", 3 * time.Hour, "stale"}} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			row := database.LeaderboardHighlight{InstanceName: c.Instance, DifficultyName: c.Difficulty, MaxPlayers: c.Size, ConfigurationFingerprint: serviceratings.HighlightFingerprint(config, c), Payload: []byte(`{}`), RefreshedAt: database.Timestamptz(now.Add(-tc.age))}
			out, refresh, err := highlightSnapshotResponseAt(config, []serviceratings.HighlightCohort{c}, []database.LeaderboardHighlight{row}, now)
			require.NoError(t, err)
			require.Equal(t, tc.status, out.Snapshots[0].Status)
			require.Len(t, out.LandingPreviews, 1)
			require.Equal(t, tc.status == "stale", refresh)
			if tc.status == "stale" {
				require.Equal(t, "partial", out.Status)
			} else {
				require.Equal(t, "ready", out.Status)
			}
		})
	}
}
