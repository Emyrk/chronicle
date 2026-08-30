package serviceexternalapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestListRecentActivityFiltersAndPagination(t *testing.T) {
	t.Parallel()

	afterDate := time.Date(2026, time.August, 1, 0, 0, 0, 0, time.UTC)
	realmID := uuid.New()
	guildID := uuid.New()
	startedAt := afterDate.Add(24 * time.Hour)
	rows := make([]database.ListExternalAPIRecentInstancesRow, 3)
	for index := range rows {
		rows[index] = database.ListExternalAPIRecentInstancesRow{
			ID: uuid.New(), HashedSlug: pgtype.Text{String: "instance-slug", Valid: true},
			Name: "Molten Core", RealmID: realmID, RealmName: "Example Realm",
			GuildID: uuid.NullUUID{UUID: guildID, Valid: true}, GuildName: "Example Guild",
			UploadedAt:  pgtype.Timestamptz{Time: startedAt.Add(time.Hour), Valid: true},
			StartedAt:   pgtype.Timestamptz{Time: startedAt, Valid: true},
			EndedAt:     pgtype.Timestamptz{Time: startedAt.Add(2 * time.Hour), Valid: true},
			PlayerCount: 40, BossCount: 10, BossKills: 9, HasYoutubeVideo: true,
			DifficultyName: "Normal", MaxPlayers: 40, RecorderName: "Recorder",
		}
	}
	store := &fakeExternalAPIStore{recent: rows}
	service := &Service{db: store}
	service.setupRoutes()

	query := url.Values{
		"after_date":    {afterDate.Format(time.RFC3339)},
		"instance_name": {"Molten Core", "Blackwing Lair"},
		"realm_id":      {realmID.String()},
		"guild_id":      {guildID.String()},
		"has_video":     {"true"},
		"page":          {"2"},
		"page_size":     {"2"},
	}
	req := httptest.NewRequest(http.MethodGet, "/raidlogs/recent?"+query.Encode(), nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, pgtype.Timestamptz{Time: afterDate, Valid: true}, store.recentParams.AfterDate)
	require.ElementsMatch(t, []string{"Molten Core", "Blackwing Lair"}, store.recentParams.InstanceNames)
	require.Equal(t, realmID, store.recentParams.RealmID)
	require.Equal(t, guildID, store.recentParams.GuildID)
	require.Equal(t, "true", store.recentParams.HasVideo)
	require.Equal(t, int32(2), store.recentParams.ResultOffset)
	require.Equal(t, int32(3), store.recentParams.ResultLimit)

	var response RecentActivityResponse
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&response))
	require.Len(t, response.Activities, 2)
	require.Equal(t, Pagination{Page: 2, PageSize: 2, HasMore: true}, response.Pagination)
	require.Equal(t, "instance-slug", response.Activities[0].Slug)
	require.Equal(t, "Example Guild", response.Activities[0].Guild.Name)
}

func TestListRecentActivityDefaults(t *testing.T) {
	t.Parallel()

	store := &fakeExternalAPIStore{}
	service := &Service{db: store}
	service.setupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/raidlogs/recent", nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.False(t, store.recentParams.AfterDate.Valid)
	require.Equal(t, int32(0), store.recentParams.ResultOffset)
	require.Equal(t, int32(26), store.recentParams.ResultLimit)
}

func TestListRecentActivityRejectsInvalidFilters(t *testing.T) {
	t.Parallel()

	tests := []string{
		"after_date=not-a-date",
		"page_size=51",
		"page=0",
		"realm_id=not-a-uuid",
		"guild_id=not-a-uuid",
		"has_video=maybe",
	}
	for _, query := range tests {
		query := query
		t.Run(query, func(t *testing.T) {
			t.Parallel()
			service := &Service{db: &fakeExternalAPIStore{}}
			service.setupRoutes()
			req := httptest.NewRequest(http.MethodGet, "/raidlogs/recent?"+query, nil)
			rec := httptest.NewRecorder()
			service.ServeHTTP(rec, req)
			require.Equal(t, http.StatusBadRequest, rec.Code)
		})
	}
}
