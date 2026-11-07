package api

import (
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAdminLeaderboardQueuesRequiresTenant(t *testing.T) {
	t.Parallel()
	for _, query := range []string{"", "?tenant_id=invalid", "?tenant_id=00000000-0000-0000-0000-000000000000"} {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/leaderboard-queues"+query, nil)
		rec := httptest.NewRecorder()
		(&API{}).AdminLeaderboardQueues(rec, req)
		require.Equal(t, http.StatusBadRequest, rec.Code)
	}
}

func TestAdminLeaderboardQueuesUnavailableIsNotEmpty(t *testing.T) {
	t.Parallel()
	pool, _ := dbtestutil.NewPGXPool(t)
	pool.Close()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/leaderboard-queues?tenant_id="+uuid.NewString(), nil)
	rec := httptest.NewRecorder()
	(&API{Opts: &Options{Pool: pool}}).AdminLeaderboardQueues(rec, req)
	require.Equal(t, http.StatusInternalServerError, rec.Code)
}
