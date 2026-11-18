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
	for _, raw := range []string{"CAMWOWUS2Realm5PvE", "CAMWOW US2 Realm 1 PvE"} {
		require.Equal(t, "Normal-US", canonicalScoutingRealm(raw))
	}
	for _, raw := range []string{"CAMWOWUS2Realm5PvP", "CAMWOWUS2Realm5PvE-extra", "xCAMWOWUS2Realm5PvE", "CAMWOWKRRealm5PvE", "CAMWOWUS1Realm5PvE", "CAMWOW US2 Realm 1 PvE ", "CAMWOWUS2Realm0PvE", "CAMWOWUS2Realm5RP"} {
		require.Equal(t, raw, canonicalScoutingRealm(raw))
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
