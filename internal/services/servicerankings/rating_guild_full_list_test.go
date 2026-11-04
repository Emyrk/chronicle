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

type publishedGuildListStub struct {
	publishedGuildFullListReader
	tenant, generation uuid.UUID
	calls, changeAt    int
	bossParams         *database.GetPublishedGuildBossFullListParams
	scopeParams        *database.GetPublishedGuildScopeFullListParams
}

func (s *publishedGuildListStub) GetActiveTenantRatingGeneration(_ context.Context, id uuid.UUID) (uuid.UUID, error) {
	s.calls++
	if id != s.tenant {
		return uuid.Nil, nil
	}
	if s.changeAt > 0 && s.calls >= s.changeAt {
		return uuid.New(), nil
	}
	return s.generation, nil
}
func (s *publishedGuildListStub) GetPublishedGuildBossFullList(_ context.Context, p database.GetPublishedGuildBossFullListParams) (database.GetPublishedGuildBossFullListRow, error) {
	s.bossParams = &p
	return database.GetPublishedGuildBossFullListRow{Total: 2, Rows: []any{map[string]any{"rank": 3, "entry": map[string]any{"generation_id": s.generation, "realm_id": uuid.New(), "guild_id": uuid.New(), "realm_name": "Realm", "score": 80.0}, "scores": map[string]any{"peak": 80.0, "mastery": 72.0, "renown": 4.0}}}}, nil
}
func (s *publishedGuildListStub) GetPublishedGuildScopeFullList(_ context.Context, p database.GetPublishedGuildScopeFullListParams) (database.GetPublishedGuildScopeFullListRow, error) {
	s.scopeParams = &p
	return database.GetPublishedGuildScopeFullListRow{Rows: []any{}, Total: 0}, nil
}
func guildFullListRequest(q url.Values, tenant uuid.UUID, stub *publishedGuildListStub) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/ratings/guild-full-list?"+q.Encode(), nil)
	r = r.WithContext(servicetenant.WithTenantID(r.Context(), tenant))
	w := httptest.NewRecorder()
	handlePublishedGuildFullListWithStore(stub, w, r)
	return w
}
func TestPublishedGuildFullList(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	stub := &publishedGuildListStub{tenant: tenant, generation: uuid.New()}
	q := url.Values{"instance_name": {"Molten Core"}, "encounter_name": {"Ragnaros"}, "difficulty_name": {"Heroic"}, "max_players": {"40"}, "rating_metric": {"peak"}, "window_kind": {"all_time"}, "query": {"abc"}, "limit": {"1"}}
	w := guildFullListRequest(q, tenant, stub)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var payload chroniclesdk.PublishedGuildFullListResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &payload))
	require.EqualValues(t, 2, payload.Total)
	require.True(t, payload.HasNextPage)
	require.Len(t, payload.Rows, 1)
	require.EqualValues(t, 3, payload.Rows[0].Rank)
	require.NotEqual(t, uuid.Nil, payload.Rows[0].Entry.GuildID)
	require.Equal(t, 72.0, *payload.Rows[0].Scores.Mastery)
	require.Equal(t, "abc", stub.bossParams.SearchQuery)
	q.Set("page", "1")
	w = guildFullListRequest(q, tenant, stub)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	require.EqualValues(t, 1, stub.bossParams.OffsetCount)
	q.Set("page", "-1")
	require.Equal(t, http.StatusBadRequest, guildFullListRequest(q, tenant, stub).Code)
	q.Set("page", "0")
	q.Set("limit", "51")
	require.Equal(t, http.StatusBadRequest, guildFullListRequest(q, tenant, stub).Code)
	q.Set("limit", "1")
	q.Del("encounter_name")
	q.Set("rating_metric", "renown")
	q.Set("window_kind", "career")
	q.Set("difficulty_name", "")
	q.Set("max_players", "0")
	require.Equal(t, http.StatusOK, guildFullListRequest(q, tenant, stub).Code)
	require.Equal(t, "all_time", stub.scopeParams.OtherWindowKind)
	require.Equal(t, "career", stub.scopeParams.RenownWindowKind)
	stale := &publishedGuildListStub{tenant: tenant, generation: uuid.New(), changeAt: 2}
	require.Equal(t, http.StatusConflict, guildFullListRequest(q, tenant, stale).Code)
}
