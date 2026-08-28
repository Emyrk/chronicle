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

func TestWotLKEncounterFactoriesUseNeverActiveVortex(t *testing.T) {
	t.Parallel()

	chars := characters.NewCharacters(
		unitdb.New(),
		nil,
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
	vortex := wotlkEntryGUID(0xF150000000000000, 30090)

	var matched characters.Character
	for _, factory := range NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}) {
		if char, ok := factory(vortex, chars); ok {
			matched = char
			break
		}
	}

	require.IsType(t, characters.NeverActive{}, matched)
	require.Equal(t, vortex, matched.ID())
}

func TestWotLKEncounterFactoriesUseNeverActiveMechanolift(t *testing.T) {
	t.Parallel()

	chars := characters.NewCharacters(
		unitdb.New(),
		nil,
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
	mechanolift := wotlkEntryGUID(0xF130000000000000, mechanoliftEntry)

	var matched characters.Character
	for _, factory := range NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}) {
		if char, ok := factory(mechanolift, chars); ok {
			matched = char
			break
		}
	}

	require.IsType(t, characters.NeverActive{}, matched)
	require.Equal(t, mechanolift, matched.ID())

	info, ok := chars.DB().Get(mechanolift)
	require.True(t, ok)
	require.Equal(t, "Mechanolift 304-A", info.Name)
}

func TestWotLKEncounterFactoriesAcceptYoggSaronVehicle(t *testing.T) {
	t.Parallel()

	chars := characters.NewCharacters(
		unitdb.New(),
		nil,
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
	yogg := wotlkEntryGUID(0xF150000000000000, yoggSaronEntry)

	var matched characters.Character
	for _, factory := range NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}) {
		if char, ok := factory(yogg, chars); ok {
			matched = char
			break
		}
	}

	require.IsType(t, &yoggSaronCharacter{}, matched)
	require.Equal(t, yogg, matched.ID())
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
