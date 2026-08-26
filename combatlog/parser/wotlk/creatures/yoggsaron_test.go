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
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
)

func newYoggSaronTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func yoggSaronVehicleGUID() guid.GUID {
	return guid.GUID(0xF150000000000001 | uint64(yoggSaronEntry)<<24)
}

func TestYoggSaronPhaseDefinitions(t *testing.T) {
	t.Parallel()

	require.Equal(t, "Yogg-Saron", YoggSaronPhaseDefinitions.EncounterName)
	require.Equal(t, []phases.Definition{
		{Key: YoggSaronPhaseKeyP1, Name: "Guardians", Order: 0},
		{Key: YoggSaronPhaseKeyP2, Name: "Mind", Order: 1},
		{Key: YoggSaronPhaseKeyP3, Name: "Old God", Order: 2},
	}, YoggSaronPhaseDefinitions.Definitions)
}

func TestYoggSaronPhaseTransitions(t *testing.T) {
	t.Parallel()

	all := newYoggSaronTestCharacters()
	player := guid.GUID(1)
	guardian := creatureGUID(yoggSaronGuardianEntry)
	tentacle := creatureGUID(yoggSaronCrusherEntry)
	yogg := yoggSaronVehicleGUID()
	start := time.Date(2026, time.August, 26, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, guardian))
	require.NoError(t, err)

	var transitions []phases.Transition
	all.SetPhaseTransitionCallback(func(transition phases.Transition) {
		transitions = append(transitions, transition)
	})

	_, err = all.Process(testDamage(start.Add(10*time.Second), player, tentacle))
	require.NoError(t, err)
	require.Len(t, transitions, 1)
	require.Equal(t, YoggSaronPhaseKeyP2, transitions[0].ToPhaseKey)
	require.Equal(t, guardian, transitions[0].SourceGUID)

	immune := testDamage(start.Add(20*time.Second), player, yogg)
	immune.HitType = types.HitTypeImmune
	_, err = all.Process(immune)
	require.NoError(t, err)
	require.Len(t, transitions, 1, "immune damage must remain phase 2")

	_, err = all.Process(testDamage(start.Add(30*time.Second), player, yogg))
	require.NoError(t, err)
	require.Len(t, transitions, 2)
	require.Equal(t, YoggSaronPhaseKeyP3, transitions[1].ToPhaseKey)
	require.Equal(t, guardian, transitions[1].SourceGUID)
}

func TestSaraBridgesPhaseOneTransformation(t *testing.T) {
	t.Parallel()

	all := newYoggSaronTestCharacters()
	player := guid.GUID(1)
	sara := creatureGUID(yoggSaronSaraEntry)
	tentacle := creatureGUID(yoggSaronCrusherEntry)
	start := time.Date(2026, time.August, 26, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, sara))
	require.NoError(t, err)
	saraCharacter, ok := all.Get(sara)
	require.True(t, ok)
	require.True(t, saraCharacter.IsActive())

	_, err = all.Process(messages.TimedOut(start.Add(65 * time.Second)))
	require.NoError(t, err)
	require.True(t, saraCharacter.IsActive(), "Sara must survive the 64-second transition")

	_, err = all.Process(testDamage(start.Add(70*time.Second), player, tentacle))
	require.NoError(t, err)
	_, err = all.Process(messages.TimedOut(start.Add(120 * time.Second)))
	require.NoError(t, err)
	require.True(t, saraCharacter.IsActive(), "phase-two activity must bump Sara")
}

func TestYoggSaronEncounterActivityKeepsObservedAnchorsActive(t *testing.T) {
	t.Parallel()

	all := newYoggSaronTestCharacters()
	player := guid.GUID(1)
	anchors := []guid.GUID{
		creatureGUID(yoggSaronSaraEntry),
		creatureGUID(yoggSaronBrainEntry),
		creatureGUID(yoggSaronEntry),
	}
	immortal := creatureGUID(yoggSaronImmortalEntry)
	start := time.Date(2026, time.August, 26, 12, 0, 0, 0, time.UTC)

	for offset, anchor := range anchors {
		_, err := all.Process(testDamage(start.Add(time.Duration(offset)*time.Second), player, anchor))
		require.NoError(t, err)
	}

	_, err := all.Process(testDamage(start.Add(65*time.Second), player, immortal))
	require.NoError(t, err)
	_, err = all.Process(messages.TimedOut(start.Add(120 * time.Second)))
	require.NoError(t, err)

	for _, anchor := range anchors {
		char, ok := all.Get(anchor)
		require.True(t, ok)
		require.True(t, char.IsActive(), "encounter activity must keep anchor %s active", anchor)
	}
}

func TestYoggSaronDeathKillsAnchorsAndDespawnsAdds(t *testing.T) {
	t.Parallel()

	all := newYoggSaronTestCharacters()
	player := guid.GUID(1)
	sara := creatureGUID(yoggSaronSaraEntry)
	brain := creatureGUID(yoggSaronBrainEntry)
	yogg := yoggSaronVehicleGUID()
	immortal := creatureGUID(yoggSaronImmortalEntry)
	start := time.Date(2026, time.August, 26, 12, 0, 0, 0, time.UTC)

	for offset, target := range []guid.GUID{sara, brain, yogg, immortal} {
		_, err := all.Process(testDamage(start.Add(time.Duration(offset)*time.Second), player, target))
		require.NoError(t, err)
	}

	slainAt := start.Add(4 * time.Second)
	_, err := all.Process(&messages.Slain{
		MessageBase: messages.Base(slainAt),
		Victim:      yogg,
	})
	require.NoError(t, err)

	for _, id := range []guid.GUID{sara, brain, yogg} {
		char, ok := all.Get(id)
		require.True(t, ok)
		require.False(t, char.IsActive())
		require.Equal(t, period.EndStateSlain, char.LastEndState())
		current := char.Periods()[len(char.Periods())-1]
		require.Equal(t, slainAt, current.End.Timestamp.Date())
	}

	immortalCharacter, ok := all.Get(immortal)
	require.True(t, ok)
	require.False(t, immortalCharacter.IsActive())
	require.Equal(t, period.EndStateReset, immortalCharacter.LastEndState())
}
