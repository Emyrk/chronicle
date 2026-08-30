package serviceexternalapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

type fakeExternalAPIStore struct {
	servers               []database.ListExternalAPIServersRow
	server                database.ResolveExternalAPIServerRow
	realms                []database.ListExternalAPIRealmsRow
	realm                 database.ResolveExternalAPIRealmRow
	character             database.GetExternalAPICharacterRow
	logs                  []database.ListExternalAPICharacterLogsRow
	logsParams            database.ListExternalAPICharacterLogsParams
	leaderboard           []database.SpeedrunLeaderboardRow
	leaderboardParams     database.SpeedrunLeaderboardParams
	leaderboardDuplicates []database.ListExternalAPILeaderboardDuplicateLogsRow
	duplicateParams       database.ListExternalAPILeaderboardDuplicateLogsParams
	instance              database.LogInstancesGuild
	instanceErr           error
	instanceSlug          pgtype.Text
	encounters            []database.LogInstanceEncounter
	units                 []database.LogInstanceUnit
	players               []database.LogInstancePlayer
	hostiles              []database.LogInstanceEncounterHostile
	phases                []database.LogInstanceEncounterPhase
	event                 database.LogInstanceEvent
	eventErr              error
	eventParams           database.InstanceEventParams
	recent                []database.ListExternalAPIRecentInstancesRow
	recentParams          database.ListExternalAPIRecentInstancesParams
}

func (f *fakeExternalAPIStore) ListExternalAPIServers(context.Context) ([]database.ListExternalAPIServersRow, error) {
	return f.servers, nil
}
func (f *fakeExternalAPIStore) ResolveExternalAPIServer(context.Context, string) (database.ResolveExternalAPIServerRow, error) {
	return f.server, nil
}
func (f *fakeExternalAPIStore) ListExternalAPIRealms(context.Context, string) ([]database.ListExternalAPIRealmsRow, error) {
	return f.realms, nil
}
func (f *fakeExternalAPIStore) ResolveExternalAPIRealm(context.Context, database.ResolveExternalAPIRealmParams) (database.ResolveExternalAPIRealmRow, error) {
	return f.realm, nil
}
func (f *fakeExternalAPIStore) GetExternalAPICharacter(context.Context, database.GetExternalAPICharacterParams) (database.GetExternalAPICharacterRow, error) {
	return f.character, nil
}
func (f *fakeExternalAPIStore) ListExternalAPICharacterLogs(_ context.Context, params database.ListExternalAPICharacterLogsParams) ([]database.ListExternalAPICharacterLogsRow, error) {
	f.logsParams = params
	return f.logs, nil
}
func (f *fakeExternalAPIStore) SpeedrunLeaderboard(_ context.Context, params database.SpeedrunLeaderboardParams) ([]database.SpeedrunLeaderboardRow, error) {
	f.leaderboardParams = params
	return f.leaderboard, nil
}
func (f *fakeExternalAPIStore) ListExternalAPILeaderboardDuplicateLogs(_ context.Context, params database.ListExternalAPILeaderboardDuplicateLogsParams) ([]database.ListExternalAPILeaderboardDuplicateLogsRow, error) {
	f.duplicateParams = params
	return f.leaderboardDuplicates, nil
}

func (f *fakeExternalAPIStore) InstanceBySlug(_ context.Context, slug pgtype.Text) (database.LogInstancesGuild, error) {
	f.instanceSlug = slug
	return f.instance, f.instanceErr
}
func (f *fakeExternalAPIStore) EncountersByInstanceID(context.Context, uuid.UUID) ([]database.LogInstanceEncounter, error) {
	return f.encounters, nil
}
func (f *fakeExternalAPIStore) InstanceUnitsByInstanceID(context.Context, uuid.UUID) ([]database.LogInstanceUnit, error) {
	return f.units, nil
}
func (f *fakeExternalAPIStore) InstancePlayersByInstanceID(context.Context, uuid.UUID) ([]database.LogInstancePlayer, error) {
	return f.players, nil
}
func (f *fakeExternalAPIStore) GetInstanceEncounterCharacterFights(context.Context, uuid.UUID) ([]database.LogInstanceEncounterHostile, error) {
	return f.hostiles, nil
}
func (f *fakeExternalAPIStore) GetEncounterPhasesByInstanceID(context.Context, uuid.UUID) ([]database.LogInstanceEncounterPhase, error) {
	return f.phases, nil
}

func (f *fakeExternalAPIStore) InstanceEvent(_ context.Context, params database.InstanceEventParams) (database.LogInstanceEvent, error) {
	f.eventParams = params
	return f.event, f.eventErr
}

func (f *fakeExternalAPIStore) ListExternalAPIRecentInstances(_ context.Context, params database.ListExternalAPIRecentInstancesParams) ([]database.ListExternalAPIRecentInstancesRow, error) {
	f.recentParams = params
	return f.recent, nil
}

func TestListServers(t *testing.T) {
	t.Parallel()

	serverID := uuid.New()
	realmID := uuid.New()
	store := &fakeExternalAPIStore{servers: []database.ListExternalAPIServersRow{{
		ID: serverID, Name: "Example Server", Description: "Vanilla", Url: pgtype.Text{String: "https://example.com", Valid: true},
		RealmID: uuid.NullUUID{UUID: realmID, Valid: true}, RealmName: pgtype.Text{String: "Example Realm", Valid: true},
	}}}
	service := &Service{db: store}
	service.setupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/explore/servers", nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var response ServersResponse
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&response))
	require.Equal(t, []Server{{
		ID: serverID, Name: "Example Server", Description: "Vanilla", URL: "https://example.com",
		Realms: []Realm{{ID: realmID, ServerID: serverID, Name: "Example Realm"}},
	}}, response.Servers)
}

func TestListCharacterLogsPagination(t *testing.T) {
	t.Parallel()

	serverID := uuid.New()
	realmID := uuid.New()
	tenantID := uuid.New()
	playerGUID := guid.GUID(1234)
	now := time.Now().UTC().Truncate(time.Second)
	rows := make([]database.ListExternalAPICharacterLogsRow, 21)
	for i := range rows {
		rows[i] = database.ListExternalAPICharacterLogsRow{
			ID: uuid.New(), Name: "Molten Core", RealmID: realmID,
			DifficultyName: "Normal", MaxPlayers: 40,
			StartedAt:       pgtype.Timestamptz{Time: now, Valid: true},
			EndedAt:         pgtype.Timestamptz{Time: now, Valid: true},
			UploadedAt:      pgtype.Timestamptz{Time: now, Valid: true},
			PerformanceJson: `[{"encounter_name":"Ragnaros","dps_parse":95,"hps_parse":42}]`,
		}
	}
	store := &fakeExternalAPIStore{
		realm: database.ResolveExternalAPIRealmRow{
			ID: realmID, ServerID: serverID, Name: "Example Realm", ServerName: "Example Server",
			TenantID: uuid.NullUUID{UUID: tenantID, Valid: true},
		},
		character: database.GetExternalAPICharacterRow{
			ID: playerGUID, RealmID: realmID, Name: "Example",
			Class: database.WowPlayableClassWARRIOR, Race: database.WowPlayableRaceHuman,
			Gender: database.WowPlayableGenderMale, Level: 60,
			UpdatedAt: pgtype.Timestamptz{Time: now, Valid: true},
		},
		logs: rows,
	}
	service := &Service{db: store}
	service.setupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/characters/Example%20Server/Example%20Realm/Example/instances?page=2&page_size=20", nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var response CharacterLogsResponse
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&response))
	require.Len(t, response.Logs, 20)
	require.True(t, response.Pagination.HasMore)
	require.Equal(t, int32(2), response.Pagination.Page)
	require.Equal(t, int32(20), response.Pagination.PageSize)
	require.Equal(t, int32(20), store.logsParams.ResultOffset)
	require.Equal(t, int32(21), store.logsParams.ResultLimit)
	require.Equal(t, tenantID, store.logsParams.TenantID)
	require.Equal(t, playerGUID, store.logsParams.PlayerGuid)
	require.Equal(t, "Normal", response.Logs[0].Difficulty)
	require.Equal(t, int32(40), response.Logs[0].MaxPlayers)
	require.Equal(t, []CharacterEncounterPerformance{{
		EncounterName: "Ragnaros", DPSParse: int32Pointer(95), HPSParse: int32Pointer(42),
	}}, response.Logs[0].Performance)
}

func TestListSpeedrunLeaderboardIncludesCanonicalAndDuplicateLogs(t *testing.T) {
	t.Parallel()

	canonicalID := uuid.New()
	duplicateID := uuid.New()
	duplicateGroupID := uuid.New()
	guildID := uuid.New()
	now := time.Date(2026, time.August, 29, 12, 0, 0, 0, time.UTC)
	store := &fakeExternalAPIStore{
		leaderboard: []database.SpeedrunLeaderboardRow{{
			InstanceID: canonicalID, InstanceName: "Molten Core", DifficultyName: "Normal",
			GuildID: uuid.NullUUID{UUID: guildID, Valid: true}, DurationMs: 3_600_000,
			StartTime:      pgtype.Timestamptz{Time: now, Valid: true},
			CompletionTime: pgtype.Timestamptz{Time: now.Add(time.Hour), Valid: true},
			AddonVersion:   "1.2.3", HashedSlug: pgtype.Text{String: "canonical", Valid: true},
			DuplicateGroupID: uuid.NullUUID{UUID: duplicateGroupID, Valid: true},
			ParserVersion:    "v1.0.0", GuildName: "Example Guild", RealmName: "Example Realm",
			PlayerCount: 40, HasYoutubeVideo: true, YoutubeUrl: "https://youtube.com/watch?v=canonical",
		}},
		leaderboardDuplicates: []database.ListExternalAPILeaderboardDuplicateLogsRow{{
			SelectedInstanceID: canonicalID, ID: duplicateID,
			HashedSlug: pgtype.Text{String: "duplicate", Valid: true}, DurationMs: 3_610_000,
			StartTime:      pgtype.Timestamptz{Time: now, Valid: true},
			CompletionTime: pgtype.Timestamptz{Time: now.Add(time.Hour + 10*time.Second), Valid: true},
			ParserVersion:  "v1.0.0", AddonVersion: "1.2.3",
			HasYoutubeVideo: true, YoutubeUrl: "https://youtube.com/watch?v=duplicate",
		}},
	}
	for range 20 {
		store.leaderboard = append(store.leaderboard, database.SpeedrunLeaderboardRow{
			InstanceID: uuid.New(), InstanceName: "Molten Core", DifficultyName: "Normal",
			GuildID: uuid.NullUUID{UUID: guildID, Valid: true}, DurationMs: 3_700_000,
			StartTime:      pgtype.Timestamptz{Time: now, Valid: true},
			CompletionTime: pgtype.Timestamptz{Time: now.Add(time.Hour), Valid: true},
			GuildName:      "Example Guild", RealmName: "Example Realm", PlayerCount: 40,
		})
	}
	service := &Service{db: store}
	service.setupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/leaderboards/speedruns?instance_name=Molten+Core&timing=boss_to_boss&difficulty_name=Normal&realm_name=Example+Realm&min_players=20&max_players=40&since_days=30&page=2&page_size=20", nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.True(t, store.leaderboardParams.UseRankedTiming)
	require.Equal(t, "Molten Core", store.leaderboardParams.InstanceName)
	require.Equal(t, []string{"Example Realm"}, store.leaderboardParams.RealmNames)
	require.True(t, store.leaderboardParams.FilterDifficulty)
	require.Equal(t, "Normal", store.leaderboardParams.DifficultyName)
	require.Equal(t, int64(20), store.leaderboardParams.MinPlayers)
	require.Equal(t, int64(40), store.leaderboardParams.MaxPlayers)
	require.Equal(t, int64(30), store.leaderboardParams.SinceDays)
	require.Equal(t, int64(20), store.leaderboardParams.ResultOffset)
	require.Equal(t, int64(21), store.leaderboardParams.ResultLimit)
	require.True(t, store.duplicateParams.UseRankedTiming)
	require.Len(t, store.duplicateParams.SelectedInstanceIds, 20)
	require.Contains(t, store.duplicateParams.SelectedInstanceIds, canonicalID)

	var response SpeedrunLeaderboardResponse
	require.NoError(t, json.NewDecoder(rec.Body).Decode(&response))
	require.Equal(t, "boss_to_boss", response.Timing)
	require.Equal(t, Pagination{Page: 2, PageSize: 20, HasMore: true}, response.Pagination)
	require.Len(t, response.Entries, 20)
	entry := response.Entries[0]
	require.True(t, entry.IsDuplicate)
	require.Equal(t, guildID, entry.GuildID)
	require.Equal(t, duplicateGroupID, *entry.DuplicateGroupID)
	require.Equal(t, canonicalID, entry.Canonical.ID)
	require.Equal(t, int64(3_600_000), *entry.Canonical.DurationMs)
	require.True(t, entry.Canonical.HasYoutubeVideo)
	require.Equal(t, "https://youtube.com/watch?v=canonical", entry.Canonical.YoutubeURL)
	require.Len(t, entry.OtherLogs, 1)
	require.Equal(t, duplicateID, entry.OtherLogs[0].ID)
	require.Equal(t, int64(3_610_000), *entry.OtherLogs[0].DurationMs)
	require.True(t, entry.OtherLogs[0].HasYoutubeVideo)
	require.Equal(t, "https://youtube.com/watch?v=duplicate", entry.OtherLogs[0].YoutubeURL)
}

func TestSpeedrunLeaderboardRejectsPageSizeAboveMaximum(t *testing.T) {
	t.Parallel()

	service := &Service{db: &fakeExternalAPIStore{}}
	service.setupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/leaderboards/speedruns?instance_name=Molten+Core&page_size=51", nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestExternalSpeedrunTiming(t *testing.T) {
	t.Parallel()

	tests := []struct {
		value      string
		wantName   string
		wantRanked bool
		wantValid  bool
	}{
		{value: "", wantName: "full", wantValid: true},
		{value: "full", wantName: "full", wantValid: true},
		{value: "boss_to_boss", wantName: "boss_to_boss", wantRanked: true, wantValid: true},
		{value: "ranked"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.value, func(t *testing.T) {
			t.Parallel()
			name, ranked, valid := externalSpeedrunTiming(test.value)
			require.Equal(t, test.wantName, name)
			require.Equal(t, test.wantRanked, ranked)
			require.Equal(t, test.wantValid, valid)
		})
	}
}

func TestCharacterLogOmitsPerformanceWithoutParses(t *testing.T) {
	t.Parallel()

	log, err := characterLogFromRow(database.ListExternalAPICharacterLogsRow{
		ID: uuid.New(), Name: "Blackwing Lair", PerformanceJson: "[]",
	})
	require.NoError(t, err)
	require.Nil(t, log.Performance)

	encoded, err := json.Marshal(log)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), `"performance"`)
}

func TestCharacterLogsRejectsPageSizeAboveMaximum(t *testing.T) {
	t.Parallel()

	store := &fakeExternalAPIStore{
		realm: database.ResolveExternalAPIRealmRow{ID: uuid.New(), ServerID: uuid.New()},
		character: database.GetExternalAPICharacterRow{
			ID: guid.GUID(1), Class: database.WowPlayableClassWARRIOR,
			Race: database.WowPlayableRaceHuman, Gender: database.WowPlayableGenderMale,
			UpdatedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
		},
	}
	service := &Service{db: store}
	service.setupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/characters/server/realm/name/instances?page_size=51", nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}
