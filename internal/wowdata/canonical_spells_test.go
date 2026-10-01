package wowdata

import (
	"testing"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestImportCanonicalSpellsAttachesModernComponents(t *testing.T) {
	t.Parallel()

	datasetID := uuid.New()
	p := &Import{
		Spells: []spelldb.SpellRow{{DatasetID: datasetID, SpellID: 100, Name: "Modern spell"}},
		SpellEffects: []SpellEffect{
			{
				SourceID: 10, SpellID: 100, DifficultyID: 0, EffectIndex: 7,
				Effect: int32(chrondbc.EffectAddExtraAttacks), EffectBasePointsF: 2.5,
				EffectMiscValue: []int32{1, 2}, EffectSpellClassMask: []int32{3, 4, 5},
				ImplicitTarget: []int32{6, 7}, PvpMultiplier: 0.75,
			},
			{SourceID: 11, SpellID: 999, DifficultyID: 0, EffectIndex: 9},
		},
		SpellPowers: []SpellPower{{SourceID: 20, SpellID: 100, OrderIndex: 3, ManaCost: 42, PowerCostPct: 12.5}},
		SpellVariants: []SpellVariant{{
			SpellID: 100, DifficultyID: 2,
			Misc:         &SpellMisc{SourceID: 30, Attributes: []int32{8, 9}, SchoolMask: 4},
			ClassOptions: &SpellClassOptions{SourceID: 31, SpellClassSet: 8, SpellClassMask: []int32{1, 2, 3}},
			Cooldowns:    &SpellCooldowns{SourceID: 32, RecoveryTime: 60_000},
		}},
	}

	spells := p.CanonicalSpells()
	require.Len(t, spells, 1)
	spell := spells[0]
	require.Equal(t, chrondbc.SpellID(100), spell.ID)
	require.Equal(t, "Modern spell", spell.Name())

	require.Len(t, spell.Effects, 1, "component-only spell IDs have no canonical base spell")
	effect := spell.Effects[0]
	require.Equal(t, datasetID, effect.DatasetID)
	require.Equal(t, int32(7), effect.EffectIndex)
	require.Equal(t, float32(2.5), effect.EffectiveBasePoints())
	require.Equal(t, []int32{1, 2}, effect.EffectMiscValue)
	require.Equal(t, []int32{3, 4, 5}, effect.EffectSpellClassMask)
	require.Equal(t, []int32{6, 7}, effect.ImplicitTarget)
	require.Equal(t, float32(0.75), effect.PVPMultiplier)

	require.Equal(t, []chrondbc.SpellPower{{
		DatasetID: datasetID, SpellID: 100, OrderIndex: 3, SourceID: 20,
		ManaCost: 42, PowerCostPct: 12.5,
	}}, spell.Powers)
	require.Len(t, spell.Variants, 1)
	require.Equal(t, datasetID, spell.Variants[0].DatasetID)
	require.Equal(t, []int32{8, 9}, spell.Variants[0].Misc.Attributes)
	require.Equal(t, []int32{1, 2, 3}, spell.Variants[0].ClassOptions.SpellClassMask)
	require.Equal(t, int32(60_000), spell.Variants[0].Cooldowns.RecoveryTime)
}

func TestImportCanonicalSpellsNil(t *testing.T) {
	t.Parallel()

	var p *Import
	require.Nil(t, p.CanonicalSpells())
}
