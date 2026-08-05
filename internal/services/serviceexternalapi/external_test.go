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
	servers    []database.ListExternalAPIServersRow
	server     database.ResolveExternalAPIServerRow
	realms     []database.ListExternalAPIRealmsRow
	realm      database.ResolveExternalAPIRealmRow
	character  database.GetExternalAPICharacterRow
	logs       []database.ListExternalAPICharacterLogsRow
	logsParams database.ListExternalAPICharacterLogsParams
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
			StartedAt:  pgtype.Timestamptz{Time: now, Valid: true},
			EndedAt:    pgtype.Timestamptz{Time: now, Valid: true},
			UploadedAt: pgtype.Timestamptz{Time: now, Valid: true},
			BestDps:    500, BestDpsParse: 95,
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

	req := httptest.NewRequest(http.MethodGet, "/characters/Example%20Server/Example%20Realm/Example/logs?page=2&page_size=20", nil)
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
	require.NotNil(t, response.Logs[0].Performance)
	require.Equal(t, int32(95), *response.Logs[0].Performance.BestDPSParse)
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

	req := httptest.NewRequest(http.MethodGet, "/characters/server/realm/name/logs?page_size=21", nil)
	rec := httptest.NewRecorder()
	service.ServeHTTP(rec, req)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}
