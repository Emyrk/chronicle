package chrondbc

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSpellResolveNoVariantFastPath(t *testing.T) {
	t.Parallel()

	spell := &Spell{Effects: []SpellEffect{{DifficultyID: 0, EffectIndex: 0}}}
	require.Same(t, spell, spell.Resolve(5))
}

func TestSpellResolveExactDifficultyAndComponentInheritance(t *testing.T) {
	t.Parallel()

	spell := &Spell{
		BaseLevel:   10,
		SpellLevel:  11,
		DefenseType: DefenseTypeMagic,
		Effects: []SpellEffect{
			{DifficultyID: 0, EffectIndex: 0, Effect: EffectSchoolDMG},
			{DifficultyID: 2, EffectIndex: 0, Effect: EffectHeal},
		},
		Variants: []SpellVariant{
			{DifficultyID: 0, Levels: &ModernSpellLevels{BaseLevel: 10, SpellLevel: 11}},
			{DifficultyID: 2, Categories: &ModernSpellCategories{DefenseType: int32(DefenseTypeMelee), Category: 42}},
		},
	}

	resolved := spell.Resolve(2)
	require.NotSame(t, spell, resolved)
	require.Equal(t, int32(10), resolved.BaseLevel, "missing Levels component inherits the default top-level value")
	require.Equal(t, int32(11), resolved.SpellLevel)
	require.Equal(t, DefenseTypeMelee, resolved.DefenseType)
	require.Equal(t, int32(42), resolved.Category.ID)
	require.Len(t, resolved.Effects, 1)
	require.Equal(t, EffectHeal, resolved.Effects[0].Effect)
}

func TestSpellResolveDifficultyZeroFallback(t *testing.T) {
	t.Parallel()

	spell := &Spell{
		BaseLevel: 7,
		Effects: []SpellEffect{
			{DifficultyID: 0, EffectIndex: 3, Effect: EffectSchoolDMG},
			{DifficultyID: 2, EffectIndex: 3, Effect: EffectHeal},
		},
		Variants: []SpellVariant{{DifficultyID: 2, Levels: &ModernSpellLevels{BaseLevel: 70}}},
	}

	resolved := spell.Resolve(99)
	require.Equal(t, int32(7), resolved.BaseLevel)
	require.Len(t, resolved.Effects, 1)
	require.Equal(t, int32(0), resolved.Effects[0].DifficultyID)
	require.Equal(t, EffectSchoolDMG, resolved.Effects[0].Effect)
}

func TestSpellEffectSelectionPreservesSparseAndRepeatedIndexes(t *testing.T) {
	t.Parallel()

	spell := &Spell{Effects: []SpellEffect{
		{DifficultyID: 0, EffectIndex: 0, SourceID: 10, Effect: EffectSchoolDMG},
		{DifficultyID: 0, EffectIndex: 4, SourceID: 11, Effect: EffectApplyAura},
		{DifficultyID: 3, EffectIndex: 0, SourceID: 20, Effect: EffectHeal},
		{DifficultyID: 3, EffectIndex: 4, SourceID: 21, Effect: EffectEnergize},
	}}

	require.Equal(t, []int32{0, 4}, effectIndexes(spell.DefaultEffects()))
	require.Equal(t, []int32{0, 4}, effectIndexes(spell.EffectsForDifficulty(3)))
	require.Equal(t, EffectSchoolDMG, spell.EffectByIndex(0).Effect)
	require.Equal(t, EffectHeal, spell.EffectByIndexForDifficulty(3, 0).Effect)
	require.Equal(t, EffectSchoolDMG, spell.EffectByIndexForDifficulty(99, 0).Effect)
	require.Len(t, spell.Effects, 4, "selection must not collapse rows across difficulties")
}

func TestSpellPowerSelection(t *testing.T) {
	t.Parallel()

	spell := &Spell{Powers: []SpellPower{
		{OrderIndex: 2, SourceID: 30, PowerType: 1, ManaCost: 300},
		{OrderIndex: 0, SourceID: 20, PowerType: 0, ManaCost: 200},
		{OrderIndex: 0, SourceID: 10, PowerType: 0, ManaCost: 100},
		{OrderIndex: 1, SourceID: 40, PowerType: 1, ManaCost: 400},
	}}

	require.Equal(t, int32(100), spell.DefaultPower().ManaCost)
	require.Equal(t, int32(100), spell.PowerByOrderIndex(0).ManaCost)
	require.Equal(t, int32(400), spell.PowerByType(1).ManaCost)
	require.Nil(t, spell.PowerByOrderIndex(99))
	require.Nil(t, spell.PowerByType(99))
	require.Len(t, spell.Powers, 4)
}

func TestSpellResolveDoesNotMutateReceiver(t *testing.T) {
	t.Parallel()

	basePoints := float32(12.5)
	spell := &Spell{
		BaseLevel: 5,
		Effects: []SpellEffect{
			{DifficultyID: 0, EffectIndex: 0, EffectMiscValue: []int32{1}},
			{DifficultyID: 2, EffectIndex: 0, EffectBasePointsF: &basePoints, EffectMiscValue: []int32{2}},
		},
		Powers: []SpellPower{{OrderIndex: 0, ManaCost: 10}},
		Variants: []SpellVariant{{
			DifficultyID: 2,
			Misc:         &ModernSpellMisc{Attributes: []int32{7, 8}},
			ClassOptions: &ModernSpellClassOptions{SpellClassMask: []int32{9, 10, 11, 12}},
		}},
	}

	resolved := spell.Resolve(2)
	resolved.BaseLevel = 99
	resolved.Effects[0].EffectMiscValue[0] = 200
	*resolved.Effects[0].EffectBasePointsF = 99
	resolved.Powers[0].ManaCost = 99
	resolved.Variants[0].Misc.Attributes[0] = 99
	resolved.Variants[0].ClassOptions.SpellClassMask[0] = 99

	require.Equal(t, int32(5), spell.BaseLevel)
	require.Equal(t, []int32{2}, spell.Effects[1].EffectMiscValue)
	require.Equal(t, float32(12.5), *spell.Effects[1].EffectBasePointsF)
	require.Equal(t, int32(10), spell.Powers[0].ManaCost)
	require.Equal(t, []int32{7, 8}, spell.Variants[0].Misc.Attributes)
	require.Equal(t, []int32{9, 10, 11, 12}, spell.Variants[0].ClassOptions.SpellClassMask)
}

func TestSpellJSONCompatibilityAdapters(t *testing.T) {
	t.Parallel()

	datasetID := uuid.New()
	spell := Spell{
		Effects: []SpellEffect{
			{DatasetID: datasetID, DifficultyID: 0, EffectIndex: 0, Effect: EffectSchoolDMG},
			{DatasetID: datasetID, DifficultyID: 2, EffectIndex: 0, Effect: EffectHeal},
		},
		Powers:   []SpellPower{{DatasetID: datasetID, OrderIndex: 0, ManaCost: 10}},
		Variants: []SpellVariant{{DatasetID: datasetID, DifficultyID: 2}},
	}

	encoded, err := json.Marshal(spell)
	require.NoError(t, err)
	var payload map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(encoded, &payload))
	for _, key := range []string{"effects", "powers", "variants", "effect", "modern_effects", "modern_powers", "modern_variants"} {
		require.Contains(t, payload, key)
	}

	var legacyEffects []json.RawMessage
	require.NoError(t, json.Unmarshal(payload["effect"], &legacyEffects))
	expectedEffect, err := json.Marshal(EffectSchoolDMG)
	require.NoError(t, err)
	require.JSONEq(t, string(expectedEffect), string(legacyEffects[0]), "legacy JSON projects difficulty zero")

	legacy := Spell{Powers: []SpellPower{{OrderIndex: 0, ManaCost: 10}}}
	legacyJSON, err := json.Marshal(legacy)
	require.NoError(t, err)
	require.NotContains(t, string(legacyJSON), "modern_powers")
}

func effectIndexes(effects []SpellEffect) []int32 {
	indexes := make([]int32, len(effects))
	for i := range effects {
		indexes[i] = effects[i].EffectIndex
	}
	return indexes
}
