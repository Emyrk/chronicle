package api

import (
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
