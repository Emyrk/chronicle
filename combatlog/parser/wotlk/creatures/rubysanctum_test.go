package creatures

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
)

func newRubySanctumTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func TestHalionSlainLinksPhysicalAndTwilightBodies(t *testing.T) {
	t.Parallel()

	all := newRubySanctumTestCharacters()
	player := guid.GUID(1)
	physical := creatureGUID(39863)
	twilight := creatureGUID(40142)
	start := time.Date(2026, time.June, 29, 21, 40, 25, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, physical))
	require.NoError(t, err)
	_, err = all.Process(testDamage(start.Add(time.Second), player, twilight))
	require.NoError(t, err)
	_, err = all.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(2 * time.Second)),
		Killer:      &player,
		Victim:      twilight,
	})
	require.NoError(t, err)

	for _, id := range []guid.GUID{physical, twilight} {
		character, ok := all.Get(id)
		require.True(t, ok)
		require.False(t, character.IsActive())
		require.Equal(t, period.EndStateSlain, character.LastEndState())
	}
}

func TestHalionFactoryMatchesEveryDifficultyBody(t *testing.T) {
	t.Parallel()

	all := newRubySanctumTestCharacters()
	for _, entry := range halionEntries {
		character, _ := all.Add(creatureGUID(entry), time.Time{})
		require.IsType(t, &halionCharacter{}, character)
	}
}
