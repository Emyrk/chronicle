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

type ratingLeaderboardStoreStub struct {
	bossParams  *database.ListActiveGroupBossRatingScoresParams
	groupParams *database.ListGroupRatingBossScoresParams
	rows        []database.RatingBossScore
}

func (stub *ratingLeaderboardStoreStub) ListActiveGroupBossRatingScores(_ context.Context, params database.ListActiveGroupBossRatingScoresParams) ([]database.RatingBossScore, error) {
	stub.bossParams = &params
	return stub.rows, nil
}

func (stub *ratingLeaderboardStoreStub) ListGroupRatingBossScores(_ context.Context, params database.ListGroupRatingBossScoresParams) ([]database.RatingBossScore, error) {
	stub.groupParams = &params
	return stub.rows, nil
}

func TestRatingBossLeaderboard(t *testing.T) {
	t.Parallel()
	groupID, tenantID := uuid.New(), uuid.New()
	base := url.Values{
		"group_id": {groupID.String()}, "class": {"Warrior"}, "spec": {"Fury"}, "sub_spec": {""},
		"performance_metric": {"dps"}, "rating_metric": {"peak"}, "window_kind": {"period"},
	}
	makeRequest := func(t *testing.T, query url.Values, store *ratingLeaderboardStoreStub) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "/ratings/boss-leaderboard?"+query.Encode(), nil)
		req = req.WithContext(servicetenant.WithTenantID(req.Context(), tenantID))
		rec := httptest.NewRecorder()
		handleRatingBossLeaderboardWithStore(store, rec, req)
		return rec
	}

	t.Run("exact boss", func(t *testing.T) {
		t.Parallel()
		query := url.Values{}
		for key, value := range base {
			query[key] = value
		}
		query.Set("instance_name", "Molten Core")
		query.Set("encounter_name", "Ragnaros")
		query.Set("difficulty_name", "")
		query.Set("max_players", "40")
		query.Set("limit", "100")
		store := &ratingLeaderboardStoreStub{rows: []database.RatingBossScore{{
			GroupID: uuid.NullUUID{UUID: groupID, Valid: true}, PlayerGuid: "player", EncounterName: "Ragnaros",
			Score: 42, BestRaw: pgtype.Float8{Float64: 0, Valid: true},
		}}}
		rec := makeRequest(t, query, store)
		require.Equal(t, http.StatusOK, rec.Code)
		require.Nil(t, store.groupParams)
		require.Equal(t, tenantID, store.bossParams.TenantID)
		require.Equal(t, groupID, store.bossParams.GroupID)
		require.Equal(t, int16(40), store.bossParams.MaxPlayers)
		require.Equal(t, "WARRIOR", store.bossParams.PlayerClass)
		require.Equal(t, "Fury", store.bossParams.PlayerSpec)
		require.Equal(t, int32(100), store.bossParams.LimitCount)
		var response chroniclesdk.RatingBossLeaderboardResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
		require.Len(t, response.Entries, 1)
		require.Equal(t, "Ragnaros", response.Entries[0].EncounterName)
		require.Equal(t, groupID, response.Entries[0].GroupID)
		require.NotNil(t, response.Entries[0].BestRaw)
		require.Zero(t, *response.Entries[0].BestRaw)
		require.Nil(t, response.Entries[0].Form)
	})

	t.Run("group-wide still lists boss rows", func(t *testing.T) {
		t.Parallel()
		store := &ratingLeaderboardStoreStub{rows: []database.RatingBossScore{
			{EncounterName: "Ragnaros", Score: 60}, {EncounterName: "Garr", Score: 30},
		}}
		rec := makeRequest(t, base, store)
		require.Equal(t, http.StatusOK, rec.Code)
		require.Nil(t, store.bossParams)
		require.Equal(t, tenantID, store.groupParams.TenantID)
		require.Equal(t, int32(50), store.groupParams.LimitCount)
		var response chroniclesdk.RatingBossLeaderboardResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
		require.Equal(t, "Ragnaros", response.Entries[0].EncounterName)
		require.Equal(t, "Garr", response.Entries[1].EncounterName)
	})

	t.Run("Renown uses no class or spec", func(t *testing.T) {
		t.Parallel()
		query := url.Values{
			"group_id": {groupID.String()}, "performance_metric": {"none"},
			"rating_metric": {"renown"}, "window_kind": {"career"},
		}
		store := &ratingLeaderboardStoreStub{rows: []database.RatingBossScore{{Score: 15}}}
		rec := makeRequest(t, query, store)
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, "", store.groupParams.PlayerClass)
		require.Equal(t, "", store.groupParams.PlayerSpec)
		require.Equal(t, "none", store.groupParams.PerformanceMetric)
	})

	t.Run("all-time Peak", func(t *testing.T) {
		t.Parallel()
		query := url.Values{}
		for key, value := range base {
			query[key] = value
		}
		query.Set("window_kind", "all_time")
		store := &ratingLeaderboardStoreStub{}
		rec := makeRequest(t, query, store)
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, "all_time", store.groupParams.WindowKind)
	})

	for _, tc := range []struct{ name, key, value string }{
		{"missing group", "group_id", ""}, {"bad limit", "limit", "101"},
		{"zero limit", "limit", "0"}, {"invalid metric", "performance_metric", "invalid"},
		{"partial boss", "instance_name", "Molten Core"}, {"missing class", "class", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			query := url.Values{}
			for key, value := range base {
				query[key] = value
			}
			query.Set(tc.key, tc.value)
			store := &ratingLeaderboardStoreStub{}
			rec := makeRequest(t, query, store)
			require.Equal(t, http.StatusBadRequest, rec.Code)
			require.Nil(t, store.bossParams)
			require.Nil(t, store.groupParams)
		})
	}
}

type ratingScopeStoreStub struct {
	params *database.ListActiveRatingScopeScoresParams
	rows   []database.RatingScopeScore
}

func (stub *ratingScopeStoreStub) ListActiveRatingScopeScores(_ context.Context, params database.ListActiveRatingScopeScoresParams) ([]database.RatingScopeScore, error) {
	stub.params = &params
	return stub.rows, nil
}

func TestRatingScopeLeaderboard(t *testing.T) {
	t.Parallel()
	groupID, tenantID := uuid.New(), uuid.New()
	base := url.Values{
		"group_id": {groupID.String()}, "difficulty_name": {"Normal"}, "max_players": {"40"},
		"class": {"Warrior"}, "spec": {"Fury"}, "sub_spec": {""},
		"performance_metric": {"dps"}, "rating_metric": {"mastery"}, "window_kind": {"period"},
	}
	request := func(t *testing.T, query url.Values, stub *ratingScopeStoreStub) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "/ratings/scope-leaderboard?"+query.Encode(), nil)
		req = req.WithContext(servicetenant.WithTenantID(req.Context(), tenantID))
		rec := httptest.NewRecorder()
		handleRatingScopeLeaderboardWithStore(stub, rec, req)
		return rec
	}
	clone := func() url.Values {
		query := url.Values{}
		for key, value := range base {
			query[key] = value
		}
		return query
	}
	t.Run("raid", func(t *testing.T) {
		t.Parallel()
		query := clone()
		query.Set("instance_name", "Molten Core")
		query.Set("limit", "100")
		stub := &ratingScopeStoreStub{rows: []database.RatingScopeScore{{
			GenerationID: uuid.New(), GroupID: groupID, RealmID: uuid.New(),
			InstanceName: "Molten Core", PlayerGuid: "player", PlayerSpec: "Fury", Score: 87,
		}}}
		rec := request(t, query, stub)
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, tenantID, stub.params.TenantID)
		require.Equal(t, groupID, stub.params.GroupID)
		require.Equal(t, "Molten Core", stub.params.InstanceName)
		require.Equal(t, "WARRIOR", stub.params.PlayerClass)
		require.Equal(t, "Fury", stub.params.PlayerSpec)
		require.Equal(t, int16(40), stub.params.MaxPlayers)
		require.Equal(t, int32(100), stub.params.LimitCount)
		var response chroniclesdk.RatingScopeLeaderboardResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
		require.Equal(t, "raid", response.Scope)
		require.Len(t, response.Entries, 1)
		require.Equal(t, "Fury", response.Entries[0].PlayerSpec)
		require.Equal(t, 87.0, response.Entries[0].Score)
	})
	t.Run("global", func(t *testing.T) {
		t.Parallel()
		stub := &ratingScopeStoreStub{}
		rec := request(t, base, stub)
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, "", stub.params.InstanceName)
		require.Equal(t, int32(50), stub.params.LimitCount)
		var response chroniclesdk.RatingScopeLeaderboardResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
		require.Equal(t, "global", response.Scope)
		require.Empty(t, response.Entries)
	})
	t.Run("Renown has no spec cohort", func(t *testing.T) {
		t.Parallel()
		query := url.Values{
			"group_id": {groupID.String()}, "difficulty_name": {""}, "max_players": {"0"},
			"performance_metric": {"none"}, "rating_metric": {"renown"}, "window_kind": {"career"},
		}
		stub := &ratingScopeStoreStub{}
		rec := request(t, query, stub)
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, "", stub.params.PlayerSpec)
		require.Equal(t, "", stub.params.PlayerClass)
		require.Equal(t, "none", stub.params.PerformanceMetric)
	})
	t.Run("all-time Peak", func(t *testing.T) {
		t.Parallel()
		query := clone()
		query.Set("rating_metric", "peak")
		query.Set("window_kind", "all_time")
		stub := &ratingScopeStoreStub{}
		rec := request(t, query, stub)
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, "all_time", stub.params.WindowKind)
	})
	t.Run("Renown rejects spec cohorts", func(t *testing.T) {
		t.Parallel()
		query := url.Values{
			"group_id": {groupID.String()}, "difficulty_name": {""}, "max_players": {"0"},
			"class": {"Warrior"}, "performance_metric": {"none"}, "rating_metric": {"renown"}, "window_kind": {"career"},
		}
		stub := &ratingScopeStoreStub{}
		rec := request(t, query, stub)
		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.Nil(t, stub.params)
	})
	for _, tc := range []struct{ name, key, value string }{
		{"invalid group", "group_id", "nope"}, {"missing max players", "max_players", ""},
		{"invalid limit", "limit", "101"}, {"invalid window", "window_kind", "career"},
		{"missing spec", "spec", "<delete>"}, {"empty class", "class", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			query := clone()
			if tc.value == "<delete>" {
				query.Del(tc.key)
			} else {
				query.Set(tc.key, tc.value)
			}
			stub := &ratingScopeStoreStub{}
			rec := request(t, query, stub)
			require.Equal(t, http.StatusBadRequest, rec.Code)
			require.Nil(t, stub.params)
		})
	}
}
