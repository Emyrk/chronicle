package characters

import (
	"errors"
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
