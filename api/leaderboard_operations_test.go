package api

import (
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestParseLeaderboardOperation(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 11, 8, 1, 0, 0, 0, time.FixedZone("east", 2*3600))
	req := chroniclesdk.CreateLeaderboardOperationRequest{TenantID: uuid.New(), Purpose: "bootstrap", Scope: "tenant"}
	p, err := parseLeaderboardOperation(req, now)
	require.NoError(t, err)
	require.Equal(t, "2026-11-07", p.BeforeDate.Time.Format("2006-01-02"))
	for _, date := range []string{"2026-11-08", "invalid", "2026-02-30"} {
		req.BeforeDate = date
		_, err = parseLeaderboardOperation(req, now)
		require.Error(t, err)
	}
	req.BeforeDate = "2026-01-01"
	p, err = parseLeaderboardOperation(req, now)
	require.NoError(t, err)
	require.Equal(t, "2026-01-01", p.BeforeDate.Time.Format("2006-01-02"))
	req.Scope = "run"
	_, err = parseLeaderboardOperation(req, now)
	require.Error(t, err)
	id := uuid.New()
	req.RunID = &id
	_, err = parseLeaderboardOperation(req, now)
	require.NoError(t, err)
}

func TestLeaderboardMaintenanceRejectsRoot(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/leaderboards-v2/maintenance?tenant_id="+uuid.NewString(), nil)
	rec := httptest.NewRecorder()
	(&API{}).LeaderboardMaintenance(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}
