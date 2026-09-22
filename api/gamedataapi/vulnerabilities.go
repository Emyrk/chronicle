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

	spell.EnsureNormalizedComponents()
	for _, effect := range spell.EffectsForDifficulty(0) {
		if chrondbc.Effect(effect.Effect) != chrondbc.EffectApplyAura || effect.LegacyBasePoints() == 0 {
			continue
		}

		value := effect.BasePoints()
		var percentAffect *int32
		var flatAffect *int32
		switch chrondbc.AuraEffect(effect.EffectAura) {
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
			SchoolBitmask: effect.MiscValue(),
			PercentAffect: percentAffect,
			FlatAffect:    flatAffect,
		}, true
	}

	return vulnerabilitySpellRow{}, false
}
