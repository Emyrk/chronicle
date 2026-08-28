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
		{Key: ThorimPhaseKeyP1, Name: "Arena", Order: 0},
		{Key: ThorimPhaseKeyP2, Name: "Gauntlet", Order: 1},
		{Key: ThorimPhaseKeyP3, Name: "Thorim", Order: 2},
	}, ThorimPhaseDefinitions.Definitions)
}

func TestThorimPhaseTransitions(t *testing.T) {
	t.Parallel()

	all := newThorimTestCharacters()
	player := guid.GUID(1)
	soldier := creatureGUID(32883)
	guard := creatureGUID(32874)
	thorim := creatureGUID(thorimEntry)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, soldier))
	require.NoError(t, err)

	var transitions []phases.Transition
	all.SetPhaseTransitionCallback(func(transition phases.Transition) {
		transitions = append(transitions, transition)
	})

	_, err = all.Process(testDamage(start.Add(10*time.Second), player, guard))
	require.NoError(t, err)
	require.Len(t, transitions, 1)
	require.Equal(t, soldier, transitions[0].SourceGUID)
	require.Equal(t, ThorimPhaseKeyP2, transitions[0].ToPhaseKey)

	immune := testDamage(start.Add(15*time.Second), player, thorim)
	immune.HitType = types.HitTypeImmune
	_, err = all.Process(immune)
	require.NoError(t, err)
	require.Len(t, transitions, 1)

	_, err = all.Process(testDamage(start.Add(20*time.Second), player, thorim))
	require.NoError(t, err)
	require.Len(t, transitions, 2)
	require.Equal(t, soldier, transitions[1].SourceGUID)
	require.Equal(t, ThorimPhaseKeyP3, transitions[1].ToPhaseKey)
}

func TestThorimActivityDoesNotKeepUnrelatedAddsAlive(t *testing.T) {
	t.Parallel()

	all := newThorimTestCharacters()
	player := guid.GUID(1)
	commonerID := creatureGUID(32904)
	championID := creatureGUID(32876)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, commonerID))
	require.NoError(t, err)
	_, err = all.Process(testDamage(start.Add(30*time.Second), player, championID))
	require.NoError(t, err)
	_, err = all.Process(messages.TimedOut(start.Add(61 * time.Second)))
	require.NoError(t, err)

	commoner, ok := all.Get(commonerID)
	require.True(t, ok)
	require.False(t, commoner.IsActive())
	require.Equal(t, start.Add(time.Minute), commoner.Periods()[0].End.Timestamp.Date())

	champion, ok := all.Get(championID)
	require.True(t, ok)
	require.True(t, champion.IsActive())
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
	require.Equal(t, period.EndStateSlain, soldier.LastEndState())
}

func TestThorimEvadeMarksSurrenderAsSlain(t *testing.T) {
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
	defeat.Amount = 0
	defeat.HitType = types.HitTypeEvade
	_, err = all.Process(defeat)
	require.NoError(t, err)

	thorim, ok := all.Get(thorimID)
	require.True(t, ok)
	require.False(t, thorim.IsActive())
	require.Equal(t, period.EndStateSlain, thorim.LastEndState())

	soldier, ok := all.Get(soldierID)
	require.True(t, ok)
	require.False(t, soldier.IsActive())
	require.Equal(t, period.EndStateSlain, soldier.LastEndState())
}

func TestSifIsNeverActive(t *testing.T) {
	t.Parallel()

	all := newThorimTestCharacters()
	player := guid.GUID(1)
	sifID := creatureGUID(33196)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, sifID, player))
	require.NoError(t, err)

	sif, ok := all.Get(sifID)
	require.True(t, ok)
	require.IsType(t, characters.NeverActive{}, sif)
	require.False(t, sif.IsActive())
	require.Empty(t, sif.Periods())
}

func TestThorimEncounterFactory(t *testing.T) {
	t.Parallel()

	all := newThorimTestCharacters()
	soldier, _ := all.Add(creatureGUID(32883), time.Time{})
	thorim, _ := all.Add(creatureGUID(thorimEntry), time.Time{})
	sif, _ := all.Add(creatureGUID(33196), time.Time{})

	require.IsType(t, &thorimCharacter{}, soldier)
	require.IsType(t, &thorimCharacter{}, thorim)
	require.IsType(t, characters.NeverActive{}, sif)
}
