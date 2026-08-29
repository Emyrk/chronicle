package synthetic

import (
	"strconv"
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

	for _, spellID := range []chrondbc.SpellID{
		judgementOfLightHealSpellIDTBCWrath,
		judgementOfLightHealSpellIDVanilla,
	} {
		spellID := spellID
		t.Run(strconv.Itoa(int(spellID)), func(t *testing.T) {
			t.Parallel()

			judgement := &messages.Heal{
				Caster:    paladin,
				Target:    attacker,
				SpellName: "Localized spell name",
				SpellData: &chrondbc.Spell{ID: spellID},
			}

			result := CreditJudgementOfLightToTarget([]messages.Message{judgement})

			require.Same(t, judgement, result[0])
			require.Equal(t, attacker, judgement.Caster)
		})
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

	CreditJudgementOfLightToTarget([]messages.Message{wrongID, missingSpellData})

	require.Equal(t, paladin, wrongID.Caster)
	require.Equal(t, paladin, missingSpellData.Caster)
}
