package epoch

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/stretchr/testify/assert"
)

func TestSplitEvent(t *testing.T) {
	t.Parallel()
	tests := []struct {
		event  string
		prefix string
		suffix string
	}{
		{"SWING_DAMAGE", "SWING", "_DAMAGE"},
		{"SWING_MISSED", "SWING", "_MISSED"},
		{"SPELL_DAMAGE", "SPELL", "_DAMAGE"},
		{"SPELL_HEAL", "SPELL", "_HEAL"},
		{"SPELL_MISSED", "SPELL", "_MISSED"},
		{"SPELL_ENERGIZE", "SPELL", "_ENERGIZE"},
		{"SPELL_PERIODIC_DAMAGE", "SPELL_PERIODIC", "_DAMAGE"},
		{"SPELL_PERIODIC_HEAL", "SPELL_PERIODIC", "_HEAL"},
		{"SPELL_PERIODIC_ENERGIZE", "SPELL_PERIODIC", "_ENERGIZE"},
		{"SPELL_PERIODIC_MISSED", "SPELL_PERIODIC", "_MISSED"},
		{"SPELL_CAST_START", "SPELL", "_CAST_START"},
		{"SPELL_CAST_SUCCESS", "SPELL", "_CAST_SUCCESS"},
		{"SPELL_CAST_FAILED", "SPELL", "_CAST_FAILED"},
		{"SPELL_AURA_APPLIED", "SPELL", "_AURA_APPLIED"},
		{"SPELL_AURA_REMOVED", "SPELL", "_AURA_REMOVED"},
		{"SPELL_AURA_APPLIED_DOSE", "SPELL", "_AURA_APPLIED_DOSE"},
		{"SPELL_AURA_REMOVED_DOSE", "SPELL", "_AURA_REMOVED_DOSE"},
		{"SPELL_AURA_REFRESH", "SPELL", "_AURA_REFRESH"},
		{"SPELL_AURA_BROKEN", "SPELL", "_AURA_BROKEN"},
		{"SPELL_AURA_BROKEN_SPELL", "SPELL", "_AURA_BROKEN_SPELL"},
		{"SPELL_INTERRUPT", "SPELL", "_INTERRUPT"},
		{"SPELL_DISPEL", "SPELL", "_DISPEL"},
		{"SPELL_STOLEN", "SPELL", "_STOLEN"},
		{"SPELL_EXTRA_ATTACKS", "SPELL", "_EXTRA_ATTACKS"},
		{"SPELL_INSTAKILL", "SPELL", "_INSTAKILL"},
		{"SPELL_SUMMON", "SPELL", "_SUMMON"},
		{"SPELL_CREATE", "SPELL", "_CREATE"},
		{"SPELL_DRAIN", "SPELL", "_DRAIN"},
		{"SPELL_LEECH", "SPELL", "_LEECH"},
		{"RANGE_DAMAGE", "RANGE", "_DAMAGE"},
		{"RANGE_MISSED", "RANGE", "_MISSED"},
		{"SPELL_BUILDING_DAMAGE", "SPELL_BUILDING", "_DAMAGE"},
		{"ENVIRONMENTAL_DAMAGE", "ENVIRONMENTAL", "_DAMAGE"},
		{"DAMAGE_SHIELD", "DAMAGE_SHIELD", ""},
		{"DAMAGE_SHIELD_MISSED", "DAMAGE_SHIELD_MISSED", ""},
		{"DAMAGE_SPLIT", "DAMAGE_SPLIT", ""},
		// Special events
		{"UNIT_DIED", "UNIT_DIED", ""},
		{"UNIT_DESTROYED", "UNIT_DESTROYED", ""},
		{"PARTY_KILL", "PARTY_KILL", ""},
		{"ENCHANT_APPLIED", "ENCHANT_APPLIED", ""},
	}

	for _, tc := range tests {
		t.Run(tc.event, func(t *testing.T) {
			t.Parallel()
			prefix, suffix := splitEvent(tc.event)
			assert.Equal(t, tc.prefix, prefix, "prefix mismatch for %s", tc.event)
			assert.Equal(t, tc.suffix, suffix, "suffix mismatch for %s", tc.event)
		})
	}
}

func TestPowerTypeToResource(t *testing.T) {
	t.Parallel()
	assert.Equal(t, types.ResourceHealth, PowerTypeToResource(-2))
	assert.Equal(t, types.ResourceMana, PowerTypeToResource(0))
	assert.Equal(t, types.ResourceRage, PowerTypeToResource(1))
	assert.Equal(t, types.ResourceFocus, PowerTypeToResource(2))
	assert.Equal(t, types.ResourceEnergy, PowerTypeToResource(3))
	assert.Equal(t, types.ResourceUnknown, PowerTypeToResource(99))
}

func TestMissTypeToHitType(t *testing.T) {
	t.Parallel()
	assert.Equal(t, types.HitTypeDodge, MissTypeToHitType("DODGE"))
	assert.Equal(t, types.HitTypeParry, MissTypeToHitType("PARRY"))
	assert.Equal(t, types.HitTypeMiss, MissTypeToHitType("MISS"))
	assert.Equal(t, types.HitTypeFullAbsorb, MissTypeToHitType("ABSORB"))
	assert.Equal(t, types.HitTypeFullBlock, MissTypeToHitType("BLOCK"))
	assert.Equal(t, types.HitTypeEvade, MissTypeToHitType("EVADE"))
	assert.Equal(t, types.HitTypeImmune, MissTypeToHitType("IMMUNE"))
	assert.Equal(t, types.HitTypeFullResist, MissTypeToHitType("RESIST"))
	assert.Equal(t, types.HitTypeReflect, MissTypeToHitType("REFLECT"))
	assert.Equal(t, types.HitTypeDeflect, MissTypeToHitType("DEFLECT"))
}

func TestDamageHitType(t *testing.T) {
	t.Parallel()

	boolTrue := true

	t.Run("normal hit", func(t *testing.T) {
		t.Parallel()
		ht := DamageHitType(nil, nil, nil, 0, 0, 0)
		assert.True(t, ht.Has(types.HitTypeHit))
	})

	t.Run("critical", func(t *testing.T) {
		t.Parallel()
		ht := DamageHitType(&boolTrue, nil, nil, 0, 0, 0)
		assert.True(t, ht.Has(types.HitTypeCrit))
	})

	t.Run("glancing", func(t *testing.T) {
		t.Parallel()
		ht := DamageHitType(nil, &boolTrue, nil, 0, 0, 0)
		assert.True(t, ht.Has(types.HitTypeGlancing))
	})

	t.Run("partial resist", func(t *testing.T) {
		t.Parallel()
		ht := DamageHitType(nil, nil, nil, 50, 0, 0)
		assert.True(t, ht.Has(types.HitTypePartialResist))
	})

	t.Run("partial absorb", func(t *testing.T) {
		t.Parallel()
		ht := DamageHitType(nil, nil, nil, 0, 0, 30)
		assert.True(t, ht.Has(types.HitTypePartialAbsorb))
	})
}

func TestEnvironmentTypeFromString(t *testing.T) {
	t.Parallel()
	assert.Equal(t, types.EnvironmentTypeFire, EnvironmentTypeFromString("FIRE"))
	assert.Equal(t, types.EnvironmentTypeLava, EnvironmentTypeFromString("LAVA"))
	assert.Equal(t, types.EnvironmentTypeFall, EnvironmentTypeFromString("FALLING"))
	assert.Equal(t, types.EnvironmentTypeDrowning, EnvironmentTypeFromString("DROWNING"))
}
