package totems

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func totemEntryGUID(high uint64, entry uint32) guid.GUID {
	return guid.GUID(high | uint64(entry)<<24 | 1)
}

func TestIsTotemRequiresCreatureGUID(t *testing.T) {
	t.Parallel()

	const searingTotemEntry = 2523
	creature := totemEntryGUID(0xF130000000000000, searingTotemEntry)
	totem, ok := IsTotem(creature)
	require.True(t, ok)
	require.Equal(t, uint32(searingTotemEntry), totem.ID)

	for _, id := range []guid.GUID{
		totemEntryGUID(0xF140000000000000, searingTotemEntry), // Pet
		totemEntryGUID(0xF150000000000000, searingTotemEntry), // Vehicle
		totemEntryGUID(0xF110000000000000, searingTotemEntry), // Object
	} {
		_, ok := IsTotem(id)
		require.False(t, ok)
	}
}
