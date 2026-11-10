package api

import (
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLeaderboardV2RejectsUnownedScopes(t *testing.T) {
	t.Parallel()
	// No pool: all these invalid scopes must fail before accessing evidence/config.
	api := &API{}
	for _, query := range []string{"", "?tenant=someone", "?tenant_id=someone", "?dataset=someone", "?projection_version=2", "?algorithm_version=2", "?view=boss-leaders&max_players=0", "?view=boss-leaders&max_players=0&metric=mana"} {
		t.Run(query, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequest(http.MethodGet, "/api/v1/leaderboards-v2"+query, nil)
			if query != "" {
				req = req.WithContext(servicetenant.WithTenant(req.Context(), database.Tenant{ID: uuid.New()}))
			}
			rec := httptest.NewRecorder()
			api.LeaderboardV2(rec, req)
			require.Equal(t, http.StatusBadRequest, rec.Code)
		})
	}
}
