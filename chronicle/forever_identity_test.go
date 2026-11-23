package chronicle

import (
	"context"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"io"
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

type identityFixture struct {
	names  []string
	realms map[string]string
}

func (f *identityFixture) ObservedPlayerNames(guid.GUID) []string {
	return append([]string(nil), f.names...)
}
func (f *identityFixture) LookupPlayerRealm(_ guid.GUID, name string) (string, bool) {
	raw, ok := f.realms[name]
	return raw, ok
}
func combatIdentityFixture(t *testing.T, names ...string) *identityFixture {
	t.Helper()
	f := &identityFixture{realms: make(map[string]string)}
	for _, raw := range names {
		f.add(raw)
	}
	return f
}
func (f *identityFixture) add(raw string) {
	name := modern.NormalizePlayerName(raw)
	f.names = append(f.names, name)
	if raw != name {
		if _, ok := f.realms[name]; !ok {
			f.realms[name] = strings.TrimPrefix(raw, name+"-")
		}
	}
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
	payload, err := scoutingPayload(filtered, realms, time.Unix(1000, 0))
	require.NoError(t, err)
	require.JSONEq(t, `[]`, string(payload))
}

// Each call exposes exactly one batch, so these tests cannot accidentally rely
// on parser read-ahead or a preflight having already seen the late identity.
type streamingScoutingSource struct{ batches [][]messages.Message }

func (s *streamingScoutingSource) Advance(context.Context) ([]messages.Message, error) {
	if len(s.batches) == 0 {
		return nil, io.EOF
	}
	batch := s.batches[0]
	s.batches = s.batches[1:]
	return batch, nil
}

func TestStreamingScoutingLateIdentity(t *testing.T) {
	t.Parallel()
	const id guid.GUID = 1<<32 | 1
	server, us, eu := uuid.New(), uuid.New(), uuid.New()
	catalog := newParticipantRealmCatalog(server, []database.WowServerRealm{{ID: us, ServerID: server, Name: "Normal-US"}, {ID: eu, ServerID: server, Name: "Normal-EU"}})
	for _, tc := range []struct {
		name, first, late, realm string
		collision                bool
		want                     uuid.UUID
	}{
		{name: "late collision", first: "Alice", late: "Bob", realm: "Normal-US", collision: true},
		{name: "late different combat identity", late: "Bob", realm: "Normal-US"},
		{name: "late unmapped authoritative realm", first: "Alice", late: "Alice", realm: "Unmapped"},
		{name: "late different realm", first: "Alice", late: "Alice", realm: "Normal-EU"},
		{name: "late matching realm", first: "Alice", late: "Alice", realm: "Normal-US", want: us},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			scouts := newTestScouting(t, map[guid.GUID][]scouting.Player{id: {{Name: "Alice", Realm: "Normal-US", Race: "Human", Gender: ptr.Ref(3), LastSeen: 50, Observations: []scouting.Observation{{At: 10, Name: "Alice", Level: ptr.Ref(60)}}}}})
			raw := &combatIdentity{}
			_, realms, identity := reconcileForeverScouting(scouts, raw, catalog)
			units := unitdb.New(nil)
			units.SetPlayerRealmLookup(identity)
			first := &messages.Combatant{MessageBase: messages.Base(time.Unix(5, 0)), Combatant: combatant.Combatant{Guid: id, Name: tc.first, Seen: time.Unix(5, 0)}}
			unit := &messages.Unit{MessageBase: messages.Base(time.Unix(20, 0)), Info: unitinfo.Info{Guid: id, Name: tc.first}}
			late := &messages.Combatant{MessageBase: messages.Base(time.Unix(30, 0)), Combatant: combatant.Combatant{Guid: id, Name: tc.late, RawRealm: tc.realm, Seen: time.Unix(30, 0)}}
			source := &streamingScoutingSource{batches: [][]messages.Message{{first, unit}, {late}}}
			adv := scoutingAdvancer{source: source, players: scouts, realms: realms, identity: identity, catalog: catalog}
			batch, err := adv.Advance(t.Context())
			require.NoError(t, err)
			require.Equal(t, types.HeroRacesHuman, batch[0].(*messages.Combatant).Race)
			require.Equal(t, int32(60), batch[1].(*messages.Unit).Level)
			units.Update(batch[1].(*messages.Unit).Info)
			units.UpdatePlayer(batch[0].(*messages.Combatant).Combatant)
			require.False(t, units.PlayerIdentityAmbiguous(id))
			batch, err = adv.Advance(t.Context())
			require.NoError(t, err)
			if tc.want == uuid.Nil {
				require.Empty(t, batch[0].(*messages.Combatant).Race)
			}
			units.UpdatePlayer(batch[0].(*messages.Combatant).Combatant)
			filtered, finalRealms := finalizeForeverScouting(scouts, identity, catalog)
			units.RefreshPlayerRealms()
			finalizeScoutingRealms(units, finalRealms)
			require.Equal(t, tc.collision, units.PlayerIdentityAmbiguous(id))
			require.Equal(t, tc.want, finalRealms[id])
			if tc.want == uuid.Nil {
				require.Zero(t, filtered.Len())
			}
			// A now-rejected inferred realm must not survive a stale cached fallback.
			if tc.late == "Bob" {
				require.Empty(t, units.PlayerRawRealm(id, "Alice", "Normal-US"))
			}
		})
	}
}

func TestStreamingScoutingFiltersSourcesBeforeMerge(t *testing.T) {
	t.Parallel()
	const id guid.GUID = 1<<32 | 1
	server, us, eu := uuid.New(), uuid.New(), uuid.New()
	catalog := newParticipantRealmCatalog(server, []database.WowServerRealm{{ID: us, ServerID: server, Name: "Normal-US"}, {ID: eu, ServerID: server, Name: "Normal-EU"}})
	scouts := newTestScouting(t, map[guid.GUID][]scouting.Player{id: {
		{Name: "Alice", Realm: "Normal-US", Race: "Human", Observations: []scouting.Observation{{At: 10, Name: "Alice", Level: ptr.Ref(20)}}},
		{Name: "Alice", Realm: "Normal-EU", Race: "Orc", Observations: []scouting.Observation{{At: 20, Name: "Alice", Level: ptr.Ref(60)}}},
		{Name: "Bob", Realm: "Normal-US", Race: "Troll", Observations: []scouting.Observation{{At: 30, Name: "Bob", Level: ptr.Ref(70)}}},
	}})
	raw := &combatIdentity{}
	_, realms, identity := reconcileForeverScouting(scouts, raw, catalog)
	require.Empty(t, realms)
	source := &streamingScoutingSource{batches: [][]messages.Message{{
		&messages.Unit{MessageBase: messages.Base(time.Unix(40, 0)), Info: unitinfo.Info{Guid: id, Name: "Alice", RawRealm: "Normal-US"}},
		&messages.Combatant{MessageBase: messages.Base(time.Unix(5, 0)), Combatant: combatant.Combatant{Guid: id, Name: "Alice"}},
	}}}
	adv := scoutingAdvancer{source: source, players: scouts, realms: realms, identity: identity, catalog: catalog}
	batch, err := adv.Advance(t.Context())
	require.NoError(t, err)
	require.Equal(t, int32(20), batch[0].(*messages.Unit).Level)
	require.Equal(t, types.HeroRacesHuman, batch[1].(*messages.Combatant).Race)
	filtered, finalRealms := finalizeForeverScouting(scouts, identity, catalog)
	require.Equal(t, us, finalRealms[id])
	require.Equal(t, 20, *filtered.KnownAt(id, 40).Level.Level)
}
