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

func firstEffectValue(values []int32) int32 {
	if len(values) == 0 {
		return 0
	}
	return values[0]
}

func vulnerabilitySpellFromSpell(spell *chrondbc.Spell) (vulnerabilitySpellRow, bool) {
	if spell == nil {
		return vulnerabilitySpellRow{}, false
	}

	for _, effect := range spell.Effects {
		if effect.Effect != chrondbc.EffectApplyAura {
			continue
		}
		if effect.EffectBasePointsF != nil {
			if *effect.EffectBasePointsF == 0 {
				continue
			}
		} else if effect.EffectBasePoints == 0 {
			continue
		}

		value := int32(effect.EffectiveBasePoints())
		var percentAffect *int32
		var flatAffect *int32
		switch effect.EffectAura {
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
			SchoolBitmask: firstEffectValue(effect.EffectMiscValue),
			PercentAffect: percentAffect,
			FlatAffect:    flatAffect,
		}, true
	}

	return vulnerabilitySpellRow{}, false
}
