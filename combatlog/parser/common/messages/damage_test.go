package messages

import (
	"testing"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func TestDamageRequiresActiveUsesDefaultDifficultyClassification(t *testing.T) {
	t.Parallel()

	spell := &chrondbc.Spell{
		Effects: []chrondbc.SpellEffect{
			{DifficultyID: 0, EffectIndex: 0, Effect: chrondbc.EffectDistract},
			{DifficultyID: 198, EffectIndex: 0, Effect: chrondbc.EffectSchoolDMG},
		},
	}

	require.False(t, (Damage{SpellData: spell}).RequiresActive())
	require.Len(t, spell.Effects, 2, "classification must preserve canonical effect rows")
}
