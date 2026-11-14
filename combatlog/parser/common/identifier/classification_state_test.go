package identifier

import (
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/internal/stategraph/ownergraph"
	"github.com/stretchr/testify/require"
)

func TestClassificationStateStrictBinding(t *testing.T) {
	t.Parallel()
	r := TrustedRecipe{ID: "empty", Factory: func() *Identifier { return NewIdentifier(nil) }}
	i, err := r.NewServerClassification()
	require.NoError(t, err)
	_, err = i.CaptureState()
	require.Error(t, err, "default codec must not downgrade even a pristine dynamic owner")
	i.UpdateServerClassification(100, types.AffiliationHostile, "boss", true)
	data, err := i.captureClassificationState()
	require.NoError(t, err)
	baseline, err := r.NewServerClassification()
	require.NoError(t, err)
	restored, err := restoreClassificationState(1, data, baseline)
	require.NoError(t, err)
	require.Equal(t, i.byEntryId, restored.byEntryId)
	restored.byEntryId[200] = Identity{EncounterNameFn: func(encounter.Fight) *EncounterFuncResult { return nil }}
	_, err = restored.captureClassificationState()
	require.Error(t, err, "new unbound callback cannot enter dynamic state")
	i.AddEntryId(100, i.byEntryId[100])
	_, err = i.captureClassificationState()
	require.Error(t, err, "even identical uncontrolled writes are rejected")
	plain := NewIdentifier(map[uint32]Identity{})
	plain.UpdateServerClassification(100, types.AffiliationHostile, "boss", true)
	_, err = plain.captureClassificationState()
	require.Error(t, err)
}

func TestClassificationStateMalformedUpdates(t *testing.T) {
	t.Parallel()
	recipe := TrustedRecipe{ID: "empty", Factory: func() *Identifier { return NewIdentifier(map[uint32]Identity{}) }}
	baseline, err := recipe.NewServerClassification()
	require.NoError(t, err)
	data, err := baseline.captureClassificationState()
	require.NoError(t, err)
	var valid map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(data, &valid))
	for _, raw := range []string{`null`, `[]`, `{"1":null}`, `{"1":{"name":"x","boss":false}}`, `{"1":{"affiliation":0,"name":"x","boss":false,"callback":true}}`, `{"1":{"affiliation":0,"name":"x","boss":false},"01":{"affiliation":0,"name":"x","boss":false}}`, `{"1":{"affiliation":0,"name":"x","name":"y","boss":false}}`, `{"4294967296":{"affiliation":0,"name":"x","boss":false}}`} {
		payload := map[string]json.RawMessage{"base": valid["base"], "updates": json.RawMessage(raw)}
		encoded, err := json.Marshal(payload)
		require.NoError(t, err)
		_, err = restoreClassificationState(1, encoded, baseline)
		require.Error(t, err)
	}
	_, err = restoreClassificationState(999, data, baseline)
	require.Error(t, err)
	registry := ownergraph.NewRegistry()
	require.NoError(t, RegisterServerClassificationGraphOwner(registry, recipe))
	wrong := TrustedRecipe{ID: "wrong", Factory: recipe.Factory}
	foreign, err := wrong.NewServerClassification()
	require.NoError(t, err)
	_, err = registry.Capture(foreign)
	require.Error(t, err)
}

func TestClassificationGraphMultipleTrustedRecipes(t *testing.T) {
	t.Parallel()
	recipes := []TrustedRecipe{
		{ID: "one", Factory: func() *Identifier { return NewIdentifier(map[uint32]Identity{1: {Name: "one"}}) }},
		{ID: "two", Factory: func() *Identifier { return NewIdentifier(map[uint32]Identity{2: {Name: "two"}}) }},
	}
	r := ownergraph.NewRegistry()
	require.NoError(t, RegisterServerClassificationGraphOwner(r, recipes...))
	require.Error(t, RegisterServerClassificationGraphOwner(ownergraph.NewRegistry()))
	require.Error(t, RegisterServerClassificationGraphOwner(ownergraph.NewRegistry(), recipes[0], recipes[0]))
	for _, recipe := range recipes {
		original, err := recipe.NewServerClassification()
		require.NoError(t, err)
		original.UpdateServerClassification(42, types.AffiliationHostile, "dynamic", true)
		saved, err := r.Capture(original)
		require.NoError(t, err)
		restored, err := r.Restore(saved)
		require.NoError(t, err)
		require.Equal(t, original.byEntryId, restored.(*Identifier).byEntryId)
		other := ownergraph.NewRegistry()
		foreign := recipe
		foreign.ID += "/unknown"
		require.NoError(t, RegisterServerClassificationGraphOwner(other, foreign))
		_, err = other.Restore(saved)
		require.ErrorContains(t, err, "unknown server classification recipe")
	}
}
