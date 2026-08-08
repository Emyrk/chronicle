package traps

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func trapEntryGUID(high uint64, entry uint32) guid.GUID {
	return guid.GUID(high | uint64(entry)<<24 | 1)
}

func TestIsTrapRequiresObjectGUID(t *testing.T) {
	t.Parallel()

	const freezingTrapEntry = 2561
	object := trapEntryGUID(0xF110000000000000, freezingTrapEntry)
	trap, ok := IsTrap(object)
	require.True(t, ok)
	require.Equal(t, uint32(freezingTrapEntry), trap.ID)

	for _, id := range []guid.GUID{
		trapEntryGUID(0xF130000000000000, freezingTrapEntry), // Creature
		trapEntryGUID(0xF140000000000000, freezingTrapEntry), // Pet
		trapEntryGUID(0xF150000000000000, freezingTrapEntry), // Vehicle
	} {
		_, ok := IsTrap(id)
		require.False(t, ok)
	}
}
