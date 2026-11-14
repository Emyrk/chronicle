package encounters

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/common/creatures"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/auras"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/consumeevidence"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/overviewmetrics"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/loot"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/participants"
	"github.com/Emyrk/chronicle/combatlog/parser/common/raidgroups"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/common/vehicles"
	"github.com/Emyrk/chronicle/combatlog/parser/common/zoner"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

type encounterGraphFixture struct {
	recipe *GraphRecipe
	hooks  []*instances.HookableGraphRecipe
	id     identifier.TrustedRecipe
	ctx    context.Context
	calls  int
}

func newEncounterGraphFixture(t *testing.T) *encounterGraphFixture {
	t.Helper()
	f := &encounterGraphFixture{ctx: parsectx.With(t.Context(), parsectx.Context{Format: database.LogFormat243CcAddon}), id: identifier.TrustedRecipe{ID: "empty", Factory: func() *identifier.Identifier {
		return identifier.NewIdentifier(map[uint32]identifier.Identity{100: {Name: "boss", Boss: true, Affiliation: types.AffiliationHostile}})
	}}}
	for _, name := range []string{"one", "two"} {
		f.hooks = append(f.hooks, &instances.HookableGraphRecipe{ID: name, Name: name, Format: database.LogFormat243CcAddon, Factories: characters.TrustedFactoryRecipe{ID: "common"}, MatchesZone: func(z zone.Zone) bool { return z.Name == name }})
	}
	f.recipe = &GraphRecipe{ID: "zones", DurationModifiers: &chrondbc.DurationModifierSet{}, Catalog: &chrondbc.ConsumableCatalog{}}
	f.recipe.Resolver = func(_ bool, z zone.Zone, u *unitdb.Units) *instances.Hookable {
		f.calls++
		for _, r := range f.hooks {
			if r.MatchesZone(z) {
				id, err := f.id.New()
				require.NoError(t, err)
				h, err := r.New(f.ctx, slog.Default(), u, z, id)
				require.NoError(t, err)
				return h
			}
		}
		return nil
	}
	return f
}
func (f *encounterGraphFixture) registry(t *testing.T, capture *State) *ownergraph.Registry {
	t.Helper()
	r := ownergraph.NewRegistry()
	identity := snapshot.Compatibility{DatasetID: "00000000-0000-0000-0000-000000000005", DatasetRevision: 1, BuildIdentity: "sha256:" + strings.Repeat("a", 64), Format: string(database.LogFormat243CcAddon), Flavor: "tbc"}
	a := auras.GraphOptions{DurationModifiers: f.recipe.DurationModifiers, Compatibility: identity}
	if capture != nil {
		a.ObserverTracking = capture.Auras
	}
	for _, err := range []error{
		RegisterGraphOwner(r, f.recipe), zoner.RegisterGraphOwner(r), auras.RegisterGraphOwners(r, a), consumeevidence.RegisterGraphOwners(r, consumeevidence.GraphOptions{Catalog: f.recipe.Catalog, Compatibility: identity}),
		instances.RegisterHookableGraphOwner(r, f.hooks...), instances.RegisterOngoingFightGraphOwner(r), instances.RegisterPhaseTrackerGraphOwner(r, nil),
		characters.RegisterGraphOwners(r, characters.GraphOptions{Factories: f.hooks[0].Factories, Identifier: f.id, ValidateRuntime: instances.ValidateHookableCharactersRuntime}),
		period.RegisterGraphOwners(r), unitdb.RegisterGraphOwner(r), identifier.RegisterGraphOwner(r, f.id), messages.RegisterDamageGraphOwner(r), encounterevents.RegisterGraphOwners(r), rankings.RegisterEngagementGraphOwner(r), overviewmetrics.RegisterGraphOwner(r), loot.RegisterGraphOwners(r), armory.RegisterGraphOwner(r), participants.RegisterGraphOwner(r), vehicles.RegisterGraphOwner(r), raidgroups.RegisterGraphOwner(r),
	} {
		require.NoError(t, err)
	}
	return r
}
func (f *encounterGraphFixture) state(t *testing.T) *State {
	t.Helper()
	s, err := f.recipe.New(f.ctx, slog.Default())
	require.NoError(t, err)
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	s.CurrentRealm = &realm.Info{RealmName: "realm"}
	s.CurrentVersions = &messages.Versions{MessageBase: messages.Base(at), Versions: map[string]string{"addon": "v1"}, SessionID: "session"}
	for i, name := range []string{"one", "two"} {
		require.NoError(t, s.Zone(messages.Zone{MessageBase: messages.Base(at), Zone: zone.Zone{Seen: at, Name: name, IsInstance: true, MapID: uint32(i + 1)}}))
		require.NoError(t, s.Process(&messages.EncounterBoundary{MessageBase: messages.Base(at.Add(time.Second)), Active: true, EncounterID: int32(i + 1), InstanceID: uint32(i + 1), Name: name}))
		player := guid.GUID(1)
		require.NoError(t, s.Process(&messages.Damage{MessageBase: messages.Base(at.Add(1500 * time.Millisecond)), Caster: &player, Target: guid.GUID(0xF130000064000001), Amount: 100}))
		if i == 0 {
			success := true
			require.NoError(t, s.Process(&messages.EncounterBoundary{MessageBase: messages.Base(at.Add(2 * time.Second)), EncounterID: 1, InstanceID: 1, Success: &success}))
			require.NoError(t, s.Process(messages.TimedOut(at.Add(3*time.Second))))
		}
	}
	require.Len(t, s.Instances, 2)
	require.Same(t, s.CurrentInstance, s.Instances[1])
	require.True(t, s.Instances[1].FightActive())
	require.False(t, s.Instances[0].FightActive())
	return s
}
func TestEncounterGraphMultiInstanceDiskRestore(t *testing.T) {
	t.Parallel()
	f := newEncounterGraphFixture(t)
	s := f.state(t)
	reg := f.registry(t, s)
	saved, err := reg.Capture(s)
	require.NoError(t, err)
	data, err := json.Marshal(saved)
	require.NoError(t, err)
	path := filepath.Join(t.TempDir(), "encounters.json")
	require.NoError(t, os.WriteFile(path, data, 0600))
	data, err = os.ReadFile(path)
	require.NoError(t, err)
	var disk ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(data, &disk))
	restore := func() *State {
		fresh := newEncounterGraphFixture(t)
		r := fresh.registry(t, nil)
		v, err := r.Restore(disk)
		require.NoError(t, err)
		require.Zero(t, fresh.calls)
		next := v.(*State)
		require.Same(t, next.Instances[1], next.CurrentInstance)
		require.Equal(t, s.CurrentZone.CaptureState(), next.CurrentZone.CaptureState())
		require.Equal(t, s.CurrentVersions, next.CurrentVersions)
		for _, h := range next.Instances {
			realm, header := h.GraphMetadata()
			require.Same(t, next.CurrentRealm, realm)
			require.Same(t, next.CurrentVersions, header)
		}
		require.Zero(t, next.Auras.GraphObserverCount())
		require.Nil(t, next.ctx)
		require.Nil(t, next.instanceResolver)
		require.Error(t, next.Process(messages.TimedOut(time.Now())))
		require.NoError(t, next.WireGraphRuntime(fresh.ctx, slog.Default()))
		require.Equal(t, 4, next.Auras.GraphObserverCount())
		require.Error(t, next.WireGraphRuntime(fresh.ctx, slog.Default()))
		require.NoError(t, next.validateGraph())
		recaptured, err := fresh.registry(t, next).Capture(next)
		require.NoError(t, err)
		encoded, err := json.Marshal(recaptured)
		require.NoError(t, err)
		require.JSONEq(t, string(data), string(encoded))
		require.Zero(t, next.InstanceProcessDuration(next.CurrentInstance))
		return next
	}
	a, b := restore(), restore()
	require.NotSame(t, a.Units, b.Units)
	require.NotSame(t, a.CurrentInstance, b.CurrentInstance)
	require.NotSame(t, a.Auras, b.Auras)
	a.CurrentVersions.Versions["alias-check"] = "visible"
	_, header := a.Instances[0].GraphMetadata()
	require.Equal(t, "visible", header.Versions["alias-check"])
	require.NotContains(t, b.CurrentVersions.Versions, "alias-check")
	require.Equal(t, s.currentInstanceSelectedAt, a.currentInstanceSelectedAt)
}
func TestEncounterGraphRejectsLifecycleAndBrokenSharing(t *testing.T) {
	t.Parallel()
	f := newEncounterGraphFixture(t)
	s := f.state(t)
	reg := f.registry(t, s)
	snap, err := reg.Capture(s)
	require.NoError(t, err)
	wire, err := json.Marshal(snap)
	require.NoError(t, err)
	for _, kind := range []string{"recipe", "finalized", "current", "units", "duplicate"} {
		t.Run(kind, func(t *testing.T) {
			var bad ownergraph.Snapshot
			require.NoError(t, json.Unmarshal(wire, &bad))
			for i := range bad.Graph.Nodes {
				n := &bad.Graph.Nodes[i]
				if string(n.Path) != bad.Root {
					continue
				}
				var env map[string]json.RawMessage
				require.NoError(t, json.Unmarshal(n.Metadata, &env))
				var v encounterGraphValue
				require.NoError(t, json.Unmarshal(env["data"], &v))
				switch kind {
				case "recipe":
					v.Recipe = "wrong"
				case "finalized":
					v.Finalized = true
				case "current":
					v.Current = "/missing"
				case "units":
					v.Units = v.Auras
				case "duplicate":
					v.Instances = append(v.Instances, v.Instances[0])
				}
				env["data"], err = json.Marshal(v)
				require.NoError(t, err)
				n.Metadata, err = json.Marshal(env)
				require.NoError(t, err)
			}
			fresh := newEncounterGraphFixture(t)
			_, err = fresh.registry(t, nil).Restore(bad)
			require.Error(t, err)
		})
	}
	s.graphFailed = true
	_, err = reg.Capture(s)
	require.Error(t, err)
	s.graphFailed = false
	s.graphProcessing = true
	_, err = reg.Capture(s)
	require.Error(t, err)
	s.graphProcessing = false
	s.Instances[0].AttachVehicleTracker(vehicles.New())
	_, err = reg.Capture(s)
	require.Error(t, err)
	s.Instances[0].AttachVehicleTracker(s.Vehicles)
	s.Finalize()
	_, err = reg.Capture(s)
	require.Error(t, err)
	require.Error(t, s.Process(messages.TimedOut(time.Time{})))
}

func TestOrderedEncounterAndIdentityRootDiskRestore(t *testing.T) {
	t.Parallel()
	f := newEncounterGraphFixture(t)
	state := f.state(t)
	identity := creatures.New(slog.Default())
	at := time.Date(2026, 1, 1, 0, 0, 12, 0, time.UTC)
	require.NoError(t, identity.Process(&messages.Zone{MessageBase: messages.Base(at), Zone: zone.Zone{Name: "two"}}))
	recipes := []consumers.GraphRecipe{
		{ID: "encounters", Validate: func(c consumers.Consumer) error {
			v, ok := c.(*State)
			if !ok || v == nil {
				return fmt.Errorf("expected encounters")
			}
			return v.validateGraph()
		}},
		{ID: "identity", Validate: func(c consumers.Consumer) error {
			v, ok := c.(*creatures.Creatures)
			if !ok || v == nil {
				return fmt.Errorf("expected identity")
			}
			return nil
		}},
	}
	register := func(f *encounterGraphFixture, s *State) *ownergraph.Registry {
		r := f.registry(t, s)
		require.NoError(t, creatures.RegisterGraphOwner(r))
		require.NoError(t, consumers.RegisterGraphOwner(r, recipes))
		return r
	}
	root := consumers.New(slog.Default(), state, identity)
	reg := register(f, state)
	saved, err := reg.Capture(root)
	require.NoError(t, err)
	data, err := json.Marshal(saved)
	require.NoError(t, err)
	path := filepath.Join(t.TempDir(), "root.json")
	require.NoError(t, os.WriteFile(path, data, 0600))
	data, err = os.ReadFile(path)
	require.NoError(t, err)
	var disk ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(data, &disk))
	fresh := newEncounterGraphFixture(t)
	value, err := register(fresh, nil).Restore(disk)
	require.NoError(t, err)
	restored := value.(*consumers.Consumers)
	require.Error(t, restored.Process(messages.TimedOut(at)))
	var next *State
	var nextIdentity *creatures.Creatures
	require.NoError(t, restored.WireGraphRuntime(slog.Default(), []consumers.GraphRuntime{
		{ID: "encounters", Preflight: func(c consumers.Consumer) error { return c.(*State).ValidateGraphRuntime(fresh.ctx, slog.Default()) }, Wire: func(c consumers.Consumer) error {
			next = c.(*State)
			return next.WireGraphRuntime(fresh.ctx, slog.Default())
		}},
		{ID: "identity", Preflight: func(c consumers.Consumer) error { return c.(*creatures.Creatures).ValidateGraphRuntime(slog.Default()) }, Wire: func(c consumers.Consumer) error {
			nextIdentity = c.(*creatures.Creatures)
			return nextIdentity.WireGraphRuntime(slog.Default())
		}},
	}))
	require.NotSame(t, next.Units, nextIdentity.Units, "identity collector intentionally owns an independent unit database")
	require.NoError(t, root.Process(messages.TimedOut(at)))
	require.NoError(t, restored.Process(messages.TimedOut(at)))
	a, err := reg.Capture(root)
	require.NoError(t, err)
	b, err := register(fresh, next).Capture(restored)
	require.NoError(t, err)
	aw, err := json.Marshal(a)
	require.NoError(t, err)
	bw, err := json.Marshal(b)
	require.NoError(t, err)
	require.JSONEq(t, string(aw), string(bw))
}

func TestEncounterGraphPreservesHistoricalHeadersAndRealms(t *testing.T) {
	t.Parallel()
	f := newEncounterGraphFixture(t)
	s, err := f.recipe.New(f.ctx, slog.Default())
	require.NoError(t, err)
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	oldRealm := &messages.Realm{MessageBase: messages.Base(at), Info: realm.Info{RealmName: "old"}}
	oldHeader := &messages.Versions{MessageBase: messages.Base(at), Versions: map[string]string{"addon": "old"}}
	require.NoError(t, s.Process(oldRealm))
	require.NoError(t, s.Process(oldHeader))
	require.NoError(t, s.Zone(messages.Zone{Zone: zone.Zone{Name: "one", Seen: at}}))
	// Realm-name changes inside the active instance are fatal. Transition out
	// first: historical instances legitimately retain their earlier realm/header.
	require.NoError(t, s.Zone(messages.Zone{Zone: zone.Zone{Name: "outside", Seen: at}}))
	require.Nil(t, s.CurrentInstance)
	nextRealm := &messages.Realm{MessageBase: messages.Base(at.Add(time.Second)), Info: realm.Info{RealmName: "new"}}
	nextHeader := &messages.Versions{MessageBase: messages.Base(at.Add(time.Second)), Versions: map[string]string{"addon": "new"}}
	require.NoError(t, s.Process(nextRealm))
	require.NoError(t, s.Process(nextHeader))
	require.NoError(t, s.Zone(messages.Zone{Zone: zone.Zone{Name: "two", Seen: at.Add(time.Second)}}))
	// A later compatible realm/header carrier is also forwarded to the current
	// instance, but not historical ones. Preserve that original pointer sharing.
	latestHeader := &messages.Versions{MessageBase: messages.Base(at.Add(2 * time.Second)), Versions: map[string]string{"addon": "latest"}}
	latestRealm := &messages.Realm{MessageBase: messages.Base(at.Add(2 * time.Second)), Info: realm.Info{RealmName: "new", Build: 9}}
	require.NoError(t, s.Process(latestHeader))
	require.NoError(t, s.Process(latestRealm))
	r, h := s.Instances[0].GraphMetadata()
	require.Same(t, &oldRealm.Info, r)
	require.Same(t, oldHeader, h)
	r, h = s.Instances[1].GraphMetadata()
	require.Same(t, s.CurrentRealm, r)
	require.Same(t, s.CurrentVersions, h)
	snap, err := f.registry(t, s).Capture(s)
	require.NoError(t, err)
	wire, err := json.Marshal(snap)
	require.NoError(t, err)
	var disk ownergraph.Snapshot
	require.NoError(t, json.Unmarshal(wire, &disk))
	fresh := newEncounterGraphFixture(t)
	value, err := fresh.registry(t, nil).Restore(disk)
	require.NoError(t, err)
	restored := value.(*State)
	r, h = restored.Instances[0].GraphMetadata()
	require.NotSame(t, restored.CurrentRealm, r)
	require.NotSame(t, restored.CurrentVersions, h)
	require.Equal(t, "old", r.RealmName)
	require.Equal(t, "old", h.Versions["addon"])
	r, h = restored.Instances[1].GraphMetadata()
	require.Same(t, restored.CurrentRealm, r)
	require.Same(t, restored.CurrentVersions, h)
	secondFixture := newEncounterGraphFixture(t)
	secondValue, err := secondFixture.registry(t, nil).Restore(disk)
	require.NoError(t, err)
	second := secondValue.(*State)
	oldRealmRestored, oldHeaderRestored := restored.Instances[0].GraphMetadata()
	oldRealmSecond, oldHeaderSecond := second.Instances[0].GraphMetadata()
	require.NotSame(t, oldRealmRestored, oldRealmSecond)
	require.NotSame(t, oldHeaderRestored, oldHeaderSecond)
	oldHeaderRestored.Versions["independence"] = "first restore only"
	require.NotContains(t, oldHeaderSecond.Versions, "independence")
}
