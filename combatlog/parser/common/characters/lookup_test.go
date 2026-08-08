package characters

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func entryGUID(high uint64, entry uint32) guid.GUID {
	return guid.GUID(high | uint64(entry)<<24 | 1)
}

func TestCreatureFactoriesRejectNonCreatureGUIDs(t *testing.T) {
	t.Parallel()

	calls := 0
	factory := func(id guid.GUID, _ *Characters) (Character, bool) {
		calls++
		return NewNeverActive(id), true
	}
	wrapped := CreatureFactories(factory)
	require.Len(t, wrapped, 1)

	const entry = 11583
	for _, id := range []guid.GUID{
		entryGUID(0xF140000000000000, entry), // Pet
		entryGUID(0xF150000000000000, entry), // Vehicle
		entryGUID(0xF110000000000000, entry), // Object
	} {
		char, ok := wrapped[0](id, nil)
		require.False(t, ok)
		require.Nil(t, char)
	}
	require.Zero(t, calls)

	creature := entryGUID(0xF130000000000000, entry)
	char, ok := wrapped[0](creature, nil)
	require.True(t, ok)
	require.Equal(t, creature, char.ID())
	require.Equal(t, 1, calls)
}

func TestCharactersByEntryOnlyIndexesCreatures(t *testing.T) {
	t.Parallel()

	chars := NewCharacters(
		unitdb.New(),
		nil,
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
	const entry = 11583
	now := time.Date(2026, time.August, 8, 0, 0, 0, 0, time.UTC)

	pet, _ := chars.Add(entryGUID(0xF140000000000000, entry), now)
	vehicle, _ := chars.Add(entryGUID(0xF150000000000000, entry), now)
	object, _ := chars.Add(entryGUID(0xF110000000000000, entry), now)
	creature, _ := chars.Add(entryGUID(0xF130000000000000, entry), now)

	require.NotNil(t, pet)
	require.NotNil(t, vehicle)
	require.NotNil(t, object)
	require.Equal(t, []Character{creature}, chars.ByEntry[entry])
}
