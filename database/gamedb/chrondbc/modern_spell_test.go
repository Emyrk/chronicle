package chrondbc

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Gophercraft/core/format/dbc/dbdefs"
	"github.com/stretchr/testify/require"
)

func TestSpellEnsureNormalizedComponents(t *testing.T) {
	t.Parallel()

	spell := Spell{
		ID:                       123,
		School:                   SchoolFire,
		PowerType:                PowerEnergy,
		ManaCost:                 25,
		ManaCostPct:              7,
		Effect:                   [3]Effect{EffectSchoolDMG, EffectApplyAura},
		EffectBasePoints:         [3]int32{9, 19},
		EffectAura:               [3]AuraEffect{0, AuraEffectPeriodicDamage},
		EffectRadiusIndex_:       [3]int32{4, 5},
		ImplicitTargetA:          [3]ImplicitTarget{ImplicitTargetUnitTargetEnemy},
		ImplicitTargetB:          [3]ImplicitTarget{ImplicitTargetDestTargetEnemy},
		RecoveryTime:             2 * time.Second,
		CategoryRecoveryTime:     3 * time.Second,
		StartRecoveryTime:        1500 * time.Millisecond,
		StartRecoveryCategory:    8,
		BaseLevel:                10,
		SpellLevel:               12,
		MaxLevel:                 60,
		MaxTargets:               2,
		TargetCreatureType:       CreatureTypeHumanoid,
		Targets:                  TargetFlags(3),
		CastingTimeIndex_:        6,
		DurationIndex_:           7,
		RangeIndex_:              8,
		EffectRealPointsPerLevel: [3]float32{1.5},
		EffectDieSides:           [3]int32{6},
		EffectBaseDice:           [3]int32{2},
		EffectDicePerLevel:       [3]int32{3},
	}

	spell.EnsureNormalizedComponents()

	require.Len(t, spell.Effects, 3)
	require.Equal(t, int32(0), spell.Effects[0].EffectIndex)
	require.Equal(t, float32(10), spell.Effects[0].EffectBasePointsF)
	require.Equal(t, []int32{4}, spell.Effects[0].EffectRadiusIndex)
	require.Equal(t, int32(6), spell.Effects[0].EffectDieSides)
	require.Equal(t, int32(2), spell.Effects[0].EffectBaseDice)
	require.Equal(t, int32(3), spell.Effects[0].EffectDicePerLevel)
	require.Equal(t, []int32{int32(ImplicitTargetUnitTargetEnemy), int32(ImplicitTargetDestTargetEnemy)}, spell.Effects[0].ImplicitTarget)
	require.Len(t, spell.Powers, 1)
	require.Equal(t, int32(PowerEnergy), spell.Powers[0].PowerType)
	require.Equal(t, int32(25), spell.Powers[0].ManaCost)
	require.Len(t, spell.Variants, 1)
	require.Equal(t, int32(0), spell.Variants[0].DifficultyID)
	require.Equal(t, int32(2000), spell.Variants[0].Cooldowns.RecoveryTime)

	encoded, err := json.Marshal(spell)
	require.NoError(t, err)
	require.Contains(t, string(encoded), `"modern_effects"`)
	require.Contains(t, string(encoded), `"modern_powers"`)
	require.Contains(t, string(encoded), `"modern_variants"`)

}

func TestSpellNormalizedResolution(t *testing.T) {
	t.Parallel()

	spell := Spell{
		Effects: []SpellEffect{
			{DifficultyID: 2, EffectIndex: 1, SourceID: 30, Effect: 201},
			{DifficultyID: 0, EffectIndex: 2, SourceID: 20, Effect: 102},
			{DifficultyID: 0, EffectIndex: 0, SourceID: 10, Effect: 100},
			{DifficultyID: 2, EffectIndex: 0, SourceID: 40, Effect: 200},
		},
		Powers: []SpellPower{
			{OrderIndex: 1, SourceID: 10, ManaCost: 200},
			{OrderIndex: 0, SourceID: 20, ManaCost: 100},
		},
		Variants: []SpellVariant{
			{DifficultyID: 2, Misc: &SpellMisc{Speed: 2}},
			{DifficultyID: 0, Misc: &SpellMisc{Speed: 1}},
		},
	}

	require.Equal(t, []int32{200, 201, 102}, effectValues(spell.EffectsForDifficulty(2)), "missing exact indexes inherit difficulty zero")
	require.Equal(t, []int32{100, 102}, effectValues(spell.EffectsForDifficulty(3)))
	effect, ok := spell.EffectForDifficulty(3, 2)
	require.True(t, ok)
	require.Equal(t, int32(102), effect.Effect)
	power, ok := spell.PrimaryPower()
	require.True(t, ok)
	require.Equal(t, int32(100), power.ManaCost)
	variant, ok := spell.ResolveVariant(2)
	require.True(t, ok)
	require.Equal(t, float32(2), variant.Misc.Speed)
	variant, ok = spell.ResolveVariant(3)
	require.True(t, ok)
	require.Equal(t, float32(1), variant.Misc.Speed)

	spell.EnsureNormalizedComponents()
	require.Len(t, spell.Effects, 4, "actual normalized rows must not be replaced")
	require.Equal(t, []int32{0, 0, 2, 2}, []int32{
		spell.Effects[0].DifficultyID,
		spell.Effects[1].DifficultyID,
		spell.Effects[2].DifficultyID,
		spell.Effects[3].DifficultyID,
	})
}

func TestProjectNormalizedDifficultyZeroToLegacy(t *testing.T) {
	t.Parallel()

	spell := Spell{
		Effects: []SpellEffect{
			{DifficultyID: 0, EffectIndex: 3, Effect: 999, EffectBasePointsF: 99},
			{DifficultyID: 0, EffectIndex: 1, Effect: int32(EffectApplyAura), EffectBasePointsF: 10.6, EffectDieSides: 6, EffectBaseDice: 2, EffectDicePerLevel: 3, EffectAura: int32(AuraEffectPeriodicDamage), EffectMiscValue: []int32{7, 8}, EffectRadiusIndex: []int32{9}, ImplicitTarget: []int32{10, 11}},
			{DifficultyID: 2, EffectIndex: 0, Effect: 888, EffectBasePointsF: 88},
		},
		Powers: []SpellPower{
			{OrderIndex: 1, SourceID: 2, ManaCost: 200},
			{OrderIndex: 0, SourceID: 3, ManaCost: 100, PowerCostPct: 12.6, PowerType: int32(PowerRage)},
		},
		Variants: []SpellVariant{
			{DifficultyID: 2, Misc: &SpellMisc{Speed: 9}},
			{DifficultyID: 0, Misc: &SpellMisc{Speed: 2.5, SchoolMask: int32(SchoolShadow), Attributes: []int32{1, 2}}, Levels: &SpellLevels{BaseLevel: 20, MaxLevel: 70, SpellLevel: 25}, Cooldowns: &SpellCooldowns{RecoveryTime: 1500}, TargetRestrictions: &SpellTargetRestrictions{MaxTargets: 4}},
		},
	}

	spell.ProjectNormalizedDifficultyZeroToLegacy()

	require.Equal(t, EffectApplyAura, spell.Effect[1])
	require.Equal(t, int32(10), spell.EffectBasePoints[1], "float base points use round(value)-1")
	require.Equal(t, float32(10.6), spell.EffectBasePointsF[1])
	require.Equal(t, int32(6), spell.EffectDieSides[1])
	require.Equal(t, int32(2), spell.EffectBaseDice[1])
	require.Equal(t, int32(3), spell.EffectDicePerLevel[1])
	require.Equal(t, AuraEffectPeriodicDamage, spell.EffectAura[1])
	require.Equal(t, int32(7), spell.EffectMiscValue[1])
	require.Equal(t, int32(9), spell.EffectRadiusIndex_[1])
	require.Equal(t, ImplicitTarget(10), spell.ImplicitTargetA[1])
	require.Equal(t, ImplicitTarget(11), spell.ImplicitTargetB[1])
	require.NotEqual(t, Effect(999), spell.Effect[0], "effect indexes above two are truncated")
	require.Equal(t, int32(100), spell.ManaCost)
	require.Equal(t, int32(13), spell.ManaCostPct)
	require.Equal(t, PowerRage, spell.PowerType)
	require.Equal(t, float32(2.5), spell.Speed)
	require.Equal(t, SchoolShadow, spell.School)
	require.Equal(t, uint32(1), spell.Attrs[0])
	require.Equal(t, int32(20), spell.BaseLevel)
	require.Equal(t, 1500*time.Millisecond, spell.RecoveryTime)
	require.Equal(t, int32(4), spell.MaxTargets)
}

func TestSpellFromDBPopulatesNormalizedComponents(t *testing.T) {
	t.Parallel()

	spell := SpellFromDB(&dbdefs.Ent_Spell{
		ID:               456,
		PowerType:        int32(PowerMana),
		ManaCost:         30,
		Effect:           []int32{int32(EffectSchoolDMG)},
		EffectBasePoints: []int32{14},
	})

	require.Len(t, spell.Effects, 3)
	require.Equal(t, int32(456), int32(spell.Effects[0].SpellID))
	require.Equal(t, int32(EffectSchoolDMG), spell.Effects[0].Effect)
	require.Equal(t, float32(15), spell.Effects[0].EffectBasePointsF)
	require.Len(t, spell.Powers, 1)
	require.Equal(t, int32(30), spell.Powers[0].ManaCost)
	require.Len(t, spell.Variants, 1)
}

func effectValues(effects []SpellEffect) []int32 {
	result := make([]int32, len(effects))
	for i, effect := range effects {
		result[i] = effect.Effect
	}
	return result
}
