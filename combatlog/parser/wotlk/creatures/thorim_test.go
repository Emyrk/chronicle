package creatures

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
)

func newThorimTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func TestThorimPhaseDefinitions(t *testing.T) {
	t.Parallel()

	require.Equal(t, "Thorim", ThorimPhaseDefinitions.EncounterName)
	require.Equal(t, []phases.Definition{
		{Key: ThorimPhaseKeyP1, Name: "Arena and Gauntlet", Order: 0},
		{Key: ThorimPhaseKeyP2, Name: "Thorim", Order: 1},
	}, ThorimPhaseDefinitions.Definitions)
}

func TestThorimPhaseTransitionOnFirstDamageableBossHit(t *testing.T) {
	t.Parallel()

	all := newThorimTestCharacters()
	player := guid.GUID(1)
	soldier := creatureGUID(32883)
	thorim := creatureGUID(thorimEntry)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, soldier))
	require.NoError(t, err)

	var transitions []phases.Transition
	all.SetPhaseTransitionCallback(func(transition phases.Transition) {
		transitions = append(transitions, transition)
	})

	immune := testDamage(start.Add(10*time.Second), player, thorim)
	immune.HitType = types.HitTypeImmune
	_, err = all.Process(immune)
	require.NoError(t, err)
	require.Empty(t, transitions)

	_, err = all.Process(testDamage(start.Add(20*time.Second), player, thorim))
	require.NoError(t, err)
	require.Len(t, transitions, 1)
	require.Equal(t, soldier, transitions[0].SourceGUID)
	require.Equal(t, ThorimPhaseKeyP2, transitions[0].ToPhaseKey)
}

func TestThorimOverkillMarksSurrenderAsSlain(t *testing.T) {
	t.Parallel()

	all := newThorimTestCharacters()
	player := guid.GUID(1)
	soldierID := creatureGUID(32883)
	thorimID := creatureGUID(thorimEntry)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, soldierID))
	require.NoError(t, err)
	_, err = all.Process(testDamage(start.Add(time.Second), player, thorimID))
	require.NoError(t, err)

	defeat := testDamage(start.Add(2*time.Second), player, thorimID)
	defeat.Overkill = 939
	_, err = all.Process(defeat)
	require.NoError(t, err)

	thorim, ok := all.Get(thorimID)
	require.True(t, ok)
	require.False(t, thorim.IsActive())
	require.Equal(t, period.EndStateSlain, thorim.LastEndState())

	soldier, ok := all.Get(soldierID)
	require.True(t, ok)
	require.False(t, soldier.IsActive())
	require.Equal(t, period.EndStateReset, soldier.LastEndState())
}

func TestThorimEncounterFactory(t *testing.T) {
	t.Parallel()

	all := newThorimTestCharacters()
	soldier, _ := all.Add(creatureGUID(32883), time.Time{})
	thorim, _ := all.Add(creatureGUID(thorimEntry), time.Time{})

	require.IsType(t, &thorimCharacter{}, soldier)
	require.IsType(t, &thorimCharacter{}, thorim)
}
