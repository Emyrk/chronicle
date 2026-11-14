package combatant

import (
	"github.com/stretchr/testify/require"
	"testing"
)

func TestCloneDetachesMetadata(t *testing.T) {
	t.Parallel()
	level := int32(60)
	enchant := 1
	source := Combatant{Guild: &Guild{Name: "Original"}, Level: &level,
		GearSetups: []GearItem{{ItemID: 100, EnchantID: &enchant, BonusIDs: []int{1}}},
		Talents:    &Talents{Trees: [3][]uint8{{1}}},
		Glyphs:     &Glyphs{Groups: []GlyphGroup{{Major: [3]int{1}}}},
		V22:        &CombatantInfoV22{Spirit: &level, AdditionalUnknownStat: &level},
	}
	clone := source.Clone()
	clone.Guild.Name = "Changed"
	*clone.Level = 1
	clone.GearSetups[0].ItemID = 200
	*clone.GearSetups[0].EnchantID = 2
	clone.GearSetups[0].BonusIDs[0] = 2
	clone.Talents.Trees[0][0] = 2
	clone.Glyphs.Groups[0].Major[0] = 2
	*clone.V22.Spirit = 2
	*clone.V22.AdditionalUnknownStat = 3
	require.Equal(t, "Original", source.Guild.Name)
	require.Equal(t, int32(60), *source.Level)
	require.Equal(t, 100, source.GearSetups[0].ItemID)
	require.Equal(t, 1, *source.GearSetups[0].EnchantID)
	require.Equal(t, 1, source.GearSetups[0].BonusIDs[0])
	require.Equal(t, uint8(1), source.Talents.Trees[0][0])
	require.Equal(t, 1, source.Glyphs.Groups[0].Major[0])
	require.Equal(t, int32(60), *source.V22.Spirit)
	require.Equal(t, int32(60), *source.V22.AdditionalUnknownStat)
	require.Equal(t, Combatant{}, (Combatant{}).Clone())
}
