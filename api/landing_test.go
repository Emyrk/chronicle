package api

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/api/chronicleproto/types2proto"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestLandingFeatured(t *testing.T) {
	t.Parallel()

	store, _ := dbtestutil.NewDB(t)
	ctx := testutil.Context(t, testutil.WaitLong)

	start := time.Date(2026, 10, 20, 20, 0, 0, 0, time.UTC)
	end := start.Add(30 * time.Minute)
	instanceID := seedLandingInstance(t, store, start, end, nil, 0)

	zed := authz.NewDatabaseOnly(testutil.Logger(t), store)
	opts := &Options{Zed: zed, Logger: testutil.Logger(t)}
	// Map 33 has a published dungeon mesh; every other map does not.
	handlerAPI := &API{AppContext: ctx, Opts: opts, landingMeshMaps: func(context.Context, uuid.UUID) (map[int32]bool, error) {
		return map[int32]bool{33: true}, nil
	}}
	router := chi.NewRouter()
	router.Get("/landing/featured", handlerAPI.LandingFeatured)
	router.Put("/site-config", handlerAPI.AdminUpdateSiteConfig)

	getFeatured := func() *chroniclesdk.LandingFeaturedRun {
		t.Helper()
		res := httptest.NewRecorder()
		router.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/landing/featured", nil))
		require.Equal(t, http.StatusOK, res.Code, res.Body.String())
		var out chroniclesdk.LandingFeaturedResponse
		require.NoError(t, json.Unmarshal(res.Body.Bytes(), &out))
		return out.Featured
	}
	setFeatured := func(id string) int {
		t.Helper()
		body := `{"landing_featured_instance_id":"` + id + `"}`
		res := httptest.NewRecorder()
		router.ServeHTTP(res, httptest.NewRequest(http.MethodPut, "/site-config", strings.NewReader(body)))
		return res.Code
	}

	require.Nil(t, getFeatured(), "nothing configured and no positional run")

	require.Equal(t, http.StatusOK, setFeatured(instanceID.String()))
	delay := (3 * time.Minute).Milliseconds()
	require.Equal(t, &chroniclesdk.LandingFeaturedRun{
		InstanceID:   instanceID,
		InstanceName: "Ruins of Lordaeron",
		DurationMs:   (30 * time.Minute).Milliseconds(),
		PlayerCount:  2,
		Bosses: []chroniclesdk.LandingFeaturedBoss{{
			Name:          "The Butcher",
			StartOffsetMs: (10 * time.Minute).Milliseconds(),
			EndOffsetMs:   (12 * time.Minute).Milliseconds(),
		}},
		Deaths: []chroniclesdk.LandingFeaturedDeath{
			{OffsetMs: (5 * time.Minute).Milliseconds(), VictimName: "Tanky", VictimClass: "WARRIOR"},
			{OffsetMs: (11 * time.Minute).Milliseconds(), VictimName: "Healy", VictimClass: "PRIEST", KillerName: "The Butcher"},
		},
		Upload: chroniclesdk.LandingFeaturedUpload{Source: chroniclesdk.LandingUploadSourceSidekick, DelayMs: &delay},
		Encounter: &chroniclesdk.LandingFeaturedEncounter{
			ID:            butcherKill(t, store, instanceID),
			Name:          "The Butcher",
			Kill:          true,
			StartOffsetMs: (10 * time.Minute).Milliseconds(),
			EndOffsetMs:   (12 * time.Minute).Milliseconds(),
		},
	}, getFeatured())

	require.Equal(t, http.StatusBadRequest, setFeatured("not-a-uuid"))
	require.Equal(t, http.StatusBadRequest, setFeatured(uuid.NewString()))

	require.Equal(t, http.StatusOK, setFeatured(""))
	require.Nil(t, getFeatured(), "setting cleared")

	// With nothing configured, the hero plays the newest positional run whose
	// last boss pull has a mesh: its last kill, not a later wipe.
	older := seedLandingInstance(t, store, start.Add(24*time.Hour), end.Add(24*time.Hour), []string{"unit-position"}, 33)
	newer := seedLandingInstance(t, store, start.Add(48*time.Hour), end.Add(48*time.Hour), []string{"unit-position"}, 33,
		database.InsertEncounterParams{Name: "Overseer", Boss: true, KillType: database.KillTypeWipe, MapID: 33,
			StartTime: database.Timestamptz(start.Add(48*time.Hour + 20*time.Minute)), EndTime: database.Timestamptz(start.Add(48*time.Hour + 21*time.Minute))})
	// Newer still, but on a map without a published mesh.
	seedLandingInstance(t, store, start.Add(72*time.Hour), end.Add(72*time.Hour), []string{"unit-position"}, 34)
	handlerAPI.landing.invalidate()
	picked := getFeatured()
	require.NotNil(t, picked)
	require.Equal(t, newer, picked.InstanceID)
	require.Equal(t, &chroniclesdk.LandingFeaturedEncounter{
		ID:            butcherKill(t, store, newer),
		Name:          "The Butcher",
		Kill:          true,
		StartOffsetMs: (10 * time.Minute).Milliseconds(),
		EndOffsetMs:   (12 * time.Minute).Milliseconds(),
	}, picked.Encounter)
	require.Len(t, picked.Bosses, 2)

	// The admin's featured run wins over the pick, playing its own last boss pull.
	require.Equal(t, http.StatusOK, setFeatured(older.String()))
	overridden := getFeatured()
	require.Equal(t, older, overridden.InstanceID)
	require.Equal(t, butcherKill(t, store, older), overridden.Encounter.ID)
	require.Equal(t, http.StatusOK, setFeatured(""))

	// The deployment default applies while the site setting is empty, and wins over the pick.
	opts.LandingFeaturedID = instanceID
	handlerAPI.landing.invalidate()
	require.Equal(t, instanceID, getFeatured().InstanceID)
}

// butcherKill is the seeded instance's The Butcher encounter.
func butcherKill(t *testing.T, store database.Store, instanceID uuid.UUID) uuid.UUID {
	t.Helper()
	encounters, err := store.EncountersByInstanceID(testutil.Context(t, testutil.WaitShort), instanceID)
	require.NoError(t, err)
	for _, enc := range encounters {
		if enc.Name == "The Butcher" {
			return enc.ID
		}
	}
	t.Fatalf("no The Butcher encounter on %s", instanceID)
	return uuid.Nil
}

// seedLandingInstance seeds a run with a trash pull and a The Butcher kill on
// mapID, plus the extra encounters.
func seedLandingInstance(t *testing.T, store database.Store, start, end time.Time, capabilities []string, mapID int32, extra ...database.InsertEncounterParams) uuid.UUID {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitMedium)

	serverID, realmID, ownerID, logGroupID, instanceID := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
	_, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: serverID, Name: "server-" + serverID.String()[:8]})
	require.NoError(t, err)
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realmID, ServerID: serverID, Name: "realm-" + realmID.String()[:8]})
	require.NoError(t, err)
	_, err = store.InsertUser(ctx, database.InsertUserParams{ID: ownerID, Username: "owner-" + ownerID.String()[:8]})
	require.NoError(t, err)
	uploaded := end.Add(3 * time.Minute)
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: ownerID, LogType: database.LogTypeV1,
		UploadSource: database.NullUploadSource{UploadSource: database.UploadSourceSidekick, Valid: true},
		CreatedAt:    database.Timestamptz(uploaded), UpdatedAt: database.Timestamptz(uploaded),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
		Name: "Ruins of Lordaeron", DifficultyName: "Normal", MaxPlayers: 5,
		StartTime: database.Timestamptz(start), EndTime: database.Timestamptz(end),
		Capabilities: append([]string{}, capabilities...),
	})
	require.NoError(t, err)

	tank := guid.GUID(1)
	healer := guid.GUID(2)
	butcher := guid.GUID(0xF130000001000001)
	for _, enc := range append([]database.InsertEncounterParams{
		{Name: "Trash", Boss: false, KillType: database.KillTypeClean, MapID: mapID, StartTime: database.Timestamptz(start.Add(4 * time.Minute)), EndTime: database.Timestamptz(start.Add(6 * time.Minute))},
		{Name: "The Butcher", Boss: true, KillType: database.KillTypeClean, MapID: mapID, StartTime: database.Timestamptz(start.Add(10 * time.Minute)), EndTime: database.Timestamptz(start.Add(12 * time.Minute))},
	}, extra...) {
		enc.ID, enc.InstanceID, enc.Remaining = uuid.New(), instanceID, guid.GUIDs{}
		_, err = store.InsertEncounter(ctx, enc)
		require.NoError(t, err)
	}
	store.InsertInstancePlayers(ctx, []database.InsertInstancePlayersParams{
		{InstanceID: instanceID, UnitGuid: tank, Name: "Tanky", Level: 60, Class: database.WowPlayableClassWARRIOR, Race: database.WowPlayableRaceOrc},
		{InstanceID: instanceID, UnitGuid: healer, Name: "Healy", Level: 60, Class: database.WowPlayableClassPRIEST, Race: database.WowPlayableRaceTroll},
	}).Exec(func(_ int, err error) { require.NoError(t, err) })
	store.InsertInstanceUnits(ctx, []database.InsertInstanceUnitsParams{
		{InstanceID: instanceID, UnitGuid: butcher, Name: "The Butcher", Entry: 1},
	}).Exec(func(_ int, err error) { require.NoError(t, err) })

	// Two encounter segments, encoded the way the parser stores them. The
	// boss's own death is not a player death and must be skipped.
	var raw []byte
	for _, seg := range []struct {
		first  time.Time
		deaths []*messages.Slain
	}{
		{first: start.Add(4 * time.Minute), deaths: []*messages.Slain{{MessageBase: messages.Base(start.Add(5 * time.Minute)), Victim: tank}}},
		{first: start.Add(10 * time.Minute), deaths: []*messages.Slain{
			{MessageBase: messages.Base(start.Add(11 * time.Minute)), Victim: healer, Killer: &butcher},
			{MessageBase: messages.Base(start.Add(12 * time.Minute)), Victim: butcher, Killer: &tank},
		}},
	} {
		b := encounterevents.NewBuilder[*messages.Slain, *chronicleproto.Slain]()
		b.SetZero(seg.first)
		for i, d := range seg.deaths {
			require.NoError(t, encounterevents.AddToBuilder(b, d, int32(i), types2proto.Slain))
		}
		data, err := b.Finalize(uuid.New())
		require.NoError(t, err)
		raw = append(raw, data...)
	}
	var gz bytes.Buffer
	zw := gzip.NewWriter(&gz)
	_, err = zw.Write(raw)
	require.NoError(t, err)
	require.NoError(t, zw.Close())
	store.InsertLogInstanceEvents(ctx, []database.InsertLogInstanceEventsParams{
		{InstanceID: instanceID, Type: database.LogInstanceEventTypeSlain, Events: gz.Bytes()},
	}).Exec(func(_ int, err error) { require.NoError(t, err) })

	return instanceID
}
