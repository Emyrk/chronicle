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
	"github.com/stretchr/testify/require"
)

type publishedListStub struct {
	tenant, generation uuid.UUID
	evolving           bool
	evolvingRows       []any
	bossParams         *database.GetPublishedPlayerBossFullListParams
	scopeParams        *database.GetPublishedPlayerScopeFullListParams
}

func (s *publishedListStub) GetActiveTenantRatingGeneration(_ context.Context, id uuid.UUID) (uuid.UUID, error) {
	if id != s.tenant {
		return uuid.Nil, nil
	}
	return s.generation, nil
}
func (s *publishedListStub) GetPublishedPlayerBossFullList(_ context.Context, p database.GetPublishedPlayerBossFullListParams) (database.GetPublishedPlayerBossFullListRow, error) {
	s.bossParams = &p
	return database.GetPublishedPlayerBossFullListRow{Total: 2, Rows: []any{map[string]any{"rank": 3, "entry": map[string]any{"generation_id": s.generation, "realm_id": uuid.New(), "player_guid": "abc", "realm_name": "Realm", "score": 80.0}, "scores": map[string]any{"peak": 80.0, "mastery": 72.0, "renown": 4.0}}}}, nil
}
func (s *publishedListStub) GetPublishedPlayerScopeFullList(_ context.Context, p database.GetPublishedPlayerScopeFullListParams) (database.GetPublishedPlayerScopeFullListRow, error) {
	s.scopeParams = &p
	return database.GetPublishedPlayerScopeFullListRow{Rows: []any{}, Total: 0}, nil
}
func fullListRequest(q url.Values, tenant uuid.UUID, stub *publishedListStub) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/ratings/player-full-list?"+q.Encode(), nil)
	r = r.WithContext(servicetenant.WithTenantID(r.Context(), tenant))
	w := httptest.NewRecorder()
	handlePublishedPlayerFullListWithStore(stub, w, r)
	return w
}
func TestPublishedPlayerFullList(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	stub := &publishedListStub{tenant: tenant, generation: uuid.New()}
	q := url.Values{"instance_name": {"Molten Core"}, "encounter_name": {"Ragnaros"}, "difficulty_name": {"Heroic"}, "max_players": {"40"}, "performance_metric": {"dps"}, "rating_metric": {"peak"}, "window_kind": {"all_time"}, "query": {"abc"}, "limit": {"1"}}
	w := fullListRequest(q, tenant, stub)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var payload chroniclesdk.PublishedPlayerFullListResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &payload))
	require.EqualValues(t, 2, payload.Total)
	require.True(t, payload.HasNextPage)
	require.Len(t, payload.Rows, 1)
	require.EqualValues(t, 3, payload.Rows[0].Rank)
	require.Equal(t, "abc", payload.Rows[0].Entry.PlayerGUID)
	require.Equal(t, 72.0, *payload.Rows[0].Scores.Mastery)
	require.Equal(t, "", stub.bossParams.PlayerClass)
	require.Equal(t, "abc", stub.bossParams.SearchQuery)
	q.Set("page", "1")
	w = fullListRequest(q, tenant, stub)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.EqualValues(t, 1, stub.bossParams.OffsetCount)
	q.Set("page", "-1")
	require.Equal(t, http.StatusBadRequest, fullListRequest(q, tenant, stub).Code)
	q.Set("page", "0")
	q.Set("limit", "51")
	require.Equal(t, http.StatusBadRequest, fullListRequest(q, tenant, stub).Code)
	q.Set("limit", "1")
	q.Del("encounter_name")
	q.Set("rating_metric", "renown")
	q.Set("window_kind", "career")
	q.Set("performance_metric", "none")
	q.Set("difficulty_name", "")
	q.Set("max_players", "0")
	require.Equal(t, http.StatusOK, fullListRequest(q, tenant, stub).Code)
	require.Equal(t, "all_time", stub.scopeParams.OtherWindowKind)
	require.Equal(t, "career", stub.scopeParams.RenownWindowKind)
}

func (s *publishedListStub) GetTenantRatingReadState(context.Context, uuid.UUID) (string, error) {
	if s.evolving {
		return "evolving", nil
	}
	return "legacy", nil
}
func (s *publishedListStub) GetEvolvingPlayerBossFullList(_ context.Context, p database.GetEvolvingPlayerBossFullListParams) (database.GetEvolvingPlayerBossFullListRow, error) {
	return database.GetEvolvingPlayerBossFullListRow{Total: int64(len(s.evolvingRows)), Rows: s.evolvingRows}, nil
}
func (s *publishedListStub) GetEvolvingPlayerScopeFullList(_ context.Context, p database.GetEvolvingPlayerScopeFullListParams) (database.GetEvolvingPlayerScopeFullListRow, error) {
	return database.GetEvolvingPlayerScopeFullListRow{Total: int64(len(s.evolvingRows)), Rows: s.evolvingRows}, nil
}
func TestEvolvingPlayerFullListWithoutGeneration(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	stub := &publishedListStub{tenant: tenant, evolving: true}
	q := url.Values{"instance_name": {"Molten Core"}, "encounter_name": {"Ragnaros"}, "difficulty_name": {"Heroic"}, "max_players": {"40"}, "performance_metric": {"dps"}, "rating_metric": {"peak"}, "window_kind": {"period"}}
	w := fullListRequest(q, tenant, stub)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var out chroniclesdk.PublishedPlayerFullListResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &out))
	require.Empty(t, out.Rows)
	stub.evolvingRows = []any{map[string]any{"rank": 1, "entry": map[string]any{"generation_id": uuid.Nil, "realm_id": uuid.New(), "player_guid": "abc", "score": 80.0}}}
	w = fullListRequest(q, tenant, stub)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &out))
	require.EqualValues(t, 1, out.Total)
	require.Len(t, out.Rows, 1)
	require.Nil(t, out.Rows[0].Entry.GenerationID)
	require.Contains(t, w.Body.String(), `"generation_id": null`)
	require.Equal(t, "abc", out.Rows[0].Entry.PlayerGUID)
}
