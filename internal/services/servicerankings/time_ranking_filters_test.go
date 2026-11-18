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
	guildBest        bool
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
	s.guildBest = p.GuildBest
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
			for _, tc := range []struct {
				value string
				size  int32
			}{
				{value: "0", size: 0},
				{value: "1", size: 1},
				{value: "32767", size: 32767},
			} {
				t.Run("size="+tc.value, func(t *testing.T) {
					t.Parallel()
					store := &timeRankingFilterStore{}
					rec := httptest.NewRecorder()
					handler(store, rec, httptest.NewRequest(http.MethodGet, "/?instance_name=Lower+Tower+of+Karazhan&encounter_name=Brood+Queen+Araxxna&difficulty_name=&max_players="+tc.value+"&limit=50&offset=0", nil))
					require.Equal(t, http.StatusOK, rec.Code)
					require.Equal(t, 1, store.calls)
					require.True(t, store.filterDifficulty)
					require.Empty(t, store.difficulty)
					require.True(t, store.filterMaxPlayers)
					require.Equal(t, tc.size, store.maxPlayers)
				})
			}
			for _, value := range []string{"", "-1", "bad", "1.5", "32768"} {
				store := &timeRankingFilterStore{}
				rec := httptest.NewRecorder()
				handler(store, rec, httptest.NewRequest(http.MethodGet, "/?instance_name=Raid&max_players="+value, nil))
				require.Equal(t, http.StatusBadRequest, rec.Code, value)
				require.Zero(t, store.calls)
			}
		})
	}
}

func TestKillTimeLeaderboardBoard(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		query     string
		status    int
		guildBest bool
	}{
		{query: "", status: http.StatusOK},
		{query: "&board=all", status: http.StatusOK},
		{query: "&board=guild", status: http.StatusOK, guildBest: true},
		{query: "&board=bad", status: http.StatusBadRequest},
	} {
		store := &timeRankingFilterStore{}
		rec := httptest.NewRecorder()
		handleKillTimeLeaderboardWithStore(store, rec, httptest.NewRequest(http.MethodGet, "/?instance_name=Raid&encounter_name=Boss"+tc.query, nil))
		require.Equal(t, tc.status, rec.Code, tc.query)
		require.Equal(t, tc.guildBest, store.guildBest, tc.query)
	}
}
