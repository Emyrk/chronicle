package critters_test

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/critters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/stretchr/testify/require"
)

func TestLegacyCritterGuardAndUnknownReporting(t *testing.T) {
	t.Parallel()
	for _, entry := range []uint32{4075, 7395, 4076, 2914, 883, 1420, 16030, 3835, 14881, 10441, 13321, 3680, 15010, 25254, 263055, 263061, 263064} {
		id := guid.GUID(0xF130000000000000 | uint64(entry)<<24 | 1)
		require.True(t, critters.IsCritter(id))
		identifier := identifier.NewIdentifier(nil)
		identity := identifier.IdentifyUnit(id)
		require.Equal(t, types.AffiliationUnknown, identity.Affiliation, "legacy identity representation remains unchanged")
		require.Empty(t, identifier.UnknownUnits(), "legacy critter exclusion from unknown reporting remains unchanged")
	}
	for _, high := range []uint64{0, 0xF110000000000000, 0xF140000000000000, 0xF150000000000000} {
		require.False(t, critters.IsCritter(guid.GUID(high|4075<<24|1)))
	}
	require.False(t, critters.IsCritter(0))
	unknown := guid.GUID(0xF130000000000000 | 999999<<24 | 1)
	require.False(t, critters.IsCritter(unknown))
	idf := identifier.NewIdentifier(nil)
	idf.IdentifyUnit(unknown)
	require.Equal(t, map[uint32]int{999999: 1}, idf.UnknownUnits())
}
