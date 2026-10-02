package identifier

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func TestIdentifyUnitOnlyTracksUnclassifiedCreaturesAsUnknown(t *testing.T) {
	t.Parallel()

	identifier := NewIdentifier(map[uint32]Identity{})
	for _, entryID := range []uint32{
		2914,  // Snake
		3680,  // Serpentbloom Snake
		3835,  // Biletoad
		5925,  // Grounding Totem
		11859, // Doomguard
	} {
		identifier.IdentifyUnit(creatureGUID(entryID))
	}

	const unknownEntryID uint32 = 12345
	identifier.IdentifyUnit(creatureGUID(unknownEntryID))
	identifier.IdentifyUnit(creatureGUID(unknownEntryID))

	require.Equal(t, map[uint32]int{unknownEntryID: 2}, identifier.UnknownUnits())
}

func creatureGUID(entryID uint32) guid.GUID {
	return guid.GUID(0xF130000000000001 | uint64(entryID&0xFFFFFF)<<24)
}
