package servicerankings

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

type timeRankingFilterStore struct {
	filterDifficulty bool
	difficulty       string
	filterMaxPlayers bool
	maxPlayers       int32
	calls            int
}

func (s *timeRankingFilterStore) record(d bool, name string, m bool, size int32) {
	s.filterDifficulty, s.difficulty, s.filterMaxPlayers, s.maxPlayers = d, name, m, size
	s.calls++
}
func (s *timeRankingFilterStore) RankingsKillTimeStats(_ context.Context, p database.RankingsKillTimeStatsParams) ([]database.RankingsKillTimeStatsRow, error) {
	s.record(p.FilterDifficulty, p.DifficultyName, p.FilterMaxPlayers, p.MaxPlayers)
	return nil, nil
}
func (s *timeRankingFilterStore) RankingsClearTimeStats(_ context.Context, p database.RankingsClearTimeStatsParams) ([]database.RankingsClearTimeStatsRow, error) {
	s.record(p.FilterDifficulty, p.DifficultyName, p.FilterMaxPlayers, p.MaxPlayers)
	return nil, nil
}
func (s *timeRankingFilterStore) RankingsKillTimeLeaderboard(_ context.Context, p database.RankingsKillTimeLeaderboardParams) ([]database.RankingsKillTimeLeaderboardRow, error) {
	s.record(p.FilterDifficulty, p.DifficultyName, p.FilterMaxPlayers, p.MaxPlayers)
	return nil, nil
}
func (s *timeRankingFilterStore) RankingsKillTimeTopPerEncounter(_ context.Context, p database.RankingsKillTimeTopPerEncounterParams) ([]database.RankingsKillTimeTopPerEncounterRow, error) {
	s.record(p.FilterDifficulty, p.DifficultyName, p.FilterMaxPlayers, p.MaxPlayers)
	return nil, nil
}
func TestTimeRankingEndpointsDifficultyFilters(t *testing.T) {
	t.Parallel()
	handlers := map[string]func(*timeRankingFilterStore, http.ResponseWriter, *http.Request){
		"kill stats": func(s *timeRankingFilterStore, w http.ResponseWriter, r *http.Request) {
			handleKillTimesWithStore(s, w, r)
		},
		"clear stats": func(s *timeRankingFilterStore, w http.ResponseWriter, r *http.Request) {
			handleClearTimesWithStore(s, w, r)
		},
		"leaderboard": func(s *timeRankingFilterStore, w http.ResponseWriter, r *http.Request) {
			handleKillTimeLeaderboardWithStore(s, w, r)
		},
		"top per boss": func(s *timeRankingFilterStore, w http.ResponseWriter, r *http.Request) {
			q := r.URL.Query()
			q.Set("encounter_names", "Boss")
			r.URL.RawQuery = q.Encode()
			handleKillTimeLeaderboardWithStore(s, w, r)
		},
	}
	for name, handler := range handlers {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			for _, tc := range []struct {
				name, query, difficulty string
				filtered                bool
			}{
				{name: "all"},
				{name: "normal", query: "&difficulty_name=", filtered: true},
				{name: "heroic", query: "&difficulty_name=heroic", difficulty: "heroic", filtered: true},
				{name: "variant", query: "&difficulty_name=challenge", difficulty: "challenge", filtered: true},
			} {
				t.Run(tc.name, func(t *testing.T) {
					store := &timeRankingFilterStore{}
					rec := httptest.NewRecorder()
					handler(store, rec, httptest.NewRequest(http.MethodGet, "/?instance_name=Raid&max_players=25"+tc.query, nil))
					require.Equal(t, http.StatusOK, rec.Code)
					require.Equal(t, 1, store.calls)
					require.Equal(t, tc.filtered, store.filterDifficulty)
					require.Equal(t, tc.difficulty, store.difficulty)
					require.True(t, store.filterMaxPlayers)
					require.Equal(t, int32(25), store.maxPlayers)
				})
			}
			store := &timeRankingFilterStore{}
			rec := httptest.NewRecorder()
			handler(store, rec, httptest.NewRequest(http.MethodGet, "/?instance_name=Raid", nil))
			require.Equal(t, http.StatusOK, rec.Code)
			require.False(t, store.filterMaxPlayers)
			for _, value := range []string{"", "0", "-1", "bad", "32768"} {
				store := &timeRankingFilterStore{}
				rec := httptest.NewRecorder()
				handler(store, rec, httptest.NewRequest(http.MethodGet, "/?instance_name=Raid&max_players="+value, nil))
				require.Equal(t, http.StatusBadRequest, rec.Code, value)
				require.Zero(t, store.calls)
			}
		})
	}
}
