package servicerankings

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type tenantLeaderboardStub struct {
	tenant, generation uuid.UUID
	calls              int
	changeAt           int
	guildBoss          []database.GuildTenantRatingBossScore
	guildScope         []database.GuildTenantRatingScopeScore
	playerBoss         []database.PlayerTenantRatingBossScore
	playerScope        []database.PlayerTenantRatingScopeScore
	params             []any
}

func (s *tenantLeaderboardStub) GetActiveTenantRatingGeneration(_ context.Context, tenant uuid.UUID) (uuid.UUID, error) {
	s.calls++
	if tenant != s.tenant {
		return uuid.Nil, nil
	}
	if s.changeAt > 0 && s.calls >= s.changeAt {
		return uuid.New(), nil
	}
	return s.generation, nil
}
func pageRows[T any](rows []T, limit int32, afterScore float64, afterRealm uuid.UUID, afterSubject string, key func(T) (float64, uuid.UUID, string)) []T {
	out := make([]T, 0)
	for _, row := range rows {
		score, realm, subject := key(row)
		if afterRealm != uuid.Nil && !(score < afterScore || score == afterScore && (realm.String() > afterRealm.String() || realm == afterRealm && subject > afterSubject)) {
			continue
		}
		out = append(out, row)
		if len(out) == int(limit) {
			break
		}
	}
	return out
}
func (s *tenantLeaderboardStub) ListActiveGuildTenantBossScores(_ context.Context, p database.ListActiveGuildTenantBossScoresParams) ([]database.GuildTenantRatingBossScore, error) {
	s.params = append(s.params, p)
	return pageRows(s.guildBoss, p.LimitCount, p.AfterScore, p.AfterRealmID, p.AfterGuildID.String(), func(row database.GuildTenantRatingBossScore) (float64, uuid.UUID, string) {
		return row.Score, row.RealmID, row.GuildID.String()
	}), nil
}
func (s *tenantLeaderboardStub) ListActiveGuildTenantScopeScores(_ context.Context, p database.ListActiveGuildTenantScopeScoresParams) ([]database.GuildTenantRatingScopeScore, error) {
	s.params = append(s.params, p)
	return pageRows(s.guildScope, p.LimitCount, p.AfterScore, p.AfterRealmID, p.AfterGuildID.String(), func(row database.GuildTenantRatingScopeScore) (float64, uuid.UUID, string) {
		return row.Score, row.RealmID, row.GuildID.String()
	}), nil
}
func (s *tenantLeaderboardStub) ListActivePlayerTenantBossScores(_ context.Context, p database.ListActivePlayerTenantBossScoresParams) ([]database.PlayerTenantRatingBossScore, error) {
	s.params = append(s.params, p)
	return pageRows(s.playerBoss, p.LimitCount, p.AfterScore, p.AfterRealmID, p.AfterPlayerGuid, func(row database.PlayerTenantRatingBossScore) (float64, uuid.UUID, string) {
		return row.Score, row.RealmID, row.PlayerGuid
	}), nil
}
func (s *tenantLeaderboardStub) ListActivePlayerTenantScopeScores(_ context.Context, p database.ListActivePlayerTenantScopeScoresParams) ([]database.PlayerTenantRatingScopeScore, error) {
	s.params = append(s.params, p)
	return pageRows(s.playerScope, p.LimitCount, p.AfterScore, p.AfterRealmID, p.AfterPlayerGuid, func(row database.PlayerTenantRatingScopeScore) (float64, uuid.UUID, string) {
		return row.Score, row.RealmID, row.PlayerGuid
	}), nil
}
func tenantRequest(q url.Values, tenant uuid.UUID, stub *tenantLeaderboardStub, guild, boss bool) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/ratings/tenant?"+q.Encode(), nil)
	req = req.WithContext(servicetenant.WithTenantID(req.Context(), tenant))
	w := httptest.NewRecorder()
	handleTenantRatingLeaderboardWithStore(stub, w, req, guild, boss)
	return w
}
func tenantBase(guild, boss bool) url.Values {
	q := url.Values{"instance_name": {"Molten Core"}, "difficulty_name": {""}, "max_players": {"40"}, "rating_metric": {"peak"}, "window_kind": {"period"}, "limit": {"1"}}
	if boss {
		q.Set("encounter_name", "Ragnaros")
	}
	if !guild {
		q.Set("class", "Warrior")
		q.Set("spec", "Fury")
		q.Set("sub_spec", "")
		q.Set("performance_metric", "dps")
	}
	return q
}
func TestTenantRatingLeaderboardTraversal(t *testing.T) {
	t.Parallel()
	tenant, gen, realm := uuid.New(), uuid.New(), uuid.New()
	guild1, guild2 := uuid.MustParse("00000000-0000-0000-0000-000000000001"), uuid.MustParse("00000000-0000-0000-0000-000000000002")
	for _, tc := range []struct {
		name        string
		guild, boss bool
	}{{"guild boss", true, true}, {"guild scope", true, false}, {"player boss", false, true}, {"player scope", false, false}} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			stub := &tenantLeaderboardStub{tenant: tenant, generation: gen, guildBoss: []database.GuildTenantRatingBossScore{{TenantID: tenant, GenerationID: gen, RealmID: realm, GuildID: guild1, Score: 42}, {TenantID: tenant, GenerationID: gen, RealmID: realm, GuildID: guild2, Score: 42}}, guildScope: []database.GuildTenantRatingScopeScore{{TenantID: tenant, GenerationID: gen, RealmID: realm, GuildID: guild1, Score: 42}, {TenantID: tenant, GenerationID: gen, RealmID: realm, GuildID: guild2, Score: 42}}, playerBoss: []database.PlayerTenantRatingBossScore{{TenantID: tenant, GenerationID: gen, RealmID: realm, PlayerGuid: "a", Score: 42}, {TenantID: tenant, GenerationID: gen, RealmID: realm, PlayerGuid: "b", Score: 42}}, playerScope: []database.PlayerTenantRatingScopeScore{{TenantID: tenant, GenerationID: gen, RealmID: realm, PlayerGuid: "a", Score: 42}, {TenantID: tenant, GenerationID: gen, RealmID: realm, PlayerGuid: "b", Score: 42}}}
			q := tenantBase(tc.guild, tc.boss)
			q.Set("realm_ids", realm.String())
			first := tenantRequest(q, tenant, stub, tc.guild, tc.boss)
			require.Equal(t, http.StatusOK, first.Code, first.Body.String())
			var result struct {
				NextCursor string            `json:"next_cursor"`
				Entries    []json.RawMessage `json:"entries"`
			}
			require.NoError(t, json.Unmarshal(first.Body.Bytes(), &result))
			require.Len(t, result.Entries, 1)
			require.NotEmpty(t, result.NextCursor)
			q.Set("cursor", result.NextCursor)
			second := tenantRequest(q, tenant, stub, tc.guild, tc.boss)
			require.Equal(t, http.StatusOK, second.Code, second.Body.String())
			result = struct {
				NextCursor string            `json:"next_cursor"`
				Entries    []json.RawMessage `json:"entries"`
			}{}
			require.NoError(t, json.Unmarshal(second.Body.Bytes(), &result))
			require.Len(t, result.Entries, 1)
			require.Empty(t, result.NextCursor)
			require.Len(t, stub.params, 4)
			switch p := stub.params[0].(type) {
			case database.ListActiveGuildTenantBossScoresParams:
				require.Equal(t, gen, p.GenerationID)
				require.Equal(t, tenant, p.TenantID)
				require.Equal(t, []uuid.UUID{realm}, p.RealmIds)
			case database.ListActiveGuildTenantScopeScoresParams:
				require.Equal(t, gen, p.GenerationID)
			case database.ListActivePlayerTenantBossScoresParams:
				require.Equal(t, "WARRIOR", p.PlayerClass)
				require.Equal(t, gen, p.GenerationID)
			case database.ListActivePlayerTenantScopeScoresParams:
				require.Equal(t, "WARRIOR", p.PlayerClass)
				require.Equal(t, gen, p.GenerationID)
			}
			q.Set("difficulty_name", "Heroic")
			require.Equal(t, http.StatusBadRequest, tenantRequest(q, tenant, stub, tc.guild, tc.boss).Code)
			q.Set("difficulty_name", "")
			require.Equal(t, http.StatusBadRequest, tenantRequest(q, uuid.New(), stub, tc.guild, tc.boss).Code)
			stub.generation = uuid.New()
			require.Equal(t, http.StatusConflict, tenantRequest(q, tenant, stub, tc.guild, tc.boss).Code)
		})
	}
}
func TestTenantRatingLeaderboardLimitHundred(t *testing.T) {
	t.Parallel()
	tenant, generation, realm := uuid.New(), uuid.New(), uuid.New()
	stub := &tenantLeaderboardStub{tenant: tenant, generation: generation}
	for i := 0; i < 101; i++ {
		stub.playerScope = append(stub.playerScope, database.PlayerTenantRatingScopeScore{
			TenantID: tenant, GenerationID: generation, RealmID: realm,
			PlayerGuid: strconv.Itoa(i + 100), Score: float64(101 - i),
		})
	}
	q := tenantBase(false, false)
	q.Set("limit", "100")
	first := tenantRequest(q, tenant, stub, false, false)
	require.Equal(t, http.StatusOK, first.Code, first.Body.String())
	var response chroniclesdk.TenantPlayerScopeLeaderboardResponse
	require.NoError(t, json.Unmarshal(first.Body.Bytes(), &response))
	require.Len(t, response.Entries, 100)
	require.NotEmpty(t, response.NextCursor)
	q.Set("cursor", response.NextCursor)
	second := tenantRequest(q, tenant, stub, false, false)
	require.Equal(t, http.StatusOK, second.Code, second.Body.String())
	response = chroniclesdk.TenantPlayerScopeLeaderboardResponse{}
	require.NoError(t, json.Unmarshal(second.Body.Bytes(), &response))
	require.Len(t, response.Entries, 1)
	require.Empty(t, response.NextCursor)
}

func TestTenantRatingLeaderboardValidationAndRace(t *testing.T) {
	t.Parallel()
	tenant, gen := uuid.New(), uuid.New()
	for _, tc := range []struct{ key, value string }{{"group_id", uuid.NewString()}, {"realm_ids", "bad"}, {"limit", "101"}, {"max_players", "0"}, {"rating_metric", "bad"}} {
		q := tenantBase(false, true)
		q.Set(tc.key, tc.value)
		stub := &tenantLeaderboardStub{tenant: tenant, generation: gen}
		require.Equal(t, http.StatusBadRequest, tenantRequest(q, tenant, stub, false, true).Code, tc.key)
		require.Zero(t, stub.calls)
	}
	for _, metric := range []string{"mastery", "ranked_mastery"} {
		q := tenantBase(false, false)
		q.Set("rating_metric", metric)
		q.Set("window_kind", "all_time")
		require.Equal(t, http.StatusOK, tenantRequest(q, tenant, &tenantLeaderboardStub{tenant: tenant, generation: gen}, false, false).Code, metric)
	}
	renown := tenantBase(false, false)
	renown.Set("rating_metric", "renown")
	renown.Set("performance_metric", "none")
	renown.Set("window_kind", "career")
	renown.Set("max_players", "0")
	renown.Del("class")
	renown.Del("spec")
	renown.Del("sub_spec")
	require.Equal(t, http.StatusOK, tenantRequest(renown, tenant, &tenantLeaderboardStub{tenant: tenant, generation: gen}, false, false).Code)
	malformed := tenantBase(false, false)
	malformed.Set("cursor", "not-a-cursor")
	require.Equal(t, http.StatusBadRequest, tenantRequest(malformed, tenant, &tenantLeaderboardStub{tenant: tenant, generation: gen}, false, false).Code)
	q := tenantBase(false, false)
	stub := &tenantLeaderboardStub{tenant: tenant, generation: gen, changeAt: 2}
	require.Equal(t, http.StatusConflict, tenantRequest(q, tenant, stub, false, false).Code)
	stub = &tenantLeaderboardStub{tenant: tenant, generation: gen, playerScope: []database.PlayerTenantRatingScopeScore{{TenantID: uuid.New(), GenerationID: gen, Score: 30}}}
	require.Equal(t, http.StatusInternalServerError, tenantRequest(q, tenant, stub, false, false).Code)
	empty := &tenantLeaderboardStub{tenant: tenant}
	rec := tenantRequest(q, tenant, empty, false, false)
	require.Equal(t, http.StatusOK, rec.Code)
	var result chroniclesdk.TenantPlayerScopeLeaderboardResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &result))
	require.Empty(t, result.Entries)
}
