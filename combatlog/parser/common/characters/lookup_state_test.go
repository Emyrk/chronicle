package characters

import (
	"errors"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

type aggregateStateHook struct{ calls int }

func (h *aggregateStateHook) ActivityChange(messages.Message, ...Character) { h.calls++ }
func (h *aggregateStateHook) CharacterAdded(messages.Message, ...Character) { h.calls++ }
func TestCharactersStatePreservesAggregateAliases(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	db := unitdb.New()
	idf := identifier.NewIdentifier(nil)
	factoryCalls := 0
	recipe := TrustedFactoryRecipe{ID: "test/v1", FactoryIDs: []string{"never"}, Factories: []CharacterFactory{func(id guid.GUID, _ *Characters) (Character, bool) {
		factoryCalls++
		v := NewNeverActive(id)
		return &v, true
	}}}
	source, e := recipe.New(db, idf)
	require.NoError(t, e)
	ch, _ := source.Add(1, at)
	other, _ := source.Add(2, at)
	room := &Room{Units: map[guid.GUID]*RoomMechanic{}}
	source.Save("room", room)
	source.Save("alias", room)
	source.activityChanged = map[Character]struct{}{ch: {}, other: {}}
	source.explicitEncounter = true
	source.EmitPhaseTransition(phases.Transition{SourceGUID: 1, ToPhaseKey: "next", Timestamp: at})
	hook := new(aggregateStateHook)
	source.RegisterHook(hook)
	state, e := source.CaptureState(func(c Character) (string, error) {
		if c == ch {
			return "one", nil
		}
		return "two", nil
	}, func(v any) (string, error) { require.Same(t, room, v); return "room", nil })
	require.NoError(t, e)
	data, e := state.Encode()
	require.NoError(t, e)
	state, e = DecodeCharactersState(CharactersStateVersion, data)
	require.NoError(t, e)
	restored := new(Characters)
	freshDB := unitdb.New()
	freshID := identifier.NewIdentifier(nil)
	one := NewNeverActive(1)
	two := NewNeverActive(2)
	freshRoom := &Room{Units: map[guid.GUID]*RoomMechanic{}}
	resolves := 0
	resolve := func(p string) (Character, error) {
		resolves++
		if p == "one" {
			return &one, nil
		}
		return &two, nil
	}
	require.NoError(t, restored.RestoreState(state, recipe, freshDB, freshID, resolve, func(string) (any, error) { return freshRoom, nil }))
	require.Equal(t, 2, resolves)
	require.Equal(t, 2, factoryCalls)
	require.Zero(t, hook.calls)
	require.Same(t, freshDB, restored.DB())
	require.Same(t, freshID, restored.idf)
	a, _ := restored.Load("room")
	b, _ := restored.Load("alias")
	require.Same(t, a, b)
	require.Same(t, freshRoom, a)
	require.Contains(t, restored.activityChanged, &one)
	require.Contains(t, restored.activityChanged, &two)
	require.True(t, restored.ExplicitEncounterActive())
	require.Equal(t, source.stagedTransitions, restored.stagedTransitions)
	// Validation failure leaves the published lookup and external dependencies intact.
	previous := restored.All
	require.Error(t, restored.RestoreState(state, recipe, freshDB, freshID, resolve, func(string) (any, error) { return nil, errors.New("missing room") }))
	require.Same(t, previous, restored.All)
	require.Error(t, restored.WireStateRuntime(CharactersRuntime{}))
	require.Nil(t, restored.hooks)
	restoredHook := new(aggregateStateHook)
	require.NoError(t, restored.WireStateRuntime(CharactersRuntime{Hooks: []SetHook{restoredHook}}))
	require.Zero(t, restoredHook.calls)
	require.True(t, restored.notifyActivityChanged(messages.TimedOut(at)))
	require.Equal(t, 1, restoredHook.calls)
	require.Nil(t, restored.activityChanged)
	require.Equal(t, source.DrainStagedTransitions(), restored.DrainStagedTransitions())
	// Trusted factories apply only to genuinely new suffix characters.
	added, newChar := restored.Add(3, at.Add(time.Second))
	require.True(t, newChar)
	require.Equal(t, guid.GUID(3), added.ID())
	require.Equal(t, 3, factoryCalls)
}
func TestCharactersStateFailsClosed(t *testing.T) {
	t.Parallel()
	source := NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	_, e := source.CaptureState(nil, nil)
	require.Error(t, e)
	recipe := TrustedFactoryRecipe{ID: "empty"}
	source, e = recipe.New(source.db, source.idf)
	require.NoError(t, e)
	source.Save("unsupported", new(int))
	_, e = source.CaptureState(nil, func(any) (string, error) { return "", errors.New("unsupported dynamic owner") })
	require.Error(t, e)
	source.Delete("unsupported")
	state, e := source.CaptureState(nil, nil)
	require.NoError(t, e)
	dst := new(Characters)
	require.Error(t, dst.RestoreState(state, TrustedFactoryRecipe{ID: "different"}, source.db, source.idf, nil, nil))
	require.Nil(t, dst.All)
	for _, b := range []string{`null`, `{}`, `{"recipe":"empty"}`} {
		_, e = DecodeCharactersState(CharactersStateVersion, []byte(b))
		require.Error(t, e)
	}
}

func TestCharactersStateFreshRoomCycleSuffix(t *testing.T) {
	t.Parallel()
	recipe := TrustedFactoryRecipe{ID: "room/test"}
	source, e := recipe.New(unitdb.New(), identifier.NewIdentifier(nil))
	require.NoError(t, e)
	at := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	prefix := messages.TimedOut(at)
	common := NewCommonCharacter(1, source)
	common.Start("prefix", prefix)
	room := &Room{bossEntry: 100, Units: map[guid.GUID]*RoomMechanic{}}
	member := &RoomMechanic{Common: common, all: source, entry: 2, bossEntry: 100, room: room, key: "room", pendingDeath: &prefix, pendingDeathWindow: time.Minute}
	common.LastSlain = prefix
	room.Units[1] = member
	source.All.Add(member, at)
	source.Save("room", room)
	// Capture each owner independently; the composition fixture uses canonical
	// paths and never substitutes constructors for state loading.
	messageState, e := period.CaptureMessage(prefix, nil, nil)
	require.NoError(t, e)
	prd, _ := common.Activity.Current()
	momentState, e := period.CaptureMoment(prd.Start, func(messages.Message) (string, error) { return "message", nil })
	require.NoError(t, e)
	ps, e := prd.CaptureState(func(*period.Moment) (string, error) { return "moment", nil }, nil)
	require.NoError(t, e)
	cs, e := common.CaptureState(func(*period.InactivityPeriod) (string, error) { return "period", nil }, func(messages.Message) (string, error) { return "message", nil })
	require.NoError(t, e)
	ms, e := member.CaptureState(func(*Common) (string, error) { return "common", nil }, func(*Room) (string, error) { return "room", nil }, func(messages.Message) (string, error) { return "message", nil })
	require.NoError(t, e)
	rs, e := room.CaptureState(func(*RoomMechanic) (string, error) { return "member", nil })
	require.NoError(t, e)
	state, e := source.CaptureState(func(Character) (string, error) { return "member", nil }, func(any) (string, error) { return "room", nil })
	require.NoError(t, e)
	encoded, e := state.Encode()
	require.NoError(t, e)
	state, e = DecodeCharactersState(CharactersStateVersion, encoded)
	require.NoError(t, e)
	fresh := new(Characters)
	freshRoom := new(Room)
	freshMember := new(RoomMechanic)
	freshMessage, e := messageState.Restore(nil, nil)
	require.NoError(t, e)
	require.NotSame(t, prefix, freshMessage)
	message := func(string) (messages.Message, error) { return freshMessage, nil }
	freshMoment, e := momentState.Restore(message)
	require.NoError(t, e)
	freshPeriod := new(period.InactivityPeriod)
	require.NoError(t, freshPeriod.RestoreState(ps, func(string) (*period.Moment, error) { return freshMoment, nil }, message, nil))
	baseState, e := cs.BaseState()
	require.NoError(t, e)
	freshBase := new(Base[*period.InactivityPeriod])
	require.NoError(t, freshBase.RestoreState(baseState, fresh, func(string) (*period.InactivityPeriod, error) { return freshPeriod, nil }, message))
	freshCommon := new(Common)
	require.NoError(t, freshCommon.RestoreState(cs, freshBase, nil))
	require.NoError(t, freshMember.RestoreState(ms, fresh, func(string) (*Common, error) { return freshCommon, nil }, func(string) (*Room, error) { return freshRoom, nil }, message))
	require.NoError(t, freshRoom.RestoreState(rs, func(string) (*RoomMechanic, error) { return freshMember, nil }))
	freshDB := unitdb.New()
	require.NoError(t, fresh.RestoreState(state, recipe, freshDB, identifier.NewIdentifier(nil), func(string) (Character, error) { return freshMember, nil }, func(string) (any, error) { return freshRoom, nil }))
	require.NoError(t, fresh.WireStateRuntime(CharactersRuntime{}))
	// Runtime period hooks are attached only after all owners and aliases load.
	freshCommon.Activity.WireHook(period.HookFunction(func(messages.Message) {
		if fresh.activityChanged == nil {
			fresh.activityChanged = map[Character]struct{}{}
		}
		fresh.activityChanged[freshMember] = struct{}{}
	}))
	require.Same(t, fresh, freshCommon.Lookup())
	require.Same(t, freshRoom, freshMember.room)
	require.Same(t, freshMember, freshRoom.Units[1])
	require.Same(t, freshMessage, *freshMember.pendingDeath)
	require.Same(t, freshMessage, freshCommon.LastSlain)
	require.Same(t, freshMessage, freshMoment.Timestamp)
	require.True(t, common.IsActive())
	require.True(t, freshCommon.IsActive())
	require.Empty(t, freshDB.Info)
	// The same suffix finalizes both pending deaths, removes membership, and
	// leaves independently allocated canonical graphs with equivalent state.
	suffix := messages.TimedOut(at.Add(time.Minute))
	_, e = source.Process(suffix)
	require.NoError(t, e)
	_, e = fresh.Process(messages.TimedOut(at.Add(time.Minute)))
	require.NoError(t, e)
	require.Nil(t, member.pendingDeath)
	require.Nil(t, freshMember.pendingDeath)
	require.Empty(t, room.Units)
	require.Empty(t, freshRoom.Units)
	require.Equal(t, common.IsActive(), freshCommon.IsActive())
	require.Equal(t, prd.Get(), freshPeriod.Get())
}
