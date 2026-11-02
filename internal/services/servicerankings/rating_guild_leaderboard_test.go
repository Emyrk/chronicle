package servicerankings

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

type guildLeaderboardStub struct {
	boss      *database.ListActiveGuildRatingBossScoresParams
	scope     *database.ListActiveGuildRatingScopeScoresParams
	bossRows  []database.GuildRatingBossScore
	scopeRows []database.GuildRatingScopeScore
}

func (s *guildLeaderboardStub) ListActiveGuildRatingBossScores(_ context.Context, p database.ListActiveGuildRatingBossScoresParams) ([]database.GuildRatingBossScore, error) {
	s.boss = &p
	return s.bossRows, nil
}
func (s *guildLeaderboardStub) ListActiveGuildRatingScopeScores(_ context.Context, p database.ListActiveGuildRatingScopeScoresParams) ([]database.GuildRatingScopeScore, error) {
	s.scope = &p
	return s.scopeRows, nil
}

func guildLeaderboardRequest(q url.Values, tenant uuid.UUID, boss bool, stub *guildLeaderboardStub) *httptest.ResponseRecorder {
	path := "/ratings/guild-scope-leaderboard"
	if boss {
		path = "/ratings/guild-boss-leaderboard"
	}
	req := httptest.NewRequest(http.MethodGet, path+"?"+q.Encode(), nil)
	if tenant != uuid.Nil {
		req = req.WithContext(servicetenant.WithTenantID(req.Context(), tenant))
	}
	rec := httptest.NewRecorder()
	if boss {
		handleGuildRatingBossLeaderboardWithStore(stub, rec, req)
	} else {
		handleGuildRatingScopeLeaderboardWithStore(stub, rec, req)
	}
	return rec
}

func TestGuildRatingLeaderboards(t *testing.T) {
	t.Parallel()
	group, tenant, guild := uuid.New(), uuid.New(), uuid.New()
	boss := url.Values{"group_id": {group.String()}, "instance_name": {"Molten Core"}, "encounter_name": {"Ragnaros"}, "difficulty_name": {""}, "max_players": {"40"}, "rating_metric": {"peak"}, "window_kind": {"period"}}
	scope := url.Values{"group_id": {group.String()}, "instance_name": {"Molten Core"}, "difficulty_name": {""}, "max_players": {"40"}, "rating_metric": {"peak"}, "window_kind": {"period"}}
	clone := func(q url.Values) url.Values {
		c := url.Values{}
		for k, v := range q {
			c[k] = append([]string(nil), v...)
		}
		return c
	}

	t.Run("exact boss, named tenant and guild-only output", func(t *testing.T) {
		t.Parallel()
		q := clone(boss)
		q.Set("limit", "100")
		stub := &guildLeaderboardStub{bossRows: []database.GuildRatingBossScore{{GuildID: guild, GroupID: group, Score: 88, BestRaw: pgtype.Float8{Float64: 0, Valid: true}}, {Score: 99}}}
		rec := guildLeaderboardRequest(q, tenant, true, stub)
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, database.ListActiveGuildRatingBossScoresParams{TenantID: tenant, GroupID: group, InstanceName: "Molten Core", EncounterName: "Ragnaros", DifficultyName: "", MaxPlayers: 40, RatingMetric: "peak", WindowKind: "period", LimitCount: 100}, *stub.boss)
		var result chroniclesdk.GuildRatingBossLeaderboardResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &result))
		require.Len(t, result.Entries, 1)
		require.Equal(t, guild, result.Entries[0].GuildID)
		require.Equal(t, 0.0, *result.Entries[0].BestRaw)
		require.Nil(t, result.Entries[0].Form)
	})
	t.Run("raid and global scopes", func(t *testing.T) {
		t.Parallel()
		for _, tc := range []struct {
			name, instance string
			tenant         uuid.UUID
		}{{"raid", "Molten Core", tenant}, {"global", "", uuid.Nil}} {
			t.Run(tc.name, func(t *testing.T) {
				t.Parallel()
				q := clone(scope)
				q.Set("instance_name", tc.instance)
				stub := &guildLeaderboardStub{scopeRows: []database.GuildRatingScopeScore{{GuildID: guild, Score: 42}, {Score: 99}}}
				rec := guildLeaderboardRequest(q, tc.tenant, false, stub)
				require.Equal(t, http.StatusOK, rec.Code)
				require.Equal(t, database.ListActiveGuildRatingScopeScoresParams{TenantID: tc.tenant, GroupID: group, InstanceName: tc.instance, DifficultyName: "", MaxPlayers: 40, RatingMetric: "peak", WindowKind: "period", LimitCount: 50}, *stub.scope)
				var result chroniclesdk.GuildRatingScopeLeaderboardResponse
				require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &result))
				require.Equal(t, tc.name, result.Scope)
				require.Len(t, result.Entries, 1)
				require.Equal(t, guild, result.Entries[0].GuildID)
			})
		}
	})
	t.Run("renown career", func(t *testing.T) {
		t.Parallel()
		q := clone(scope)
		q.Set("instance_name", "")
		q.Set("difficulty_name", "")
		q.Set("max_players", "0")
		q.Set("rating_metric", "renown")
		q.Set("window_kind", "career")
		stub := &guildLeaderboardStub{}
		require.Equal(t, http.StatusOK, guildLeaderboardRequest(q, tenant, false, stub).Code)
		require.Equal(t, "career", stub.scope.WindowKind)
	})
	for _, tc := range []struct {
		name, metric, window string
		boss                 bool
	}{
		{"boss all-time peak", "peak", "all_time", true},
		{"boss period mastery", "mastery", "period", true},
		{"boss period ranked mastery", "ranked_mastery", "period", true},
		{"boss career renown", "renown", "career", true},
		{"scope all-time peak", "peak", "all_time", false},
		{"scope period ranked mastery", "ranked_mastery", "period", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			q := clone(scope)
			if tc.boss {
				q = clone(boss)
			}
			q.Set("rating_metric", tc.metric)
			q.Set("window_kind", tc.window)
			stub := &guildLeaderboardStub{}
			rec := guildLeaderboardRequest(q, uuid.Nil, tc.boss, stub)
			require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
			if tc.boss {
				require.Equal(t, uuid.Nil, stub.boss.TenantID)
				require.Equal(t, tc.metric, stub.boss.RatingMetric)
				require.Equal(t, tc.window, stub.boss.WindowKind)
			} else {
				require.Equal(t, uuid.Nil, stub.scope.TenantID)
				require.Equal(t, tc.metric, stub.scope.RatingMetric)
				require.Equal(t, tc.window, stub.scope.WindowKind)
			}
		})
	}
	for _, tc := range []struct {
		name   string
		boss   bool
		change func(url.Values)
	}{
		{"missing group", true, func(q url.Values) { q.Del("group_id") }},
		{"missing encounter", true, func(q url.Values) { q.Del("encounter_name") }},
		{"missing difficulty", true, func(q url.Values) { q.Del("difficulty_name") }},
		{"invalid boss size", true, func(q url.Values) { q.Set("max_players", "32768") }},
		{"missing scope size", false, func(q url.Values) { q.Del("max_players") }},
		{"missing scope difficulty", false, func(q url.Values) { q.Del("difficulty_name") }},
		{"invalid scope instance", false, func(q url.Values) { q.Set("instance_name", " ") }},
		{"invalid metric", true, func(q url.Values) { q.Set("rating_metric", "other") }},
		{"invalid window", false, func(q url.Values) { q.Set("window_kind", "career") }},
		{"renown size mismatch", false, func(q url.Values) { q.Set("rating_metric", "renown") }},
		{"missing limit", true, func(q url.Values) { q.Set("limit", "0") }},
		{"over limit", false, func(q url.Values) { q.Set("limit", "101") }},
		{"player cohort", true, func(q url.Values) { q.Set("performance_metric", "dps") }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			q := clone(scope)
			if tc.boss {
				q = clone(boss)
			}
			tc.change(q)
			stub := &guildLeaderboardStub{}
			rec := guildLeaderboardRequest(q, tenant, tc.boss, stub)
			require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
			require.Nil(t, stub.boss)
			require.Nil(t, stub.scope)
		})
	}
}
