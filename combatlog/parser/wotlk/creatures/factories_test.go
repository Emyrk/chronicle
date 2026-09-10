package creatures

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func wotlkEntryGUID(high uint64, entry uint32) guid.GUID {
	return guid.GUID(high | uint64(entry)<<24 | 1)
}

func TestWotLKEncounterFactoriesTreatIronConstructTimeoutAsDeathWhileIgnisIsAlive(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name           string
		ignisEntry     uint32
		constructEntry uint32
	}{
		{name: "10 player", ignisEntry: 33118, constructEntry: 33121},
		{name: "25 player", ignisEntry: 33190, constructEntry: 33191},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			all := characters.NewCharacters(
				unitdb.New(),
				NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
				identifier.NewIdentifier(map[uint32]identifier.Identity{}),
			)
			player := guid.GUID(1)
			ignisID := wotlkEntryGUID(0xF130000000000000, test.ignisEntry)
			constructID := wotlkEntryGUID(0xF130000000000000, test.constructEntry)
			start := time.Date(2026, time.September, 10, 12, 0, 0, 0, time.UTC)

			_, err := all.Process(testDamage(start, constructID, player))
			require.NoError(t, err)
			_, err = all.Process(testDamage(start, ignisID, player))
			require.NoError(t, err)
			_, err = all.Process(testDamage(start.Add(30*time.Second), ignisID, player))
			require.NoError(t, err)
			_, err = all.Process(messages.TimedOut(start.Add(61 * time.Second)))
			require.NoError(t, err)

			construct, ok := all.Get(constructID)
			require.True(t, ok)
			require.Equal(t, period.EndStateSlain, construct.LastEndState())
		})
	}
}

func TestWotLKEncounterFactoriesLeaveIronConstructTimeoutWhenIgnisIsInactive(t *testing.T) {
	t.Parallel()

	all := characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
	player := guid.GUID(1)
	constructID := wotlkEntryGUID(0xF130000000000000, 33121)
	start := time.Date(2026, time.September, 10, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, constructID, player))
	require.NoError(t, err)
	_, err = all.Process(messages.TimedOut(start.Add(61 * time.Second)))
	require.NoError(t, err)

	construct, ok := all.Get(constructID)
	require.True(t, ok)
	require.Equal(t, period.EndStateTimeout, construct.LastEndState())
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
	mechanolift := wotlkEntryGUID(0xF150000000000000, mechanoliftEntry)
	creatureWithSameEntry := wotlkEntryGUID(0xF130000000000000, mechanoliftEntry)
	character, ok := NewMechanolift(creatureWithSameEntry, chars)
	require.False(t, ok)
	require.Nil(t, character)

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

func TestWotLKEncounterFactoriesAcceptMimironVehicle(t *testing.T) {
	t.Parallel()

	chars := characters.NewCharacters(
		unitdb.New(),
		nil,
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
	leviathan := wotlkEntryGUID(0xF150000000000000, mimironLeviathanMkIIEntry)

	var matched characters.Character
	for _, factory := range NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}) {
		if char, ok := factory(leviathan, chars); ok {
			matched = char
			break
		}
	}

	require.IsType(t, &mimironCharacter{}, matched)
	require.Equal(t, leviathan, matched.ID())
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
