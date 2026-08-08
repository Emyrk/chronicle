package creatures

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func creatureEntryGUID(high uint64, entry uint32) guid.GUID {
	return guid.GUID(high | uint64(entry)<<24 | 1)
}

func factoryMatch(factories []characters.CharacterFactory, id guid.GUID, chars *characters.Characters) bool {
	for _, factory := range factories {
		if _, ok := factory(id, chars); ok {
			return true
		}
	}
	return false
}

func TestVanillaEncounterFactoriesRejectPetEntries(t *testing.T) {
	t.Parallel()

	chars := characters.NewCharacters(
		unitdb.New(),
		nil,
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
	factories := VanillaCharacterFactories(database.WoWFlavor{database.FlavorVanilla})

	const nefarianEntry = 11583
	require.False(t, factoryMatch(factories, creatureEntryGUID(0xF140000000000000, nefarianEntry), chars))
	require.True(t, factoryMatch(factories, creatureEntryGUID(0xF130000000000000, nefarianEntry), chars))
}

func TestNewObjectRequiresObjectGUID(t *testing.T) {
	t.Parallel()

	chars := characters.NewCharacters(
		unitdb.New(),
		nil,
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)

	for _, entry := range []uint32{181102, 2561} {
		char, ok := NewObject(creatureEntryGUID(0xF140000000000000, entry), chars)
		require.False(t, ok)
		require.Nil(t, char)

		char, ok = NewObject(creatureEntryGUID(0xF110000000000000, entry), chars)
		require.True(t, ok)
		require.NotNil(t, char)
	}
}
