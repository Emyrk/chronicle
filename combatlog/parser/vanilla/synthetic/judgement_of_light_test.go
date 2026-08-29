package synthetic

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func TestCreditJudgementOfLightToTarget(t *testing.T) {
	t.Parallel()

	paladin := guid.GUID(1)
	attacker := guid.GUID(2)

	judgement := &messages.Heal{
		Caster:    paladin,
		Target:    attacker,
		SpellName: "Localized spell name",
		SpellData: &chrondbc.Spell{ID: judgementOfLightHealSpellID},
	}
	wrongID := &messages.Heal{
		Caster:    paladin,
		Target:    attacker,
		SpellName: "Judgement of Light",
		SpellData: &chrondbc.Spell{ID: 1},
	}
	missingSpellData := &messages.Heal{
		Caster:    paladin,
		Target:    attacker,
		SpellName: "Judgement of Light",
	}

	msgs := []messages.Message{judgement, wrongID, missingSpellData}
	result := CreditJudgementOfLightToTarget(msgs)

	require.Same(t, judgement, result[0])
	require.Equal(t, attacker, judgement.Caster)
	require.Equal(t, paladin, wrongID.Caster)
	require.Equal(t, paladin, missingSpellData.Caster)
}
