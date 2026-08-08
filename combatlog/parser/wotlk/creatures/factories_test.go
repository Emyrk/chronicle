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

func wotlkEntryGUID(high uint64, entry uint32) guid.GUID {
	return guid.GUID(high | uint64(entry)<<24 | 1)
}

func TestWotLKEncounterFactoriesRejectPetEntries(t *testing.T) {
	t.Parallel()

	chars := characters.NewCharacters(
		unitdb.New(),
		nil,
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
	factories := NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath})
	matches := func(id guid.GUID) bool {
		for _, factory := range factories {
			if _, ok := factory(id, chars); ok {
				return true
			}
		}
		return false
	}

	const malygosEntry = 28859
	require.False(t, matches(wotlkEntryGUID(0xF140000000000000, malygosEntry)))
	require.True(t, matches(wotlkEntryGUID(0xF130000000000000, malygosEntry)))
}

func TestAzerothServersideFactoryStillAcceptsPets(t *testing.T) {
	t.Parallel()

	chars := characters.NewCharacters(
		unitdb.New(),
		nil,
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
	pet := wotlkEntryGUID(0xF140000000000000, 11319)

	var matched characters.Character
	for _, factory := range AzerothServersideCoreCharacterFactories() {
		if char, ok := factory(pet, chars); ok {
			matched = char
			break
		}
	}

	require.IsType(t, &LogBased{}, matched)
	require.Equal(t, pet, matched.ID())
}
