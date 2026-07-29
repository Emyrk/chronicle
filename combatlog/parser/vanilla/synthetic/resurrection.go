package synthetic

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

// DetectResurrections emits a resurrection event for completed spells whose DBC
// effects bring a unit back to life.
func DetectResurrections(msgs []messages.Message) []messages.Message {
	var detected []messages.Message
	for _, msg := range msgs {
		spellGo, ok := msg.(*messages.SpellGo)
		if !ok || spellGo.SpellData == nil {
			continue
		}

		selfResurrection, resurrection := resurrectionEffects(spellGo.SpellData)
		if !resurrection {
			continue
		}

		target, ok := resurrectionTarget(spellGo, selfResurrection)
		if !ok {
			continue
		}

		detected = append(detected, &messages.Resurrection{
			MessageBase: messages.Base(spellGo.Date(), messages.WithSynthetic()),
			Source:      spellGo.Caster,
			Target:      target,
			Spell:       spellGo.SpellData,
		})
	}

	if len(detected) == 0 {
		return msgs
	}
	return append(msgs, detected...)
}

func resurrectionEffects(spell *chrondbc.Spell) (selfResurrection bool, resurrection bool) {
	for _, effect := range spell.Effect {
		switch effect {
		case chrondbc.EffectSelfResurrect:
			selfResurrection = true
			resurrection = true
		case chrondbc.EffectResurrect, chrondbc.EffectResurrectPet, chrondbc.EffectResurrectWithAura:
			resurrection = true
		}
	}
	return selfResurrection, resurrection
}

func resurrectionTarget(spellGo *messages.SpellGo, selfResurrection bool) (guid.GUID, bool) {
	if spellGo.CorpseOwner != nil {
		return *spellGo.CorpseOwner, true
	}
	if spellGo.Target != nil {
		return *spellGo.Target, true
	}
	if selfResurrection {
		return spellGo.Caster, true
	}
	return 0, false
}
