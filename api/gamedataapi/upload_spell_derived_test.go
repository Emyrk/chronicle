package gamedataapi

import (
	"testing"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func TestSpellForDerivedMetadataUsesDifficultyZero(t *testing.T) {
	t.Parallel()

	spell := &chrondbc.Spell{
		Effects: []chrondbc.SpellEffect{
			{DifficultyID: 2, EffectIndex: 0, Effect: chrondbc.EffectAddExtraAttacks},
			{DifficultyID: 0, EffectIndex: 3, Effect: chrondbc.EffectSchoolDMG},
		},
		Powers: []chrondbc.SpellPower{
			{OrderIndex: 0, ManaCost: 10},
			{OrderIndex: 1, ManaCost: 20},
		},
		Variants: []chrondbc.SpellVariant{
			{DifficultyID: 2, Categories: &chrondbc.ModernSpellCategories{DefenseType: int32(chrondbc.DefenseTypeMelee)}},
		},
	}

	resolved := spellForDerivedMetadata(spell)
	require.NotSame(t, spell, resolved)
	require.Equal(t, []chrondbc.SpellEffect{{DifficultyID: 0, EffectIndex: 3, Effect: chrondbc.EffectSchoolDMG}}, resolved.Effects)
	require.Len(t, resolved.Powers, 2, "canonical power rows remain available")
	require.Len(t, resolved.Variants, 1, "canonical variant rows remain available")
	require.Len(t, spell.Effects, 2, "resolution must not mutate imported rows")
}

func TestSpellForDerivedMetadataNil(t *testing.T) {
	t.Parallel()

	require.Nil(t, spellForDerivedMetadata(nil))
}
