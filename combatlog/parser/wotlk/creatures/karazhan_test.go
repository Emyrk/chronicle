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

func TestMountedAttumenKeepsEarlierFormsActiveAndKillsThem(t *testing.T) {
	t.Parallel()

	all := characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorTBC}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)

	player := guid.GUID(1)
	unmountedGUID := creatureGUID(attumenUnmountedEntry)
	midnightGUID := creatureGUID(midnightEntry)
	mountedGUID := creatureGUID(attumenMountedEntry)
	start := time.Date(2026, time.August, 27, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, unmountedGUID))
	require.NoError(t, err)
	_, err = all.Process(testDamage(start, player, midnightGUID))
	require.NoError(t, err)

	mountedActivity := start.Add(50 * time.Second)
	_, err = all.Process(testDamage(mountedActivity, player, mountedGUID))
	require.NoError(t, err)

	for _, id := range []guid.GUID{unmountedGUID, midnightGUID} {
		char, ok := all.Get(id)
		require.True(t, ok)
		require.True(t, char.IsActive())
		current, ok := char.CurrentPeriod()
		require.True(t, ok)
		require.Equal(t, mountedActivity, current.LastActive.Timestamp.Date())
	}

	death := &messages.Slain{
		MessageBase: messages.Base(start.Add(55 * time.Second)),
		Killer:      &player,
		Victim:      mountedGUID,
	}
	_, err = all.Process(death)
	require.NoError(t, err)

	for _, id := range []guid.GUID{unmountedGUID, midnightGUID, mountedGUID} {
		char, ok := all.Get(id)
		require.True(t, ok)
		require.False(t, char.IsActive())
		require.Equal(t, period.EndStateSlain, char.LastEndState())
	}
}
