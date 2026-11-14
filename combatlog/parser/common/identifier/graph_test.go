package identifier

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestGraphTrustedRecipeAllowlist(t *testing.T) {
	t.Parallel()
	factoryCalls, callbackCalls := 0, 0
	definitions := map[uint32]Identity{1: {Name: "first", EncounterNameFn: func(encounter.Fight) *EncounterFuncResult {
		callbackCalls++
		return &EncounterFuncResult{EncounterName: "trusted"}
	}}}
	first := TrustedRecipe{ID: "first", Factory: func() *Identifier {
		factoryCalls++
		return NewIdentifier(definitions)
	}}
	second := TrustedRecipe{ID: "second", Factory: func() *Identifier {
		factoryCalls++
		return NewIdentifier(map[uint32]Identity{2: {Name: "second"}})
	}}
	liveFirst, err := first.New()
	require.NoError(t, err)
	liveSecond, err := second.New()
	require.NoError(t, err)
	liveFirst.unknownUnits[99] = 3
	registry := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwner(registry, first, second))
	require.Equal(t, 4, factoryCalls)
	// Neither later factory input mutation nor restored map mutations may affect
	// the private prepared definition.
	definitions[1] = Identity{Name: "changed"}
	for _, live := range []*Identifier{liveFirst, liveSecond} {
		snapshot, err := registry.Capture(live)
		require.NoError(t, err)
		a, err := registry.Restore(snapshot)
		require.NoError(t, err)
		b, err := registry.Restore(snapshot)
		require.NoError(t, err)
		restored, independent := a.(*Identifier), b.(*Identifier)
		require.Equal(t, live.recipeID, restored.recipeID)
		require.Equal(t, live.configuration, restored.configuration)
		require.Equal(t, live.unknownUnits, restored.unknownUnits)
		restored.unknownUnits[99] = 42
		restored.byEntryId[42] = Identity{Name: "mutation"}
		require.NotContains(t, independent.byEntryId, uint32(42))
		require.NotEqual(t, 42, independent.unknownUnits[99])
		require.NotContains(t, live.byEntryId, uint32(42))
		if live == liveFirst {
			require.Equal(t, "first", independent.byEntryId[1].Name)
			require.NotNil(t, independent.byEntryId[1].EncounterNameFn)
			require.Equal(t, "trusted", independent.byEntryId[1].EncounterNameFn(encounter.Fight{}).EncounterName)
			require.Equal(t, 1, callbackCalls)
			callbackCalls = 0
		}
	}
	require.Equal(t, 4, factoryCalls, "restore must not run factories or their queries")
	require.Zero(t, callbackCalls, "restore must not evaluate encounter callbacks")
	require.Equal(t, "trusted", liveFirst.byEntryId[1].EncounterNameFn(encounter.Fight{}).EncounterName)
	require.Equal(t, 1, callbackCalls)
}

func TestGraphRejectsUnknownAndChangedRecipes(t *testing.T) {
	t.Parallel()
	trusted := TrustedRecipe{ID: "trusted", Factory: func() *Identifier {
		return NewIdentifier(map[uint32]Identity{1: {Name: "trusted"}})
	}}
	registry := ownergraph.NewRegistry()
	require.NoError(t, RegisterGraphOwner(registry, trusted))
	for _, recipe := range []TrustedRecipe{
		{ID: "unknown", Factory: trusted.Factory},
		{ID: "trusted", Factory: func() *Identifier { return NewIdentifier(nil) }},
	} {
		live, err := recipe.New()
		require.NoError(t, err)
		snapshot, err := registry.Capture(live)
		require.NoError(t, err)
		_, err = registry.Restore(snapshot)
		require.Error(t, err)
	}
	require.Error(t, RegisterGraphOwner(ownergraph.NewRegistry()))
	require.Error(t, RegisterGraphOwner(ownergraph.NewRegistry(), trusted, trusted))
	require.Error(t, RegisterGraphOwner(ownergraph.NewRegistry(), TrustedRecipe{ID: "missing factory"}))
}
