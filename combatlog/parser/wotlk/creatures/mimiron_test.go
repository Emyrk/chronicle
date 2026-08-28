package creatures

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
)

func newMimironTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func TestMimironPhaseDefinitions(t *testing.T) {
	t.Parallel()

	require.Equal(t, "Mimiron", MimironPhaseDefinitions.EncounterName)
	require.Equal(t, []phases.Definition{
		{Key: MimironPhaseKeyP1, Name: "Leviathan Mk II", Order: 0},
		{Key: MimironPhaseKeyP2, Name: "VX-001", Order: 1},
		{Key: MimironPhaseKeyP3, Name: "Aerial Command Unit", Order: 2},
		{Key: MimironPhaseKeyP4, Name: "V-07-TR-0N", Order: 3},
	}, MimironPhaseDefinitions.Definitions)
}

func TestMimironRequiresAllFourPhasesForDefeat(t *testing.T) {
	t.Parallel()

	all := newMimironTestCharacters()
	player := guid.GUID(1)
	leviathan := creatureGUID(mimironLeviathanMkIIEntry)
	vx001 := creatureGUID(mimironVX001Entry)
	aerial := creatureGUID(mimironAerialCommandEntry)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	var transitions []phases.Transition
	all.SetPhaseTransitionCallback(func(transition phases.Transition) {
		transitions = append(transitions, transition)
	})

	_, err := all.Process(testDamage(start, player, leviathan))
	require.NoError(t, err)
	_, err = all.Process(&messages.Slain{MessageBase: messages.Base(start.Add(time.Second)), Victim: leviathan})
	require.NoError(t, err)

	leviathanCharacter, ok := all.Get(leviathan)
	require.True(t, ok)
	require.True(t, leviathanCharacter.IsActive(), "phase one defeat must not complete the encounter")

	_, err = all.Process(testDamage(start.Add(10*time.Second), player, vx001))
	require.NoError(t, err)
	_, err = all.Process(&messages.Slain{MessageBase: messages.Base(start.Add(11 * time.Second)), Victim: vx001})
	require.NoError(t, err)
	_, err = all.Process(testDamage(start.Add(20*time.Second), player, aerial))
	require.NoError(t, err)
	_, err = all.Process(&messages.Slain{MessageBase: messages.Base(start.Add(21 * time.Second)), Victim: aerial})
	require.NoError(t, err)

	require.Equal(t, []string{MimironPhaseKeyP2, MimironPhaseKeyP3}, transitionKeys(transitions))
	for _, id := range []guid.GUID{leviathan, vx001, aerial} {
		character, found := all.Get(id)
		require.True(t, found)
		require.True(t, character.IsActive(), "three disabled machines are not a completed encounter")
		require.Equal(t, period.EndStateNone, character.LastEndState())
	}

	for i, id := range []guid.GUID{leviathan, vx001, aerial} {
		_, err = all.Process(testDamage(start.Add(30*time.Second+time.Duration(i)*time.Second), player, id))
		require.NoError(t, err)
	}
	require.Equal(t, []string{MimironPhaseKeyP2, MimironPhaseKeyP3, MimironPhaseKeyP4}, transitionKeys(transitions))

	for i, id := range []guid.GUID{leviathan, vx001} {
		_, err = all.Process(&messages.Slain{
			MessageBase: messages.Base(start.Add(40*time.Second + time.Duration(i)*time.Second)),
			Victim:      id,
		})
		require.NoError(t, err)
		character, found := all.Get(id)
		require.True(t, found)
		require.True(t, character.IsActive(), "phase four stays open until every component is defeated")
	}

	_, err = all.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(42 * time.Second)),
		Victim:      aerial,
	})
	require.NoError(t, err)
	for _, id := range []guid.GUID{leviathan, vx001, aerial} {
		character, found := all.Get(id)
		require.True(t, found)
		require.False(t, character.IsActive())
		require.Equal(t, period.EndStateSlain, character.LastEndState())
	}
}

func TestMimironSelfRepairSignalsPhaseFourAndCompletion(t *testing.T) {
	t.Parallel()

	all := newMimironTestCharacters()
	player := guid.GUID(1)
	leviathan := creatureGUID(mimironLeviathanMkIIEntry)
	vx001 := creatureGUID(mimironVX001Entry)
	aerial := creatureGUID(mimironAerialCommandEntry)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	var transitions []phases.Transition
	all.SetPhaseTransitionCallback(func(transition phases.Transition) {
		transitions = append(transitions, transition)
	})

	for i, target := range []guid.GUID{leviathan, vx001, aerial} {
		_, err := all.Process(testDamage(start.Add(time.Duration(i)*time.Second), player, target))
		require.NoError(t, err)
	}
	_, err := all.Process(&messages.Aura{
		MessageBase: messages.Base(start.Add(3 * time.Second)),
		Target:      leviathan,
		SpellName:   "Self Repair",
		Amount:      1,
	})
	require.NoError(t, err)
	require.Equal(t, []string{MimironPhaseKeyP2, MimironPhaseKeyP3, MimironPhaseKeyP4}, transitionKeys(transitions))

	for i, target := range []guid.GUID{leviathan, vx001, aerial} {
		_, err = all.Process(testDamage(start.Add(10*time.Second+time.Duration(i)*time.Second), player, target))
		require.NoError(t, err)
		_, err = all.Process(&messages.Aura{
			MessageBase: messages.Base(start.Add(20*time.Second + time.Duration(i)*time.Second)),
			Target:      target,
			SpellName:   "Self Repair",
			Amount:      1,
		})
		require.NoError(t, err)
	}

	for _, id := range []guid.GUID{leviathan, vx001, aerial} {
		character, found := all.Get(id)
		require.True(t, found)
		require.False(t, character.IsActive())
		require.Equal(t, period.EndStateSlain, character.LastEndState())
	}
}

func TestMimironFactoryMatchesBothLeviathanEntries(t *testing.T) {
	t.Parallel()

	all := newMimironTestCharacters()
	for _, entry := range []uint32{
		mimironLeviathanMkIIEntry,
		mimironLeviathanMkIIAltEntry,
		mimironVX001Entry,
		mimironAerialCommandEntry,
	} {
		character, _ := all.Add(creatureGUID(entry), time.Time{})
		require.IsType(t, &mimironCharacter{}, character)
	}
}

func transitionKeys(transitions []phases.Transition) []string {
	keys := make([]string, 0, len(transitions))
	for _, transition := range transitions {
		keys = append(keys, transition.ToPhaseKey)
	}
	return keys
}
