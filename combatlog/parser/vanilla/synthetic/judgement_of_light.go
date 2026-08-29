package synthetic

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

const (
	judgementOfLightHealSpellIDTBCWrath chrondbc.SpellID = 20267
	judgementOfLightHealSpellIDVanilla  chrondbc.SpellID = 20343
)

func isJudgementOfLightHeal(spellID chrondbc.SpellID) bool {
	return spellID == judgementOfLightHealSpellIDTBCWrath || spellID == judgementOfLightHealSpellIDVanilla
}

// CreditJudgementOfLightToTarget credits Judgement of Light healing to the
// attacker receiving the heal instead of the paladin who applied the debuff.
func CreditJudgementOfLightToTarget(msgs []messages.Message) []messages.Message {
	for _, msg := range msgs {
		heal, ok := msg.(*messages.Heal)
		if !ok || heal.SpellData == nil || !isJudgementOfLightHeal(heal.SpellData.ID) {
			continue
		}

		heal.Caster = heal.Target
	}

	return msgs
}
