package servicerankings

import (
	"context"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSpeedrunUsesRankedTiming(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		value  string
		ranked bool
		valid  bool
	}{
		{name: "missing defaults to full raid", value: "", ranked: false, valid: true},
		{name: "full raid", value: "full", ranked: false, valid: true},
		{name: "boss time", value: "ranked", ranked: true, valid: true},
		{name: "invalid", value: "other", ranked: false, valid: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			ranked, valid := speedrunUsesRankedTiming(tt.value)
			assert.Equal(t, tt.ranked, ranked)
			assert.Equal(t, tt.valid, valid)
		})
	}
}

func TestSpeedrunLeaderboardRejectsInvalidBoard(t *testing.T) {
	t.Parallel()
	service := &Service{}
	response := httptest.NewRecorder()
	service.handleSpeedrunLeaderboard(response, httptest.NewRequest(http.MethodGet, "/speedrun?instance_name=Molten+Core&board=invalid", nil))
	assert.Equal(t, http.StatusBadRequest, response.Code)
	assert.Contains(t, response.Body.String(), "board query parameter must be guild or all")
}

func TestSpeedrunPagination(t *testing.T) {
	t.Parallel()
	for _, tt := range []struct {
		query         string
		limit, offset int64
		invalid       bool
	}{
		{query: "", limit: 50},
		{query: "limit=51&offset=50", limit: 51, offset: 50},
		{query: "limit=999", limit: 200},
		{query: "limit=0", invalid: true},
		{query: "limit=-1", invalid: true},
		{query: "limit=nope", invalid: true},
		{query: "offset=-1", invalid: true},
		{query: "offset=nope", invalid: true},
		{query: "offset=9223372036854775808", invalid: true},
	} {
		t.Run(tt.query, func(t *testing.T) {
			t.Parallel()
			request := httptest.NewRequest(http.MethodGet, "/speedrun?instance_name=Molten+Core&"+tt.query, nil)
			limit, offset, err := speedrunPagination(request)
			if tt.invalid {
				assert.Error(t, err)
				response := httptest.NewRecorder()
				(&Service{}).handleSpeedrunLeaderboard(response, request)
				assert.Equal(t, http.StatusBadRequest, response.Code)
				return
			}
			assert.NoError(t, err)
			assert.Equal(t, tt.limit, limit)
			assert.Equal(t, tt.offset, offset)
		})
	}
}

type speedrunPaginationStore struct {
	database.Store
	params database.SpeedrunLeaderboardParams
}

func (s *speedrunPaginationStore) SpeedrunLeaderboard(_ context.Context, params database.SpeedrunLeaderboardParams) ([]database.SpeedrunLeaderboardRow, error) {
	s.params = params
	return []database.SpeedrunLeaderboardRow{}, nil
}

func TestSpeedrunLeaderboardForwardsPagination(t *testing.T) {
	t.Parallel()
	for _, board := range []string{"guild", "all"} {
		t.Run(board, func(t *testing.T) {
			t.Parallel()
			store := &speedrunPaginationStore{}
			response := httptest.NewRecorder()
			(&Service{store: authz.NewDatabaseOnly(slog.Default(), store)}).handleSpeedrunLeaderboard(response,
				httptest.NewRequest(http.MethodGet, "/speedrun?instance_name=Molten+Core&board="+board+"&limit=51&offset=50", nil))
			assert.Equal(t, http.StatusOK, response.Code)
			assert.EqualValues(t, 51, store.params.ResultLimit)
			assert.EqualValues(t, 50, store.params.ResultOffset)
			assert.Equal(t, board == "all", store.params.AllRuns)
			assert.JSONEq(t, "[]", response.Body.String())
		})
	}
}
