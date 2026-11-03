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
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

type tenantLeaderboardStub struct {
	tenant, generation uuid.UUID
	calls              int
	changeAt           int
	guildBoss          []database.ListActiveGuildTenantBossScoresRow
	guildScope         []database.ListActiveGuildTenantScopeScoresRow
	playerBoss         []database.ListActivePlayerTenantBossScoresRow
	playerScope        []database.ListActivePlayerTenantScopeScoresRow
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
func (s *tenantLeaderboardStub) ListActiveGuildTenantBossScores(_ context.Context, p database.ListActiveGuildTenantBossScoresParams) ([]database.ListActiveGuildTenantBossScoresRow, error) {
	s.params = append(s.params, p)
	return pageRows(s.guildBoss, p.LimitCount, p.AfterScore, p.AfterRealmID, p.AfterGuildID.String(), func(row database.ListActiveGuildTenantBossScoresRow) (float64, uuid.UUID, string) {
		return row.Score, row.RealmID, row.GuildID.String()
	}), nil
}
func (s *tenantLeaderboardStub) ListActiveGuildTenantScopeScores(_ context.Context, p database.ListActiveGuildTenantScopeScoresParams) ([]database.ListActiveGuildTenantScopeScoresRow, error) {
	s.params = append(s.params, p)
	return pageRows(s.guildScope, p.LimitCount, p.AfterScore, p.AfterRealmID, p.AfterGuildID.String(), func(row database.ListActiveGuildTenantScopeScoresRow) (float64, uuid.UUID, string) {
		return row.Score, row.RealmID, row.GuildID.String()
	}), nil
}
func (s *tenantLeaderboardStub) ListActivePlayerTenantBossScores(_ context.Context, p database.ListActivePlayerTenantBossScoresParams) ([]database.ListActivePlayerTenantBossScoresRow, error) {
	s.params = append(s.params, p)
	return pageRows(s.playerBoss, p.LimitCount, p.AfterScore, p.AfterRealmID, p.AfterPlayerGuid, func(row database.ListActivePlayerTenantBossScoresRow) (float64, uuid.UUID, string) {
		return row.Score, row.RealmID, row.PlayerGuid
	}), nil
}
func (s *tenantLeaderboardStub) ListActivePlayerTenantScopeScores(_ context.Context, p database.ListActivePlayerTenantScopeScoresParams) ([]database.ListActivePlayerTenantScopeScoresRow, error) {
	s.params = append(s.params, p)
	return pageRows(s.playerScope, p.LimitCount, p.AfterScore, p.AfterRealmID, p.AfterPlayerGuid, func(row database.ListActivePlayerTenantScopeScoresRow) (float64, uuid.UUID, string) {
		return row.Score, row.RealmID, row.PlayerGuid
	}), nil
}
func (s *tenantLeaderboardStub) ListActiveAllClassPlayerTenantBossScores(_ context.Context, p database.ListActiveAllClassPlayerTenantBossScoresParams) ([]database.ListActiveAllClassPlayerTenantBossScoresRow, error) {
	s.params = append(s.params, p)
	rows := pageRows(s.playerBoss, p.LimitCount, p.AfterScore, p.AfterRealmID, p.AfterPlayerGuid, func(row database.ListActivePlayerTenantBossScoresRow) (float64, uuid.UUID, string) {
		return row.Score, row.RealmID, row.PlayerGuid
	})
	out := make([]database.ListActiveAllClassPlayerTenantBossScoresRow, len(rows))
	for i, row := range rows {
		out[i] = database.ListActiveAllClassPlayerTenantBossScoresRow(row)
	}
	return out, nil
}
func (s *tenantLeaderboardStub) ListActiveAllClassPlayerTenantScopeScores(_ context.Context, p database.ListActiveAllClassPlayerTenantScopeScoresParams) ([]database.ListActiveAllClassPlayerTenantScopeScoresRow, error) {
	s.params = append(s.params, p)
	rows := pageRows(s.playerScope, p.LimitCount, p.AfterScore, p.AfterRealmID, p.AfterPlayerGuid, func(row database.ListActivePlayerTenantScopeScoresRow) (float64, uuid.UUID, string) {
		return row.Score, row.RealmID, row.PlayerGuid
	})
	out := make([]database.ListActiveAllClassPlayerTenantScopeScoresRow, len(rows))
	for i, row := range rows {
		out[i] = database.ListActiveAllClassPlayerTenantScopeScoresRow(row)
	}
	return out, nil
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
			stub := &tenantLeaderboardStub{tenant: tenant, generation: gen, guildBoss: []database.ListActiveGuildTenantBossScoresRow{{TenantID: tenant, GenerationID: gen, RealmID: realm, GuildID: guild1, Score: 42}, {TenantID: tenant, GenerationID: gen, RealmID: realm, GuildID: guild2, Score: 42}}, guildScope: []database.ListActiveGuildTenantScopeScoresRow{{TenantID: tenant, GenerationID: gen, RealmID: realm, GuildID: guild1, Score: 42}, {TenantID: tenant, GenerationID: gen, RealmID: realm, GuildID: guild2, Score: 42}}, playerBoss: []database.ListActivePlayerTenantBossScoresRow{{TenantID: tenant, GenerationID: gen, RealmID: realm, PlayerGuid: "a", Score: 42}, {TenantID: tenant, GenerationID: gen, RealmID: realm, PlayerGuid: "b", Score: 42}}, playerScope: []database.ListActivePlayerTenantScopeScoresRow{{TenantID: tenant, GenerationID: gen, RealmID: realm, PlayerGuid: "a", Score: 42}, {TenantID: tenant, GenerationID: gen, RealmID: realm, PlayerGuid: "b", Score: 42}}}
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
func TestTenantScopeRequiresRaid(t *testing.T) {
	t.Parallel()
	tenant, generation := uuid.New(), uuid.New()
	for _, guild := range []bool{false, true} {
		for _, instance := range []string{"", "   "} {
			q := tenantBase(guild, false)
			q.Set("instance_name", instance)
			stub := &tenantLeaderboardStub{tenant: tenant, generation: generation}
			rec := tenantRequest(q, tenant, stub, guild, false)
			require.Equal(t, http.StatusBadRequest, rec.Code)
			require.Zero(t, stub.calls, "invalid raid cannot query generation")
		}
		q := tenantBase(guild, false)
		q.Del("instance_name")
		stub := &tenantLeaderboardStub{tenant: tenant, generation: generation}
		require.Equal(t, http.StatusBadRequest, tenantRequest(q, tenant, stub, guild, false).Code)
		require.Zero(t, stub.calls)

		q.Set("instance_name", "Molten Core")
		rec := tenantRequest(q, tenant, stub, guild, false)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var payload struct {
			Scope string `json:"scope"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &payload))
		require.Equal(t, "raid", payload.Scope)
	}
}

func TestTenantRatingLeaderboardDisplayNames(t *testing.T) {
	t.Parallel()
	tenant, generation, realm, guildID := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	name := func(s string) pgtype.Text { return pgtype.Text{String: s, Valid: true} }
	for _, tc := range []struct {
		guild, boss bool
	}{{false, true}, {false, false}, {true, true}, {true, false}} {
		stub := &tenantLeaderboardStub{
			tenant: tenant, generation: generation,
			playerBoss:  []database.ListActivePlayerTenantBossScoresRow{{TenantID: tenant, GenerationID: generation, RealmID: realm, PlayerGuid: "player", PlayerName: name("Hero"), GuildName: name("Raiders"), RealmName: "Realm", Score: 10}},
			playerScope: []database.ListActivePlayerTenantScopeScoresRow{{TenantID: tenant, GenerationID: generation, RealmID: realm, PlayerGuid: "player", RealmName: "Realm", Score: 10}},
			guildBoss:   []database.ListActiveGuildTenantBossScoresRow{{TenantID: tenant, GenerationID: generation, RealmID: realm, GuildID: guildID, GuildName: name("Raiders"), RealmName: "Realm", Score: 10}},
			guildScope:  []database.ListActiveGuildTenantScopeScoresRow{{TenantID: tenant, GenerationID: generation, RealmID: realm, GuildID: guildID, RealmName: "Realm", Score: 10}},
		}
		rec := tenantRequest(tenantBase(tc.guild, tc.boss), tenant, stub, tc.guild, tc.boss)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var response struct {
			Entries []map[string]any `json:"entries"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
		require.Len(t, response.Entries, 1)
		entry := response.Entries[0]
		require.Equal(t, "Realm", entry["realm_name"])
		if tc.guild {
			if tc.boss {
				require.Equal(t, "Raiders", entry["guild_name"])
			} else {
				require.NotContains(t, entry, "guild_name")
			}
		} else if tc.boss {
			require.Equal(t, "Hero", entry["player_name"])
			require.Equal(t, "Raiders", entry["guild_name"])
		} else {
			require.NotContains(t, entry, "player_name")
			require.NotContains(t, entry, "guild_name")
		}
	}
}

func TestTenantRatingLeaderboardLimitHundred(t *testing.T) {
	t.Parallel()
	tenant, generation, realm := uuid.New(), uuid.New(), uuid.New()
	stub := &tenantLeaderboardStub{tenant: tenant, generation: generation}
	for i := 0; i < 101; i++ {
		stub.playerScope = append(stub.playerScope, database.ListActivePlayerTenantScopeScoresRow{
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
	for _, tc := range []struct{ key, value string }{{"group_id", uuid.NewString()}, {"realm_ids", "bad"}, {"limit", "101"}, {"max_players", "-1"}, {"rating_metric", "bad"}} {
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
	for _, metric := range []string{"mastery", "ranked_mastery"} {
		q := tenantBase(true, false)
		q.Set("rating_metric", metric)
		q.Set("window_kind", "all_time")
		require.Equal(t, http.StatusOK, tenantRequest(q, tenant, &tenantLeaderboardStub{tenant: tenant, generation: gen}, true, false).Code, metric)
	}
	// A selected difficulty="" / size=0 is an exact cohort, not Renown's
	// special uncohorted sentinel or a request for a broader board.
	for _, guild := range []bool{false, true} {
		q := tenantBase(guild, false)
		q.Set("max_players", "0")
		stub := &tenantLeaderboardStub{tenant: tenant, generation: gen}
		require.Equal(t, http.StatusOK, tenantRequest(q, tenant, stub, guild, false).Code)
		require.Len(t, stub.params, 1)
		if guild {
			require.Zero(t, stub.params[0].(database.ListActiveGuildTenantScopeScoresParams).MaxPlayers)
		} else {
			require.Zero(t, stub.params[0].(database.ListActivePlayerTenantScopeScoresParams).MaxPlayers)
		}
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
	stub = &tenantLeaderboardStub{tenant: tenant, generation: gen, playerScope: []database.ListActivePlayerTenantScopeScoresRow{{TenantID: uuid.New(), GenerationID: gen, Score: 30}}}
	require.Equal(t, http.StatusInternalServerError, tenantRequest(q, tenant, stub, false, false).Code)
	empty := &tenantLeaderboardStub{tenant: tenant}
	rec := tenantRequest(q, tenant, empty, false, false)
	require.Equal(t, http.StatusOK, rec.Code)
	var result chroniclesdk.TenantPlayerScopeLeaderboardResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &result))
	require.Empty(t, result.Entries)
}

func TestTenantAllClassPlayerLeaderboard(t *testing.T) {
	t.Parallel()
	tenant, gen, realm := uuid.New(), uuid.New(), uuid.New()
	for _, boss := range []bool{true, false} {
		t.Run(strconv.FormatBool(boss), func(t *testing.T) {
			t.Parallel()
			stub := &tenantLeaderboardStub{tenant: tenant, generation: gen,
				playerBoss:  []database.ListActivePlayerTenantBossScoresRow{{TenantID: tenant, GenerationID: gen, RealmID: realm, PlayerGuid: "a", Score: 42}, {TenantID: tenant, GenerationID: gen, RealmID: realm, PlayerGuid: "b", Score: 42}},
				playerScope: []database.ListActivePlayerTenantScopeScoresRow{{TenantID: tenant, GenerationID: gen, RealmID: realm, PlayerGuid: "a", Score: 42}, {TenantID: tenant, GenerationID: gen, RealmID: realm, PlayerGuid: "b", Score: 42}}}
			q := tenantBase(false, boss)
			q.Set("difficulty_name", "Heroic")
			q.Del("class")
			q.Del("spec")
			q.Del("sub_spec")
			require.Equal(t, http.StatusBadRequest, tenantRequest(q, tenant, stub, false, boss).Code)
			q.Set("all_classes", "true")
			first := tenantRequest(q, tenant, stub, false, boss)
			require.Equal(t, http.StatusOK, first.Code, first.Body.String())
			var result struct {
				NextCursor string            `json:"next_cursor"`
				Entries    []json.RawMessage `json:"entries"`
			}
			require.NoError(t, json.Unmarshal(first.Body.Bytes(), &result))
			require.Len(t, result.Entries, 1)
			require.NotEmpty(t, result.NextCursor)
			switch p := stub.params[0].(type) {
			case database.ListActiveAllClassPlayerTenantBossScoresParams:
				require.Empty(t, p.PlayerClass)
				require.Equal(t, gen, p.GenerationID)
			case database.ListActiveAllClassPlayerTenantScopeScoresParams:
				require.Empty(t, p.PlayerClass)
				require.Equal(t, gen, p.GenerationID)
			default:
				t.Fatalf("unexpected query: %T", p)
			}
			q.Set("cursor", result.NextCursor)
			require.Equal(t, http.StatusOK, tenantRequest(q, tenant, stub, false, boss).Code)
			// Even a fully specified cohort cannot reuse a cursor across reader modes.
			mode := tenantBase(false, boss)
			mode.Set("difficulty_name", "Heroic")
			mode.Set("all_classes", "true")
			modeFirst := tenantRequest(mode, tenant, stub, false, boss)
			require.Equal(t, http.StatusOK, modeFirst.Code)
			var modeResult struct {
				NextCursor string `json:"next_cursor"`
			}
			require.NoError(t, json.Unmarshal(modeFirst.Body.Bytes(), &modeResult))
			mode.Del("all_classes")
			mode.Set("cursor", modeResult.NextCursor)
			require.Equal(t, http.StatusBadRequest, tenantRequest(mode, tenant, stub, false, boss).Code)
			q.Set("class", "Warrior")
			require.Equal(t, http.StatusBadRequest, tenantRequest(q, tenant, stub, false, boss).Code, "class change invalidates cursor")
			q.Del("cursor")
			q.Set("spec", "Fury")
			require.Equal(t, http.StatusOK, tenantRequest(q, tenant, stub, false, boss).Code)
			q.Del("spec")
			require.Equal(t, http.StatusOK, tenantRequest(q, tenant, stub, false, boss).Code, "class-only cohort")
			switch p := stub.params[len(stub.params)-1].(type) {
			case database.ListActiveAllClassPlayerTenantBossScoresParams:
				require.Equal(t, "WARRIOR", p.PlayerClass)
				require.Empty(t, p.PlayerSpec)
			case database.ListActiveAllClassPlayerTenantScopeScoresParams:
				require.Equal(t, "WARRIOR", p.PlayerClass)
				require.Empty(t, p.PlayerSpec)
			default:
				t.Fatalf("unexpected query: %T", p)
			}
			q.Del("class")
			q.Set("spec", "Fury")
			require.Equal(t, http.StatusBadRequest, tenantRequest(q, tenant, stub, false, boss).Code)
			q.Del("spec")
			q.Set("difficulty_name", "")
			q.Set("max_players", "0")
			require.Equal(t, http.StatusOK, tenantRequest(q, tenant, stub, false, boss).Code, "default difficulty and zero size are exact cohorts")
			q.Set("difficulty_name", "Heroic")
			q.Set("max_players", "40")
			q.Set("all_classes", "false")
			require.Equal(t, http.StatusBadRequest, tenantRequest(q, tenant, stub, false, boss).Code)
			q.Set("all_classes", "true")
			q.Set("rating_metric", "renown")
			q.Set("window_kind", "career")
			require.Equal(t, http.StatusBadRequest, tenantRequest(q, tenant, stub, false, boss).Code)
		})
	}
}
