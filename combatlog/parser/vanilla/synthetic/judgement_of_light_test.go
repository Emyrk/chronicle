package synthetic

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func TestCreditJudgementOfLightToTarget(t *testing.T) {
	t.Parallel()

	paladin := guid.GUID(1)
	attacker := guid.GUID(2)

	judgement := &messages.Heal{
		Caster:    paladin,
		Target:    attacker,
		SpellName: "Judgement of Light",
	}
	otherHeal := &messages.Heal{
		Caster:    paladin,
		Target:    attacker,
		SpellName: "Flash of Light",
	}

	msgs := []messages.Message{judgement, otherHeal}
	result := CreditJudgementOfLightToTarget(msgs)

	require.Same(t, judgement, result[0])
	require.Equal(t, attacker, judgement.Caster)
	require.Equal(t, paladin, otherHeal.Caster)
}
