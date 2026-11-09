package instances

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/stretchr/testify/require"
)

func TestHyjalSummitIdentities(t *testing.T) {
	t.Parallel()

	hostiles := HyjalSummitHostiles()

	for _, entry := range []uint32{
		3794, 3795, 17772, 17852, 17854, 17919, 17920, 17921, 17922,
		17928, 17931, 17932, 17933, 17934, 17935, 17936, 17937, 17943,
		17944, 17945, 17948, 18001, 18036, 18485, 18486, 18487, 18502,
	} {
		identity, ok := hostiles[entry]
		require.True(t, ok, "missing friendly entry %d", entry)
		require.Equal(t, types.AffiliationFriendly, identity.Affiliation, "entry %d", entry)
		require.False(t, identity.Boss, "entry %d", entry)
	}

	for _, entry := range []uint32{
		17818, 17864, 17895, 17897, 17898, 17899, 17902,
		17903, 17905, 17906, 17907, 17908, 17916,
	} {
		identity, ok := hostiles[entry]
		require.True(t, ok, "missing hostile entry %d", entry)
		require.Equal(t, types.AffiliationHostile, identity.Affiliation, "entry %d", entry)
		require.False(t, identity.Boss, "entry %d", entry)
	}

	bosses := map[uint32]string{
		17767: "Rage Winterchill",
		17808: "Anetheron",
		17842: "Azgalor",
		17888: "Kaz'rogal",
		17968: "Archimonde",
	}
	for entry, name := range bosses {
		identity, ok := hostiles[entry]
		require.True(t, ok, "missing boss entry %d", entry)
		require.Equal(t, types.AffiliationHostile, identity.Affiliation, "entry %d", entry)
		require.True(t, identity.Boss, "entry %d", entry)
		require.Equal(t, name, identity.EncounterName, "entry %d", entry)
	}
}
