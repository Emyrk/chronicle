package gamedataapi

import "github.com/Emyrk/chronicle/database/gamedb/chrondbc"

type cooldownSpellRow struct {
	SpellID                int32
	Name                   string
	NameSubtext            string
	RecoveryTimeMS         int64
	CategoryRecoveryTimeMS int64
	SpellClassSet          int32
}

func cooldownSpellFromSpell(spell *chrondbc.Spell) (cooldownSpellRow, bool) {
	if spell == nil || spell.Attrs.Has(chrondbc.Attr_Passive) {
		return cooldownSpellRow{}, false
	}
	if _, ok := playerClassName(spell.SpellClassSet); !ok {
		return cooldownSpellRow{}, false
	}

	cooldown := max(spell.RecoveryTime, spell.CategoryRecoveryTime)
	if cooldown <= 0 {
		return cooldownSpellRow{}, false
	}

	return cooldownSpellRow{
		SpellID:                int32(spell.ID),
		Name:                   spell.Name(),
		NameSubtext:            spell.Subtext(),
		RecoveryTimeMS:         spell.RecoveryTime.Milliseconds(),
		CategoryRecoveryTimeMS: spell.CategoryRecoveryTime.Milliseconds(),
		SpellClassSet:          int32(spell.SpellClassSet),
	}, true
}

func playerClassName(classSet chrondbc.SpellClassSet) (string, bool) {
	switch classSet {
	case chrondbc.SpellClassSetMage,
		chrondbc.SpellClassSetWarrior,
		chrondbc.SpellClassSetWarlock,
		chrondbc.SpellClassSetPriest,
		chrondbc.SpellClassSetDruid,
		chrondbc.SpellClassSetRogue,
		chrondbc.SpellClassSetHunter,
		chrondbc.SpellClassSetPaladin,
		chrondbc.SpellClassSetShaman,
		chrondbc.SpellClassSetDeathKnight:
		return classSet.String(), true
	default:
		return "", false
	}
}
