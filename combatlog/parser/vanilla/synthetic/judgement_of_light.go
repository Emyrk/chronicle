package synthetic

import "github.com/Emyrk/chronicle/combatlog/parser/common/messages"

const judgementOfLight = "Judgement of Light"

// CreditJudgementOfLightToTarget credits Judgement of Light healing to the
// attacker receiving the heal instead of the paladin who applied the debuff.
func CreditJudgementOfLightToTarget(msgs []messages.Message) []messages.Message {
	for _, msg := range msgs {
		heal, ok := msg.(*messages.Heal)
		if !ok || heal.SpellName != judgementOfLight {
			continue
		}

		heal.Caster = heal.Target
	}

	return msgs
}
