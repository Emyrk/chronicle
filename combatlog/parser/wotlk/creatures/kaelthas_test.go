package creatures

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
)

func newKaelThasTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorTBC}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func TestKaelThasPhaseDefinitions(t *testing.T) {
	t.Parallel()

	require.Equal(t, "Kael'thas Sunstrider", KaelThasPhaseDefinitions.EncounterName)
	require.Equal(t, []phases.Definition{
		{Key: KaelThasPhaseKeyAdvisors, Name: "Advisors", Order: 0},
		{Key: KaelThasPhaseKeyWeapons, Name: "Weapons", Order: 1},
		{Key: KaelThasPhaseKeyResurrected, Name: "Resurrected Advisors", Order: 2},
		{Key: KaelThasPhaseKeyKaelThas, Name: "Kael'thas", Order: 3},
	}, KaelThasPhaseDefinitions.Definitions)
}

func TestKaelThasTransitionsAcrossEncounterUnits(t *testing.T) {
	t.Parallel()

	all := newKaelThasTestCharacters()
	player := guid.GUID(1)
	advisor := creatureGUID(thaladredEntry)
	weapon := creatureGUID(cosmicInfuserEntry)
	boss := creatureGUID(kaelThasEntry)
	start := time.Date(2026, time.October, 5, 12, 0, 0, 0, time.UTC)

	var transitions []phases.Transition
	all.SetPhaseTransitionCallback(func(transition phases.Transition) {
		transitions = append(transitions, transition)
	})

	_, err := all.Process(testDamage(start, player, advisor))
	require.NoError(t, err)
	advisorCharacter, ok := all.Get(advisor)
	require.True(t, ok)
	require.Equal(t, KaelThasPhaseDefinitions, advisorCharacter.(phases.PhaseProvider).PhaseDefinitions())

	_, err = all.Process(testDamage(start.Add(30*time.Second), player, weapon))
	require.NoError(t, err)
	weaponCharacter, ok := all.Get(weapon)
	require.True(t, ok)
	require.Nil(t, weaponCharacter.(phases.PhaseProvider).PhaseDefinitions())

	_, err = all.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(40 * time.Second)),
		Victim:      weapon,
		Killer:      &player,
	})
	require.NoError(t, err)
	_, err = all.Process(testDamage(start.Add(2*time.Minute), player, advisor))
	require.NoError(t, err)
	_, err = all.Process(testDamage(start.Add(2*time.Minute+10*time.Second), player, boss))
	require.NoError(t, err)

	require.Equal(t, []string{
		KaelThasPhaseKeyWeapons,
		KaelThasPhaseKeyResurrected,
		KaelThasPhaseKeyKaelThas,
	}, transitionKeys(transitions))
	for _, transition := range transitions {
		require.Equal(t, advisor, transition.SourceGUID)
	}
}

func TestKaelThasEvadeResetsLinkedUnits(t *testing.T) {
	t.Parallel()

	all := newKaelThasTestCharacters()
	player := guid.GUID(1)
	advisor := creatureGUID(thaladredEntry)
	weapon := creatureGUID(cosmicInfuserEntry)
	start := time.Date(2026, time.October, 5, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, advisor))
	require.NoError(t, err)
	_, err = all.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(500 * time.Millisecond)),
		Victim:      advisor,
		Killer:      &player,
	})
	require.NoError(t, err)
	_, err = all.Process(testDamage(start.Add(time.Second), player, weapon))
	require.NoError(t, err)
	_, err = all.Process(&messages.UnitEvade{
		MessageBase: messages.Base(start.Add(2 * time.Second)),
		UnitGUID:    advisor,
	})
	require.NoError(t, err)

	for _, id := range []guid.GUID{advisor, weapon} {
		character, ok := all.Get(id)
		require.True(t, ok)
		require.False(t, character.IsActive())
	}

	_, err = all.Process(testDamage(start.Add(10*time.Second), player, advisor))
	require.NoError(t, err)
	advisorCharacter, ok := all.Get(advisor)
	require.True(t, ok)
	require.True(t, advisorCharacter.IsActive(), "the advisor should start cleanly on the next pull")
	require.Equal(t, KaelThasPhaseDefinitions, advisorCharacter.(phases.PhaseProvider).PhaseDefinitions())
}

func TestKaelThasFactoryMatchesEncounterEntries(t *testing.T) {
	t.Parallel()

	all := newKaelThasTestCharacters()
	for _, entry := range []uint32{
		kaelThasEntry,
		lordSanguinar,
		capernianEntry,
		telonicusEntry,
		thaladredEntry,
		netherstrandLongbowEntry,
		devastationEntry,
		cosmicInfuserEntry,
		infinityBladesEntry,
		warpSlicerEntry,
		phaseshiftBulwarkEntry,
		staffOfDisintegrationEntry,
	} {
		character, _ := all.Add(creatureGUID(entry), time.Time{})
		require.IsType(t, &kaelThasCharacter{}, character)
	}
}
