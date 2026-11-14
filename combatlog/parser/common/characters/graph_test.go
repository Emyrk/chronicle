package characters

import (
	"encoding/json"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/internal/stategraph"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestRegisteredRoomGraphCycle(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	recipe := TrustedFactoryRecipe{ID: "room-test"}
	idRecipe := identifier.TrustedRecipe{ID: "empty", Factory: func() *identifier.Identifier { return identifier.NewIdentifier(nil) }}
	id, e := idRecipe.New()
	require.NoError(t, e)
	all, e := recipe.New(unitdb.New(), id)
	require.NoError(t, e)
	room := &Room{bossEntry: 100, Units: map[guid.GUID]*RoomMechanic{}}
	for _, id := range []guid.GUID{1, 2} {
		common := NewCommonCharacter(id, all)
		member := &RoomMechanic{Common: common, all: all, entry: 2, bossEntry: 100, room: room, key: "room", pendingDeathWindow: time.Minute}
		common.Start("start", messages.TimedOut(at))
		room.Units[id] = member
		all.All.Add(member, at)
	}
	all.Save("room", room)
	first := room.Units[1]
	m := messages.Message(messages.TimedOut(at))
	first.pendingDeath = &m
	first.LastSlain = m
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(r, GraphOptions{Factories: recipe, Identifier: idRecipe}))
	require.NoError(t, period.RegisterGraphOwners(r))
	require.NoError(t, unitdb.RegisterGraphOwner(r))
	require.NoError(t, identifier.RegisterGraphOwner(r, idRecipe))
	require.NoError(t, messages.RegisterDamageGraphOwner(r))
	snapshot, e := r.Capture(all)
	require.NoError(t, e)
	commonValues, baseValues := 0, 0
	for _, node := range snapshot.Graph.Nodes {
		if node.Kind != stategraph.KindValue {
			continue
		}
		if node.Type == BaseStateType+".Inactivity" {
			baseValues++
		}
		if node.Type == CommonStateType {
			commonValues++
			var envelope struct {
				Version uint32
				Data    json.RawMessage
			}
			require.NoError(t, json.Unmarshal(node.Metadata, &envelope))
			var local commonGraphValue
			require.NoError(t, decodeCharacterValue(envelope.Data, &local))
			// Strict DTO decoding proves Common contains only a Base path, ID and
			// timeout, not a second nested saved Base/collector payload.
			baseNode, ok := snapshot.Graph.Find(stategraph.Path(local.Base))
			require.True(t, ok)
			require.Equal(t, BaseStateType+".Inactivity", baseNode.Type)
		}
	}
	require.Equal(t, 2, commonValues)
	require.Equal(t, 2, baseValues)
	restored, e := r.Restore(snapshot)
	require.NoError(t, e)
	fresh := restored.(*Characters)
	require.NotSame(t, all, fresh)
	shared, ok := fresh.Load("room")
	require.True(t, ok)
	freshRoom := shared.(*Room)
	require.Len(t, freshRoom.Units, 2)
	for id, member := range freshRoom.Units {
		ch, ok := fresh.Get(id)
		require.True(t, ok)
		require.Same(t, member, ch)
		require.Same(t, freshRoom, member.room)
		require.Same(t, fresh, member.Lookup())
	}
	require.Same(t, freshRoom.Units[1].LastSlain, *freshRoom.Units[1].pendingDeath)
	require.NotSame(t, m, *freshRoom.Units[1].pendingDeath)
	require.NoError(t, fresh.WireGraphRuntime())
	_, e = fresh.Process(messages.TimedOut(at.Add(time.Minute)))
	require.NoError(t, e)
	_, e = all.Process(messages.TimedOut(at.Add(time.Minute)))
	require.NoError(t, e)
	require.Equal(t, len(room.Units), len(freshRoom.Units))
	restoredFirst, ok := fresh.Get(1)
	require.True(t, ok)
	require.Equal(t, first.IsActive(), restoredFirst.IsActive())
}

type graphRuntimeTestHook struct{ calls int }

func (h *graphRuntimeTestHook) ActivityChange(messages.Message, ...Character) { h.calls++ }
func (h *graphRuntimeTestHook) CharacterAdded(messages.Message, ...Character) { h.calls++ }

func TestGraphRuntimeBinding(t *testing.T) {
	t.Parallel()
	for _, mutate := range []struct {
		name  string
		apply func(*Characters)
	}{
		{"hook", func(c *Characters) { c.RegisterHook(&graphRuntimeTestHook{}) }},
		{"participants", func(c *Characters) { c.SetNoKnownParticipantsAliveProvider(nil) }},
		{"phase", func(c *Characters) { c.SetPhaseTransitionCallback(nil) }},
	} {
		t.Run(mutate.name, func(t *testing.T) {
			t.Parallel()
			c := NewCharacters(nil, nil, nil)
			hook, other := &graphRuntimeTestHook{}, &graphRuntimeTestHook{}
			c.RegisterHook(hook)
			require.Error(t, c.BindGraphRuntime(c, []SetHook{other}))
			require.Error(t, c.BindGraphRuntime(nil, []SetHook{hook}))
			require.NoError(t, c.BindGraphRuntime(c, []SetHook{hook}))
			owner, err := c.GraphRuntimeOwner()
			require.NoError(t, err)
			require.Same(t, c, owner)
			mutate.apply(c)
			_, err = c.GraphRuntimeOwner()
			require.Error(t, err)
		})
	}
	c := NewCharacters(nil, nil, nil)
	first, second := &graphRuntimeTestHook{}, &graphRuntimeTestHook{}
	c.RegisterHook(first)
	c.RegisterHook(second)
	require.Error(t, c.BindGraphRuntime(c, []SetHook{second, first}))
}

func TestConfiguredGraphRuntime(t *testing.T) {
	t.Parallel()
	recipe := TrustedFactoryRecipe{ID: "runtime-test"}
	idRecipe := identifier.TrustedRecipe{ID: "empty", Factory: func() *identifier.Identifier { return identifier.NewIdentifier(nil) }}
	id, err := idRecipe.New()
	require.NoError(t, err)
	c, err := recipe.New(unitdb.New(), id)
	require.NoError(t, err)
	calls := 0
	hook := &graphRuntimeTestHook{}
	c.RegisterHook(hook)
	c.SetNoKnownParticipantsAliveProvider(func() bool { calls++; return true })
	c.SetPhaseTransitionCallback(func(phases.Transition) { calls++ })
	require.NoError(t, c.BindGraphRuntime(c, []SetHook{hook}))
	registry := func(validate func(*Characters) error) *ownergraph.Registry {
		r := ownergraph.NewRegistry()
		require.NoError(t, RegisterGraphOwners(r, GraphOptions{Factories: recipe, Identifier: idRecipe, ValidateRuntime: validate}))
		require.NoError(t, unitdb.RegisterGraphOwner(r))
		require.NoError(t, identifier.RegisterGraphOwner(r, idRecipe))
		return r
	}
	_, err = registry(nil).Capture(c)
	require.Error(t, err)
	r := registry(func(c *Characters) error { _, err := c.GraphRuntimeOwner(); return err })
	snapshot, err := r.Capture(c)
	require.NoError(t, err)
	restored, err := r.Restore(snapshot)
	require.NoError(t, err)
	fresh := restored.(*Characters)
	n, participants, phase := fresh.GraphRuntimeShape()
	require.Equal(t, 1, n)
	require.True(t, participants)
	require.True(t, phase)
	_, err = r.Capture(fresh)
	require.Error(t, err)
	require.Error(t, fresh.WireGraphRuntime())
	freshHook := &graphRuntimeTestHook{}
	runtime := CharactersRuntime{Hooks: []SetHook{freshHook}, NoKnownParticipantsAlive: func() bool { calls++; return true }, PhaseTransition: func(phases.Transition) { calls++ }}
	require.NoError(t, fresh.WireGraphRuntimeWith(runtime))
	require.Error(t, fresh.WireGraphRuntimeWith(runtime))
	require.Zero(t, calls)
	require.Zero(t, hook.calls)
	require.Zero(t, freshHook.calls)
	require.NoError(t, fresh.BindGraphRuntime(fresh, []SetHook{freshHook}))
	_, err = r.Capture(fresh)
	require.NoError(t, err)
	fresh.SetPhaseTransitionCallback(runtime.PhaseTransition)
	_, err = r.Capture(fresh)
	require.Error(t, err)
}

// Both aggregates use the same ordered character factories but distinct graph
// identifier owners. The legacy singleton option must not select either owner.
func TestGraphMultipleIdentifierDependencies(t *testing.T) {
	t.Parallel()
	factories := TrustedFactoryRecipe{ID: "shared-factories"}
	first := identifier.TrustedRecipe{ID: "first", Factory: func() *identifier.Identifier {
		return identifier.NewIdentifier(map[uint32]identifier.Identity{1: {Name: "first"}})
	}}
	second := identifier.TrustedRecipe{ID: "second", Factory: func() *identifier.Identifier {
		return identifier.NewIdentifier(map[uint32]identifier.Identity{2: {Name: "second"}})
	}}
	registry := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwners(registry, GraphOptions{Factories: factories, Identifier: first}))
	require.NoError(t, identifier.RegisterGraphOwner(registry, first, second))
	require.NoError(t, unitdb.RegisterGraphOwner(registry))
	for _, recipe := range []identifier.TrustedRecipe{first, second} {
		id, err := recipe.New()
		require.NoError(t, err)
		all, err := factories.New(unitdb.New(), id)
		require.NoError(t, err)
		snapshot, err := registry.Capture(all)
		require.NoError(t, err)
		restored, err := registry.Restore(snapshot)
		require.NoError(t, err)
		fresh := restored.(*Characters)
		require.NotSame(t, id, fresh.idf)
		expected, err := id.CaptureState()
		require.NoError(t, err)
		actual, err := fresh.idf.CaptureState()
		require.NoError(t, err)
		require.Equal(t, expected, actual)
	}
}
