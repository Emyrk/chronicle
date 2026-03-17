package simulation

import "github.com/Emyrk/chronicle/simulation/gamedata"

// SpellModOp defines what property a spell modifier affects.
type SpellModOp int

const (
	SpellModDamage           SpellModOp = 0
	SpellModDuration         SpellModOp = 1
	SpellModThreat           SpellModOp = 2
	SpellModAttackPower      SpellModOp = 3
	SpellModCharges          SpellModOp = 4
	SpellModRange            SpellModOp = 5
	SpellModRadius           SpellModOp = 6
	SpellModCriticalChance   SpellModOp = 7
	SpellModAllEffects       SpellModOp = 8
	SpellModCastingTime      SpellModOp = 10
	SpellModCooldown         SpellModOp = 11
	SpellModCost             SpellModOp = 14
	SpellModCritDamageBonus  SpellModOp = 15
	SpellModHitChance        SpellModOp = 16
	SpellModDot              SpellModOp = 22
	SpellModHaste            SpellModOp = 23
	SpellModSpellBonusDamage SpellModOp = 24
)

// SpellModType determines how the modifier is applied.
type SpellModType int

const (
	SpellModFlat SpellModType = 107 // additive
	SpellModPct  SpellModType = 108 // multiplicative
)

// SpellMod represents a talent or aura modifier that alters spell properties.
type SpellMod struct {
	Op      SpellModOp
	Type    SpellModType
	Value   int32
	Mask    uint64 // SpellFamilyFlags match
	SpellID int32  // source talent/spell
	Charges int16  // 0 = infinite
}

// ApplySpellMods applies all matching mods for a given op to a base value.
// Flat mods are summed, then percent mods are applied multiplicatively.
func ApplySpellMods(mods []SpellMod, spell *gamedata.SpellData, op SpellModOp, baseValue float64) float64 {
	var flatSum float64
	pctProduct := 1.0

	for _, m := range mods {
		if m.Op != op {
			continue
		}
		// Check spell family mask match
		if m.Mask != 0 && (spell.SpellFamilyFlags&m.Mask) == 0 {
			continue
		}
		switch m.Type {
		case SpellModFlat:
			flatSum += float64(m.Value)
		case SpellModPct:
			pctProduct *= 1.0 + float64(m.Value)/100.0
		}
	}

	return (baseValue + flatSum) * pctProduct
}
