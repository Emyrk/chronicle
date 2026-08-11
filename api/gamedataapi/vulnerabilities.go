package gamedataapi

import "github.com/Emyrk/chronicle/database/gamedb/chrondbc"

var ebonPlagueSpellIDs = map[chrondbc.SpellID]struct{}{
	51726: {},
	51734: {},
	51735: {},
}

type vulnerabilitySpellRow struct {
	SpellID       int32
	Name          string
	SchoolBitmask int32
	PercentAffect *int32
	FlatAffect    *int32
}

func vulnerabilitySpellFromSpell(spell *chrondbc.Spell) (vulnerabilitySpellRow, bool) {
	if spell == nil {
		return vulnerabilitySpellRow{}, false
	}

	for i, effect := range spell.Effect {
		if effect != chrondbc.EffectApplyAura || spell.EffectBasePoints[i] == 0 {
			continue
		}

		value := spell.EffectBasePoints[i] + 1
		var percentAffect *int32
		var flatAffect *int32
		switch spell.EffectAura[i] {
		case chrondbc.AuraEffectModDamagePercentTaken:
			percentAffect = &value
		case chrondbc.AuraEffectModDamageTaken:
			flatAffect = &value
		case chrondbc.AuraEffectDummy:
			if _, ok := ebonPlagueSpellIDs[spell.ID]; !ok {
				continue
			}
			percentAffect = &value
		default:
			continue
		}

		return vulnerabilitySpellRow{
			SpellID:       int32(spell.ID),
			Name:          spell.Name(),
			SchoolBitmask: spell.EffectMiscValue[i],
			PercentAffect: percentAffect,
			FlatAffect:    flatAffect,
		}, true
	}

	return vulnerabilitySpellRow{}, false
}
