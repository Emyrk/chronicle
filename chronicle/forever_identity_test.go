package chronicle

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/blizzard/modern"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/forever/scouting"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func combatIdentityFixture(t *testing.T, names ...string) *modern.PlayerIdentityIndex {
	t.Helper()
	var input strings.Builder
	for _, name := range names {
		fmt.Fprintf(&input, "10/7/2026 22:00:02.000  SPELL_CAST_SUCCESS,Player-1-00000001,%q,0x518,0x80000000,0000000000000000,nil,0x80000000,0x80000000,686,\"Shadow Bolt\",0x20\n", name)
	}
	index, err := modern.PreflightPlayerIdentities(t.Context(), strings.NewReader(input.String()))
	require.NoError(t, err)
	return index
}

func TestForeverIdentityReconciliation(t *testing.T) {
	t.Parallel()
	const id guid.GUID = 1<<32 | 1
	server, us, eu := uuid.New(), uuid.New(), uuid.New()
	catalog := newParticipantRealmCatalog(server, []database.WowServerRealm{{ID: us, ServerID: server, Name: "Normal-US"}, {ID: eu, ServerID: server, Name: "Normal-EU"}})
	for _, tc := range []struct {
		name     string
		combat   []string
		scouts   []scouting.Player
		want     uuid.UUID
		inferred bool
		level    int
	}{
		{name: "combat discards other name before merge", combat: []string{"Alice-Normal-US"}, scouts: []scouting.Player{{Name: "Alice", Realm: "Normal-US", Observations: []scouting.Observation{{Name: "Alice", At: 10, Level: ptr.Ref(20)}}}, {Name: "Bob", Realm: "Normal-US", Observations: []scouting.Observation{{Name: "Bob", At: 50, Level: ptr.Ref(60)}}}}, want: us, level: 20},
		{name: "same name other realm history excluded", combat: []string{"Alice-Normal-US"}, scouts: []scouting.Player{{Name: "Alice", Realm: "Normal-EU", Observations: []scouting.Observation{{Name: "Alice", At: 50, Level: ptr.Ref(60)}}}, {Name: "Alice", Realm: "Normal-US", Observations: []scouting.Observation{{Name: "Alice", At: 10, Level: ptr.Ref(20)}}}}, want: us, level: 20},
		{name: "combat overrides unknown artifact realm", combat: []string{"Alice-Normal-US"}, scouts: []scouting.Player{{Name: "Alice", Realm: "unsupported"}}, want: us},
		{name: "combat first realm wins", combat: []string{"Alice-Normal-US", "Alice-Normal-EU"}, scouts: []scouting.Player{{Name: "Alice", Realm: "Normal-US"}}, want: us},
		{name: "combat unmapped forbids fallback", combat: []string{"Alice-Unmapped"}, scouts: []scouting.Player{{Name: "Alice", Realm: "Normal-US"}}},
		{name: "later collision forbids all", combat: []string{"Alice-Normal-US", "Bob-Normal-US"}, scouts: []scouting.Player{{Name: "Alice", Realm: "Normal-US"}}},
		{name: "unknown-realm combat collision", combat: []string{"Alice", "Bob"}, scouts: []scouting.Player{{Name: "Alice", Realm: "Normal-US"}}},
		{name: "infer only missing realm", combat: []string{"Alice"}, scouts: []scouting.Player{{Name: "Alice", Realm: "CAMWOWUS1Realm1PvE"}}, want: us, inferred: true},
		{name: "scouting only preserved", scouts: []scouting.Player{{Name: "Alice", Realm: "Normal-EU"}}, want: eu, inferred: true},
		{name: "scouting-only names ambiguous", scouts: []scouting.Player{{Name: "Alice", Realm: "Normal-US"}, {Name: "Bob", Realm: "Normal-US"}}},
		{name: "independent realm conflict", scouts: []scouting.Player{{Name: "Alice", Realm: "Normal-US"}, {Name: "Alice", Realm: "Normal-EU"}}},
		{name: "independent unknown realm", scouts: []scouting.Player{{Name: "Alice", Realm: "Normal-US"}, {Name: "Alice"}}},
		{name: "no catalog row", scouts: []scouting.Player{{Name: "Alice", Realm: "CAMWOWAU1Realm1PvE"}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			original := newTestScouting(t, map[guid.GUID][]scouting.Player{id: tc.scouts})
			filtered, realms, identity := reconcileForeverScouting(original, combatIdentityFixture(t, tc.combat...), catalog)
			if tc.want == uuid.Nil {
				require.Empty(t, realms)
				require.Zero(t, filtered.Len())
				return
			}
			require.Equal(t, tc.want, realms[id])
			snapshot, ok := filtered.Latest(id)
			require.True(t, ok)
			require.Equal(t, "Alice", snapshot.Name)
			_, inferred := identity.inferred[id]
			require.Equal(t, tc.inferred, inferred)
			raw, ok := identity.LookupPlayerRealm(id, "Alice")
			require.True(t, ok)
			require.Equal(t, tc.want, catalog.resolve(raw).UUID)
			_, ok = identity.LookupPlayerRealm(id, "Other")
			require.False(t, ok)
			if tc.level > 0 {
				require.Equal(t, tc.level, *snapshot.Known.Level.Level)
			} else {
				require.Nil(t, snapshot.Known.Name, "untimestamped scalars must not manufacture observation clocks")
				require.Nil(t, snapshot.Known.Level)
			}
			// Returned filtering must never alter the retained raw sources.
			require.Equal(t, len(tc.scouts), len(original.SourceNames(id)))
		})
	}
}

func TestForeverReconciledTimelineAndParticipantRealm(t *testing.T) {
	t.Parallel()
	const id guid.GUID = 1<<32 | 1
	server, home := uuid.New(), uuid.New()
	catalog := newParticipantRealmCatalog(server, []database.WowServerRealm{{ID: home, ServerID: server, Name: "Normal-EU"}})
	scouts := newTestScouting(t, map[guid.GUID][]scouting.Player{id: {{Name: "Alice", Realm: "Normal-EU", LastSeen: 50, Observations: []scouting.Observation{{Name: "Alice", At: 20, Level: ptr.Ref(30), Guild: ptr.Ref("Never inject")}}}}})
	filtered, realms, identity := reconcileForeverScouting(scouts, combatIdentityFixture(t, "Alice"), catalog)
	units := unitdb.New(nil)
	units.SetPlayerRealmLookup(identity)
	units.UpdatePlayer(combatant.Combatant{Guid: id, Name: "Alice"})
	builder := newInstanceBuilder(units, uuid.New())
	builder.realmCatalog = catalog
	builder.participate(id)
	require.Equal(t, uuid.NullUUID{UUID: home, Valid: true}, builder.participants[0].RealmID)
	before := &messages.Unit{MessageBase: messages.Base(time.Unix(10, 0)), Info: unitinfo.Info{Guid: id, Name: "Alice"}}
	after := &messages.Unit{MessageBase: messages.Base(time.Unix(30, 0)), Info: unitinfo.Info{Guid: id, Name: "Alice"}}
	adv := scoutingAdvancer{source: scoutingTestSource{messages: []messages.Message{before, after}}, players: filtered, realms: realms, identity: identity}
	batch, _ := adv.Advance(t.Context())
	require.Zero(t, batch[0].(*messages.Unit).Level)
	require.Equal(t, int32(30), batch[1].(*messages.Unit).Level)
	require.Equal(t, int64(20), batch[1].(*messages.Unit).LevelObservedAt.Unix())
	require.False(t, batch[1].(*messages.Unit).CanCooperate)
	require.Zero(t, after.Level)
}

func TestForeverIdentityCatalogTenantScope(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	for _, wrong := range []bool{false, true} {
		store := &scoutingRealmFake{server: database.WowServer{ID: foreverScoutingServerID, TenantID: uuid.NullUUID{UUID: tenant, Valid: true}}, realms: []database.WowServerRealm{{ID: uuid.New(), ServerID: uuid.New(), Name: "Normal-US"}, {ID: uuid.New(), ServerID: foreverScoutingServerID, Name: "Unknown"}}}
		wanted := tenant
		if wrong {
			wanted = uuid.New()
		}
		catalog, err := loadForeverIdentityCatalog(t.Context(), store, wanted)
		require.NoError(t, err)
		require.False(t, catalog.resolve("Normal-US").Valid)
		require.False(t, catalog.resolve("Unknown").Valid)
	}
}

func TestLateCombatMetadataBlocksDirectScoutingWrite(t *testing.T) {
	t.Parallel()
	const id guid.GUID = 1<<32 | 1
	server, home := uuid.New(), uuid.New()
	catalog := newParticipantRealmCatalog(server, []database.WowServerRealm{{ID: home, ServerID: server, Name: "Normal-US"}})
	scouts := newTestScouting(t, map[guid.GUID][]scouting.Player{id: {{Name: "Alice", Realm: "Normal-US"}}})
	filtered, realms, identity := reconcileForeverScouting(scouts, combatIdentityFixture(t, "Alice-Normal-US"), catalog)
	units := unitdb.New(nil)
	units.SetPlayerRealmLookup(identity)
	units.UpdatePlayer(combatant.Combatant{Guid: id, Name: "Other"})
	finalizeScoutingRealms(units, realms)
	require.Empty(t, realms)
	payload, err := scoutingPayload(filtered, realms)
	require.NoError(t, err)
	require.JSONEq(t, `[]`, string(payload))
}
