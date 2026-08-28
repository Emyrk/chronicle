package creatures

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
)

func newRazorscaleTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func TestRazorscaleAddsKeepActiveBossFromTimingOut(t *testing.T) {
	t.Parallel()

	all := newRazorscaleTestCharacters()
	player := guid.GUID(1)
	razorscaleID := creatureGUID(33186)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, razorscaleID, player))
	require.NoError(t, err)
	razorscale, ok := all.Get(razorscaleID)
	require.True(t, ok)
	require.True(t, razorscale.IsActive())

	for i, entry := range []uint32{33388, 33453, 33846} {
		at := start.Add(time.Duration(40+i*20) * time.Second)
		_, err = all.Process(testDamage(at, creatureGUID(entry), player))
		require.NoError(t, err)
	}

	// Razorscale has produced no direct activity for longer than the normal
	// timeout, but activity from each air-phase add refreshed the boss period.
	_, err = all.Process(messages.TimedOut(start.Add(120 * time.Second)))
	require.NoError(t, err)
	require.True(t, razorscale.IsActive())

	_, err = all.Process(messages.TimedOut(start.Add(141 * time.Second)))
	require.NoError(t, err)
	require.False(t, razorscale.IsActive())
}

func TestRazorscaleAddsDoNotStartInactiveBoss(t *testing.T) {
	t.Parallel()

	all := newRazorscaleTestCharacters()
	player := guid.GUID(1)
	razorscaleID := creatureGUID(33186)
	addID := creatureGUID(33388)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)
	_, _ = all.Add(razorscaleID, start)

	_, err := all.Process(testDamage(start, addID, player))
	require.NoError(t, err)

	razorscale, ok := all.Get(razorscaleID)
	require.True(t, ok)
	require.False(t, razorscale.IsActive())
}

func TestRazorscaleAddFactory(t *testing.T) {
	t.Parallel()

	all := newRazorscaleTestCharacters()
	for _, entry := range []uint32{33388, 33453, 33846} {
		character, ok := NewRazorscaleAdd(creatureGUID(entry), all)
		require.True(t, ok)
		require.IsType(t, &razorscaleAdd{}, character)
	}

	character, ok := NewRazorscaleAdd(creatureGUID(33186), all)
	require.False(t, ok)
	require.Nil(t, character)
}
