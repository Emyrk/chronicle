package chrondbc

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSpellEffectEffectiveBasePoints(t *testing.T) {
	t.Parallel()

	assert.Equal(t, float32(14), (SpellEffect{EffectBasePoints: 13}).EffectiveBasePoints())
	exact := float32(0)
	assert.Equal(t, float32(0), (SpellEffect{EffectBasePoints: 13, EffectBasePointsF: &exact}).EffectiveBasePoints())
}

func TestSpellEffectDamageTakenSchoolMask(t *testing.T) {
	t.Parallel()

	mask, ok := (SpellEffect{EffectMiscValue: []int32{int32(SchoolFire), int32(SchoolFrost)}}).DamageTakenSchoolMask()
	assert.True(t, ok)
	assert.Equal(t, SchoolFire, mask)

	_, ok = (SpellEffect{}).DamageTakenSchoolMask()
	assert.False(t, ok)
}

func TestSpellDefaultClassificationIgnoresNonzeroDifficulty(t *testing.T) {
	t.Parallel()

	spell := Spell{
		Effects: []SpellEffect{
			{DifficultyID: 0, EffectIndex: 0, Effect: EffectDistract},
			{DifficultyID: 2, EffectIndex: 0, Effect: EffectSchoolDMG},
			{
				DifficultyID:    0,
				EffectIndex:     4,
				Effect:          EffectApplyAura,
				EffectAura:      AuraEffectModDamagePercentTaken,
				EffectMiscValue: []int32{int32(SchoolFrost), int32(SchoolFire)},
			},
			{
				DifficultyID:    2,
				EffectIndex:     4,
				Effect:          EffectApplyAura,
				EffectAura:      AuraEffectModDamagePercentTaken,
				EffectMiscValue: []int32{int32(SchoolFire)},
			},
		},
	}

	assert.Equal(t, SpellDamageNoEngageCombat, spell.SpellDamageType())
	assert.True(t, spell.Affects(Spell{School: SchoolFrost}))
	assert.False(t, spell.Affects(Spell{School: SchoolFire}))
	assert.Len(t, spell.Effects, 4, "classification must not mutate canonical effects")
}

func TestSpell_AttackOutcome(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name         string
		spell        Spell
		expected     AttackOutcome
		expectedType SpellDamageType
	}{
		{
			name: "MeleeBlockable",
			spell: Spell{
				DefenseType: DefenseTypeMelee,
				Attrs:       attrsWithBlockable(),
			},
			expected: AttackOutcomeMiss | AttackOutcomeHit | AttackOutcomeDodge | AttackOutcomeParry | AttackOutcomeBlock | AttackOutcomeCrit,
		},
		{
			name: "Ranged",
			spell: Spell{
				DefenseType: DefenseTypeRanged,
			},
			expected: AttackOutcomeMiss | AttackOutcomeHit | AttackOutcomeDodge | AttackOutcomeCrit,
		},
		{
			name: "MagicResistable",
			spell: Spell{
				DefenseType: DefenseTypeMagic,
			},
			expected: AttackOutcomeMiss | AttackOutcomeHit | AttackOutcomeResist | AttackOutcomeCrit,
		},
		{
			name: "MagicIgnoresResistances",
			spell: Spell{
				DefenseType: DefenseTypeMagic,
				Attrs:       attrsWith(AttrEx4_IgnoreResistances),
			},
			expected: AttackOutcomeMiss | AttackOutcomeHit | AttackOutcomeCrit,
		},
		{
			name: "NoActiveDefenseMelee",
			spell: Spell{
				DefenseType: DefenseTypeMelee,
				Attrs:       attrsWith(Attr_NoActiveDefense),
			},
			expected: AttackOutcomeMiss | AttackOutcomeHit | AttackOutcomeCrit,
		},
		{
			name: "NoActiveDefenseMagic",
			spell: Spell{
				DefenseType: DefenseTypeMagic,
				Attrs:       attrsWith(Attr_NoActiveDefense),
			},
			expected: AttackOutcomeMiss | AttackOutcomeHit | AttackOutcomeResist | AttackOutcomeCrit,
		},
		{
			name: "NoActiveDefenseMagicIgnoreResist",
			spell: Spell{
				DefenseType: DefenseTypeMagic,
				Attrs:       attrsWith(Attr_NoActiveDefense, AttrEx4_IgnoreResistances),
			},
			expected: AttackOutcomeMiss | AttackOutcomeHit | AttackOutcomeCrit,
		},
		{
			name: "CantCrit",
			spell: Spell{
				DefenseType: DefenseTypeMelee,
				Attrs:       attrsWith(AttrEx2_CantCrit),
			},
			expected: AttackOutcomeMiss | AttackOutcomeDodge | AttackOutcomeParry | AttackOutcomeHit | AttackOutcomeBlock,
		},
		{
			name: "DefenseTypeNone",
			spell: Spell{
				DefenseType: DefenseTypeNone,
			},
			expected: AttackOutcomeMiss | AttackOutcomeHit,
		},
		{
			name: "Hurricane",
			spell: Spell{
				DefenseType: DefenseTypeMagic,
				Effects: []SpellEffect{
					{EffectIndex: 0, Effect: EffectPersistentAA, EffectAura: AuraEffectPeriodicDamage, ImplicitTarget: []int32{int32(ImplicitTargetDestDynobjEnemy)}},
					{EffectIndex: 1, Effect: EffectPersistentAA, EffectAura: AuraEffectModMeleeHaste, ImplicitTarget: []int32{int32(ImplicitTargetDestDynobjEnemy)}},
					{EffectIndex: 2},
				},
				Attrs: MakeSpellAttributes(AttrEx_Channeled1, AttrEx_CantBeRedirected, AttrEx_CantBeReflected,
					AttrEx2_NoInitialThreat, AttrEx2_NotNeedShapeshift, Attr_NotShapeshift),
			},
			// TODO: This can't crit right?
			expected:     AttackOutcomeMiss | AttackOutcomeHit | AttackOutcomeCrit | AttackOutcomeResist,
			expectedType: SpellDamagePeriodic,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			result := tc.spell.AttackOutcome()
			typeResult := tc.spell.SpellDamageType()
			assert.Equal(t, tc.expected, result, "AttackOutcome mismatch for %s", tc.name)
			assert.Equal(t, tc.expectedType, typeResult, "AttackOutcome mismatch for %s", tc.name)
		})
	}
}

// attrsWith creates SpellAttributes with the given attributes set.
func attrsWith(attrs ...Attribute) SpellAttributes {
	var sa SpellAttributes
	for _, a := range attrs {
		sa.Set(a)
	}
	return sa
}

// attrsWithBlockable creates SpellAttributes with AttrEx3_BlockableSpell set.
func attrsWithBlockable() SpellAttributes {
	return attrsWith(AttrEx3_BlockableSpell)
}

func TestSpell_SpellDamageNoEngageCombat_MutuallyExclusive(t *testing.T) {
	t.Parallel()

	otherBits := []SpellDamageType{
		SpellDamageDirect,
		SpellDamagePeriodic,
		SpellDamagePeriodicTrigger,
		SpellDamageActiveDebuff,
	}

	tests := []struct {
		name  string
		spell Spell
	}{
		{
			name: "DistractOnly",
			spell: Spell{
				Effects: []SpellEffect{{EffectIndex: 0, Effect: EffectDistract}},
			},
		},
		{
			name: "DistractAndDirectDamage",
			spell: Spell{
				Effects: []SpellEffect{{EffectIndex: 0, Effect: EffectDistract}, {EffectIndex: 1, Effect: EffectSchoolDMG}},
			},
		},
		{
			name: "DistractAndPeriodic",
			spell: Spell{
				Effects: []SpellEffect{{EffectIndex: 0, Effect: EffectDistract}, {EffectIndex: 1, Effect: EffectApplyAura, EffectAura: AuraEffectPeriodicDamage}},
			},
		},
		{
			name: "DistractAndPeriodicTrigger",
			spell: Spell{
				Effects: []SpellEffect{{EffectIndex: 0, Effect: EffectDistract}, {EffectIndex: 1, Effect: EffectApplyAura, EffectAura: AuraEffectPeriodicTriggerSpell}},
			},
		},
		{
			name: "DistractAndActiveDebuff",
			spell: Spell{
				Effects: []SpellEffect{{EffectIndex: 0, Effect: EffectDistract}, {EffectIndex: 1, Effect: EffectApplyAura, EffectAura: AuraEffectModResistance, ImplicitTarget: []int32{int32(ImplicitTargetUnitTargetEnemy)}}},
			},
		},
		{
			name: "ModDetectRangeOnly",
			spell: Spell{
				Effects: []SpellEffect{{EffectIndex: 0, Effect: EffectApplyAura, EffectAura: AuraEffectModDetectRange}},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			result := tc.spell.SpellDamageType()

			if result.Has(SpellDamageNoEngageCombat) {
				for _, bit := range otherBits {
					assert.False(t, result.Has(bit),
						"SpellDamageNoEngageCombat must be mutually exclusive with %#x", bit)
				}
			}
		})
	}
}
