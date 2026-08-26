package servicegamedata

import (
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/spelldb"
)

func TestApplyEquipSpellRowStats(t *testing.T) {
	t.Parallel()

	sim := chroniclesdk.SimItem{}
	applyEquipSpellRowStats(&spelldb.SpellRow{
		Effect0:           int32(chrondbc.EffectApplyAura),
		Effect1:           int32(chrondbc.EffectApplyAura),
		Effect2:           int32(chrondbc.EffectApplyAura),
		EffectAura0:       int32(chrondbc.AuraEffectModStat),
		EffectBasePoints0: 17, // DBC stores amount minus one.
		EffectMiscValue0:  0,  // Strength in SPELL_AURA_MOD_STAT order.
		EffectAura1:       int32(chrondbc.AuraEffectModDamageDone),
		EffectBasePoints1: 42,
		EffectMiscValue1:  0x7e, // All magical schools.
		EffectAura2:       int32(chrondbc.AuraEffectModResistance),
		EffectBasePoints2: 4,
		EffectMiscValue2:  (1 << 2) | (1 << 6), // Fire and arcane.
	}, &sim)

	if len(sim.Stats) != 2 {
		t.Fatalf("stats = %+v, want 2 entries", sim.Stats)
	}
	if sim.Stats[0] != (chroniclesdk.ItemStat{Type: itemModStrength, Value: 18}) {
		t.Errorf("strength stat = %+v, want type %d value 18", sim.Stats[0], itemModStrength)
	}
	if sim.Stats[1] != (chroniclesdk.ItemStat{Type: itemModSpellDamage, Value: 43}) {
		t.Errorf("spell damage stat = %+v, want type %d value 43", sim.Stats[1], itemModSpellDamage)
	}
	if sim.Resistances != [6]int32{0, 5, 0, 0, 0, 5} {
		t.Errorf("resistances = %v, want fire and arcane +5", sim.Resistances)
	}
}

func TestApplyEquipSpellRowStatsAllStats(t *testing.T) {
	t.Parallel()

	sim := chroniclesdk.SimItem{}
	applyEquipSpellRowStats(&spelldb.SpellRow{
		Effect0:           int32(chrondbc.EffectApplyAura),
		EffectAura0:       int32(chrondbc.AuraEffectModStat),
		EffectBasePoints0: 3,
		EffectMiscValue0:  -1,
	}, &sim)

	wantTypes := []int32{
		itemModStrength,
		itemModAgility,
		itemModStamina,
		itemModIntellect,
		itemModSpirit,
	}
	if len(sim.Stats) != len(wantTypes) {
		t.Fatalf("stats = %+v, want %d entries", sim.Stats, len(wantTypes))
	}
	for i, itemMod := range wantTypes {
		if sim.Stats[i] != (chroniclesdk.ItemStat{Type: itemMod, Value: 4}) {
			t.Errorf("stats[%d] = %+v, want type %d value 4", i, sim.Stats[i], itemMod)
		}
	}
}

func TestApplyEquipSpellRowStatsCombatBonuses(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		aura    chrondbc.AuraEffect
		misc    int32
		wantMod int32
	}{
		{name: "attack power", aura: chrondbc.AuraEffectModAttackPower, wantMod: itemModAttackPower},
		{name: "ranged attack power", aura: chrondbc.AuraEffectModRangedAttackPower, wantMod: itemModRangedAttackPower},
		{name: "hit", aura: chrondbc.AuraEffectModHitChance, wantMod: itemModHit},
		{name: "spell hit", aura: chrondbc.AuraEffectModSpellHitChance, wantMod: itemModHit},
		{name: "crit", aura: chrondbc.AuraEffectModWeaponCritPercent, wantMod: itemModCrit},
		{name: "spell crit", aura: chrondbc.AuraEffectModSpellCritChance, wantMod: itemModCrit},
		{name: "dodge", aura: chrondbc.AuraEffectModDodgePercent, wantMod: itemModDodge},
		{name: "parry", aura: chrondbc.AuraEffectModParryPercent, wantMod: itemModParry},
		{name: "block", aura: chrondbc.AuraEffectModBlockPercent, wantMod: itemModBlock},
		{name: "healing", aura: chrondbc.AuraEffectModHealingDone, wantMod: itemModHealing},
		{name: "mana per 5", aura: chrondbc.AuraEffectModPowerRegen, misc: 0, wantMod: itemModManaRegen},
		{name: "block value", aura: chrondbc.AuraEffectModBlockValueFlat, wantMod: itemModBlockValue},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			sim := chroniclesdk.SimItem{}
			applyEquipSpellRowStats(&spelldb.SpellRow{
				Effect0:           int32(chrondbc.EffectApplyAura),
				EffectAura0:       int32(tt.aura),
				EffectBasePoints0: 6,
				EffectMiscValue0:  tt.misc,
			}, &sim)
			if len(sim.Stats) != 1 || sim.Stats[0] != (chroniclesdk.ItemStat{Type: tt.wantMod, Value: 7}) {
				t.Errorf("stats = %+v, want type %d value 7", sim.Stats, tt.wantMod)
			}
		})
	}
}
