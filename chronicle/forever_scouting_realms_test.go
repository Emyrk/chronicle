package chronicle

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/forever/scouting"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type scoutingRealmFake struct {
	server database.WowServer
	realms []database.WowServerRealm
	reads  int
}

func (s *scoutingRealmFake) GetWoWServer(_ context.Context, id uuid.UUID) (database.WowServer, error) {
	s.reads++
	return s.server, nil
}
func (s *scoutingRealmFake) ListWoWServerRealms(_ context.Context, id uuid.UUID) ([]database.WowServerRealm, error) {
	s.reads++
	return s.realms, nil
}

func TestScoutingRealmMappingIsAnchored(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct{ raw, want string }{
		{"CAMWOWUS1Realm1PvE", "Normal-US"},
		{"CAMWOWUS1Realm3PvE", "Normal-US"},
		{"CAMWOWUS1Realm5PvE", "Normal-US"},
		{"CAMWOWUS1Realm7PvE", "Normal-US"},
		{"CAMWOWUS2Realm3PvE", "Normal-US"},
		{"CAMWOWUS2Realm5PvE", "Normal-US"},
		{"CAMWOWUS2Realm7PvE", "Normal-US"},
		{"CAMWOW US2 Realm 1 PvE", "Normal-US"},
		{"CAMWOWUS1Realm6PvP", "PvP-US"},
		{"CAMWOWUS2Realm2PvP", "PvP-US"},
		{"CAMWOWUS2Realm4PvP", "PvP-US"},
		{"CAMWOWUS2Realm8PvP", "PvP-US"},
		{"CAMWOWUS2Realm10RPPvP", "Roleplay PvP-US"},
		{"CAMWOWUS1Realm123PvE", "Normal-US"},
		{"CAMWOWUS2Realm123PvP", "PvP-US"},
		{"CAMWOWUS2Realm123RPPvP", "Roleplay PvP-US"},
	} {
		require.Equal(t, tc.want, canonicalScoutingRealm(tc.raw), tc.raw)
	}
	for _, raw := range []string{
		"CAMWOWAU1Realm1PvE", "CAMWOWEU1Realm1PvE", "CAMWOWKR1Realm1PvE", "CAMWOWTW1Realm1PvE", "CAMWOWUS3Realm1PvE",
		"CAMWOWUS1Realm10RPPvP", "CAMWOWUS2Realm1RP", "CAMWOWUS2Realm1RPPvE",
		"CAMWOWUS2Realm5PvE-extra", "xCAMWOWUS2Realm5PvE", "CAMWOW US2 Realm 1 PvE ",
		"CAMWOWUS2Realm0PvE", "CAMWOWUS2Realm0PvP", "CAMWOWUS2Realm0RPPvP", "CAMWOWUS2Realm01PvE",
		"CAMWOWUS2Realm-1PvP", "CAMWOWUS2Realm1PvP-extra", "CAMWOWUS2Realm10RPPvP-extra",
	} {
		require.Equal(t, raw, canonicalScoutingRealm(raw), raw)
	}
}

func TestScoutingRealmResolutionBatchFailsClosed(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	normal := uuid.MustParse("1fcace1b-5a1c-4202-9614-173fe043d833")
	other := uuid.New()
	store := &scoutingRealmFake{server: database.WowServer{ID: foreverScoutingServerID, TenantID: uuid.NullUUID{UUID: tenant, Valid: true}}, realms: []database.WowServerRealm{
		{ID: normal, ServerID: foreverScoutingServerID, Name: "Normal-US"},
		{ID: other, ServerID: foreverScoutingServerID, Name: "Verified-Other"},
		{ID: uuid.New(), ServerID: uuid.New(), Name: "Foreign"},
	}}
	players := map[guid.GUID][]scouting.Player{
		1: {{Realm: "CAMWOWUS2Realm5PvE"}}, 2: {{Realm: "CAMWOW US2 Realm 1 PvE"}}, 3: {{}}, 4: {{Realm: "Unknown"}},
		5: {{Realm: "CAMWOWUS2Realm5PvE"}, {Realm: "Verified-Other"}}, 6: {{Realm: "Normal-US"}, {}},
		7: {{Realm: "Foreign"}}, 8: {{Realm: "CAMWOWUS2Realm5PvE-extra"}}, 9: {{Realm: "Normal-US"}, {Realm: "CAMWOW US2 Realm 1 PvE"}},
	}
	for id := guid.GUID(10); id < 1010; id++ {
		players[id] = []scouting.Player{{Realm: "CAMWOWUS2Realm5PvE"}}
	}
	for id, sources := range players {
		for i := range sources {
			sources[i].Name = "Player"
			sources[i].LastSeen = 20
			sources[i].Observations = []scouting.Observation{{At: 10, Name: "Player", Guild: ptr.Ref("Guild")}}
		}
		players[id] = sources
	}
	index := newTestScouting(t, players)
	resolved, err := resolveScoutingRealms(t.Context(), store, index, tenant)
	require.NoError(t, err)
	require.Equal(t, 2, store.reads)
	require.Len(t, resolved, 1003)
	require.Equal(t, normal, resolved[1])
	require.Equal(t, normal, resolved[2])
	require.Equal(t, normal, resolved[9])
	for _, id := range []guid.GUID{3, 4, 5, 6, 7, 8} {
		_, ok := resolved[id]
		require.False(t, ok)
	}
	payload, err := scoutingPayload(index, resolved)
	require.NoError(t, err)
	var rows []scoutingPlayerInput
	require.NoError(t, json.Unmarshal(payload, &rows))
	require.Len(t, rows, 1003)
	for _, row := range rows {
		require.Equal(t, normal, row.RealmID)
	}
	store.reads = 0
	resolved, err = resolveScoutingRealms(t.Context(), store, index, uuid.New())
	require.NoError(t, err)
	require.Empty(t, resolved)
	require.Equal(t, 1, store.reads)
	store.reads = 0
	resolved, err = resolveScoutingRealms(t.Context(), store, index, uuid.Nil)
	require.NoError(t, err)
	require.Empty(t, resolved)
	require.Zero(t, store.reads)
	store.server.ID = uuid.New()
	resolved, err = resolveScoutingRealms(t.Context(), store, index, tenant)
	require.NoError(t, err)
	require.Empty(t, resolved)
	store.server.ID = foreverScoutingServerID
	store.server.TenantID.Valid = false
	resolved, err = resolveScoutingRealms(t.Context(), store, index, tenant)
	require.NoError(t, err)
	require.Empty(t, resolved)
	payload, err = scoutingPayload(index, resolved)
	require.NoError(t, err)
	require.JSONEq(t, `[]`, string(payload))
}

func TestScoutingTimelineRejectsUnresolvedAndCrossRealm(t *testing.T) {
	t.Parallel()
	upload, foreign := uuid.New(), uuid.New()
	index := newTestScouting(t, map[guid.GUID][]scouting.Player{1: {{Name: "Scout", Observations: []scouting.Observation{{At: 10, Name: "Scout", Level: ptr.Ref(60)}}}}})
	for _, realms := range []map[guid.GUID]uuid.UUID{nil, {1: foreign}, {1: uuid.Nil}} {
		unit := &messages.Unit{MessageBase: messages.Base(time.Unix(20, 0)), Info: unitinfo.Info{Guid: 1}}
		advancer := scoutingAdvancer{source: scoutingTestSource{messages: []messages.Message{unit}}, players: index, realms: realms, uploadRealmID: upload}
		batch, _ := advancer.Advance(t.Context())
		require.Same(t, unit, batch[0])
		require.Empty(t, unit.Name)
		require.Zero(t, unit.Level)
		require.Nil(t, unit.LevelObservedAt)
	}
}

func TestScoutingMixedConfirmedRealmsRemainDistinct(t *testing.T) {
	t.Parallel()
	tenant, normal, pvp, roleplay := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	store := &scoutingRealmFake{server: database.WowServer{ID: foreverScoutingServerID, TenantID: uuid.NullUUID{UUID: tenant, Valid: true}}, realms: []database.WowServerRealm{
		{ID: normal, ServerID: foreverScoutingServerID, Name: "Normal-US"},
		{ID: pvp, ServerID: foreverScoutingServerID, Name: "PvP-US"},
		{ID: roleplay, ServerID: foreverScoutingServerID, Name: "Roleplay PvP-US"},
	}}
	players := map[guid.GUID][]scouting.Player{
		1: {{Realm: "CAMWOWUS1Realm7PvE"}},
		2: {{Realm: "CAMWOWUS1Realm6PvP"}},
		3: {{Realm: "CAMWOWUS2Realm10RPPvP"}},
		4: {{Realm: "CAMWOWAU1Realm1PvE"}},
		5: {{Race: "Skyborne", Gender: ptr.Ref(2)}},
		6: {{Realm: "CAMWOWUS2Realm5PvE"}, {Realm: "CAMWOWUS2Realm4PvP"}},
		7: {{Realm: "CAMWOWUS3Realm1PvE"}},
	}
	for id, sources := range players {
		for i := range sources {
			sources[i].Name = "Synthetic"
			sources[i].LastSeen = 20
			sources[i].Observations = []scouting.Observation{{At: 10, Name: "Synthetic", Guild: ptr.Ref("Synthetic Guild")}}
		}
		players[id] = sources
	}
	index := newTestScouting(t, players)
	resolved, err := resolveScoutingRealms(t.Context(), store, index, tenant)
	require.NoError(t, err)
	require.Equal(t, 2, store.reads)
	require.Equal(t, map[guid.GUID]uuid.UUID{1: normal, 2: pvp, 3: roleplay}, resolved)
	payload, err := scoutingPayload(index, resolved)
	require.NoError(t, err)
	var rows []scoutingPlayerInput
	require.NoError(t, json.Unmarshal(payload, &rows))
	require.Len(t, rows, 3)
	for i, row := range rows {
		require.Equal(t, guid.GUID(i+1).String(), row.ID)
		require.Equal(t, resolved[guid.GUID(i+1)], row.RealmID)
		require.Nil(t, row.Race)
		require.Nil(t, row.Gender)
	}
}

func TestScoutingGroupDepartureDoesNotExcludeArmoryPayload(t *testing.T) {
	t.Parallel()
	realm := uuid.New()
	index := newTestScouting(t, map[guid.GUID][]scouting.Player{1: {{Name: "Synthetic", Realm: "CAMWOWUS2Realm5PvE", LastSeen: 140, Observations: []scouting.Observation{{At: 140, Name: "Synthetic", Level: ptr.Ref(19), Guild: ptr.Ref("Guild"), Party: ptr.Ref(false)}}}}})
	payload, err := scoutingPayload(index, map[guid.GUID]uuid.UUID{1: realm})
	require.NoError(t, err)
	var rows []scoutingPlayerInput
	require.NoError(t, json.Unmarshal(payload, &rows))
	require.Len(t, rows, 1)
	require.Equal(t, realm, rows[0].RealmID)
	require.True(t, rows[0].GuildKnown)
	require.Equal(t, int64(140), rows[0].GuildObservedAt.Unix())
	require.Equal(t, int64(140), rows[0].LevelObservedAt.Unix())
}
