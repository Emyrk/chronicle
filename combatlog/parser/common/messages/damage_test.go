package messages

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func TestDamageRequiresActiveUsesDefaultDifficultySpellClassification(t *testing.T) {
	t.Parallel()

	spell := &chrondbc.Spell{
		Effects: []chrondbc.SpellEffect{
			{DifficultyID: 0, EffectIndex: 0, Effect: chrondbc.EffectDummy},
			{DifficultyID: 2, EffectIndex: 0, Effect: chrondbc.EffectSchoolDMG},
		},
	}
	damage := Damage{
		SpellData: spell,
		HitType:   types.HitTypeHit,
	}

	require.False(t, damage.RequiresActive())
	require.Len(t, spell.Effects, 2, "classification must preserve canonical spell rows")
}
