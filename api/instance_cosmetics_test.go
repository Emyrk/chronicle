package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestInstanceCosmeticsRealmAwareAndActiveOnly(t *testing.T) {
	t.Parallel()

	store, _ := dbtestutil.NewDB(t)
	ctx := testutil.Context(t, testutil.WaitMedium)

	serverID := uuid.New()
	realmID := uuid.New()
	otherRealmID := uuid.New()
	_, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: serverID, Name: "server-" + serverID.String()[:8]})
	require.NoError(t, err)
	for _, realm := range []struct {
		id   uuid.UUID
		name string
	}{{realmID, "realm"}, {otherRealmID, "other-realm"}} {
		_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{
			ID: realm.id, ServerID: serverID, Name: realm.name + "-" + realm.id.String()[:8],
		})
		require.NoError(t, err)
	}

	userID := uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "user-" + userID.String()[:8]})
	require.NoError(t, err)

	now := time.Date(2026, 10, 25, 12, 0, 0, 0, time.UTC)
	logGroupID := uuid.New()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(now), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))

	instanceID := uuid.New()
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
		Name: "Molten Core", DifficultyName: "Normal", MaxPlayers: 40,
		StartTime: database.Timestamptz(now), EndTime: database.Timestamptz(now.Add(time.Hour)),
		Capabilities: []string{},
	})
	require.NoError(t, err)

	activeGUID := guid.GUID(1)
	wrongRealmGUID := guid.GUID(2)
	emptyGUID := guid.GUID(3)
	outfit := database.PlayerOutfit{}
	talents := database.PlayerTalents{}
	players := []database.UpsertPlayersParams{
		playerParams(activeGUID, realmID, instanceID, now, &outfit, &talents),
		playerParams(wrongRealmGUID, otherRealmID, instanceID, now, &outfit, &talents),
		playerParams(emptyGUID, realmID, instanceID, now, &outfit, &talents),
	}
	store.UpsertPlayers(ctx, players).Exec(func(_ int, err error) { require.NoError(t, err) })

	store.InsertInstancePlayers(ctx, []database.InsertInstancePlayersParams{
		instancePlayerParams(instanceID, activeGUID),
		instancePlayerParams(instanceID, wrongRealmGUID),
		instancePlayerParams(instanceID, emptyGUID),
	}).Exec(func(_ int, err error) { require.NoError(t, err) })

	activeLink, err := store.InsertUserCharacterLink(ctx, database.InsertUserCharacterLinkParams{
		UserID: userID, CharacterGuid: activeGUID, RealmID: realmID,
	})
	require.NoError(t, err)
	wrongRealmLink, err := store.InsertUserCharacterLink(ctx, database.InsertUserCharacterLinkParams{
		UserID: userID, CharacterGuid: wrongRealmGUID, RealmID: otherRealmID,
	})
	require.NoError(t, err)
	emptyLink, err := store.InsertUserCharacterLink(ctx, database.InsertUserCharacterLinkParams{
		UserID: userID, CharacterGuid: emptyGUID, RealmID: realmID,
	})
	require.NoError(t, err)

	for _, cosmetic := range []database.UpsertUserCharacterCosmeticsParams{
		{UserCharacterLinkID: activeLink.ID, UserID: userID, ActiveNameID: "name-gold", ActiveBorderID: "border-gold"},
		{UserCharacterLinkID: wrongRealmLink.ID, UserID: userID, ActiveNameID: "wrong-realm"},
		{UserCharacterLinkID: emptyLink.ID, UserID: userID},
	} {
		_, err = store.UpsertUserCharacterCosmetics(ctx, cosmetic)
		require.NoError(t, err)
	}

	rows, err := store.GetInstancePlayerCosmetics(ctx, instanceID)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, activeGUID, rows[0].UnitGuid)

	zed := authz.NewDatabaseOnly(testutil.Logger(t), store)
	handlerAPI := &API{Opts: &Options{Zed: zed}}
	router := chi.NewRouter()
	router.Route("/instances/{instance_id}", func(r chi.Router) {
		r.Use(httpmw.InstanceIDMiddleware(zed))
		r.Get("/cosmetics", handlerAPI.InstanceCosmetics)
	})

	request := httptest.NewRequest(http.MethodGet, "/instances/"+instanceID.String()+"/cosmetics", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	require.Equal(t, "no-store", response.Header().Get("Cache-Control"))

	var result chroniclesdk.InstanceCosmeticsResponse
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &result))
	require.Equal(t, map[chroniclesdk.GUIDString]chroniclesdk.CosmeticSelection{
		activeGUID: {NameID: "name-gold", BorderID: "border-gold"},
	}, result.Players)

	emptyInstanceID := uuid.New()
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: emptyInstanceID, RealmID: realmID, LogGroupID: logGroupID,
		Name: "Empty", DifficultyName: "Normal", MaxPlayers: 40,
		StartTime: database.Timestamptz(now), EndTime: database.Timestamptz(now.Add(time.Hour)),
		Capabilities: []string{},
	})
	require.NoError(t, err)

	request = httptest.NewRequest(http.MethodGet, "/instances/"+emptyInstanceID.String()+"/cosmetics", nil)
	response = httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	require.JSONEq(t, `{"players":{}}`, response.Body.String())

}

func playerParams(id guid.GUID, realmID, instanceID uuid.UUID, now time.Time, outfit *database.PlayerOutfit, talents *database.PlayerTalents) database.UpsertPlayersParams {
	return database.UpsertPlayersParams{
		ID: id, RealmID: realmID, Name: id.String(),
		Class: database.WowPlayableClassWARRIOR, Gender: database.WowPlayableGenderMale,
		Race: database.WowPlayableRaceHuman, Gear: outfit, Level: 60, Talents: talents,
		UpdatedFromInstance: uuid.NullUUID{UUID: instanceID, Valid: true},
		UpdatedAt:           pgtype.Timestamptz{Time: now, Valid: true},
	}
}

func instancePlayerParams(instanceID uuid.UUID, id guid.GUID) database.InsertInstancePlayersParams {
	return database.InsertInstancePlayersParams{
		InstanceID: instanceID, UnitGuid: id, Name: id.String(), Level: 60,
		Class: database.WowPlayableClassWARRIOR, Race: database.WowPlayableRaceHuman,
	}
}
