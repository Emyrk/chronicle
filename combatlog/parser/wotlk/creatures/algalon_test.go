package creatures

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
)

func newAlgalonTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func processAlgalonAuraCleanup(t *testing.T, all *characters.Characters, target guid.GUID, at time.Time) {
	t.Helper()
	for i := range algalonAuraCleanupThreshold {
		_, err := all.Process(&messages.Aura{
			MessageBase: messages.Base(at),
			Target:      target,
			SpellName:   fmt.Sprintf("Removed debuff %d", i),
			State:       types.AuraStateRemoved,
		})
		require.NoError(t, err)
	}
}

func TestAlgalonAuraCleanupWithLivingPlayersMarksDefeat(t *testing.T) {
	t.Parallel()

	all := newAlgalonTestCharacters()
	player := guid.GUID(1)
	deadPlayer := guid.GUID(2)
	algalon := creatureGUID(algalonEntry)
	star := creatureGUID(32955)
	start := time.Date(2026, time.August, 26, 16, 6, 30, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, algalon))
	require.NoError(t, err)
	_, err = all.Process(testDamage(start.Add(time.Second), deadPlayer, star))
	require.NoError(t, err)
	_, err = all.Process(&messages.Slain{
		MessageBase: messages.Base(start.Add(2 * time.Second)),
		Victim:      deadPlayer,
	})
	require.NoError(t, err)

	lastDamage := start.Add(3 * time.Second)
	_, err = all.Process(testDamage(lastDamage, player, algalon))
	require.NoError(t, err)
	cleanupAt := lastDamage.Add(22 * time.Millisecond)
	processAlgalonAuraCleanup(t, all, algalon, cleanupAt)

	boss, ok := all.Get(algalon)
	require.True(t, ok)
	require.False(t, boss.IsActive())
	require.Equal(t, period.EndStateSlain, boss.LastEndState())
	require.Equal(t, cleanupAt, boss.Periods()[0].End.Timestamp.Date())

	add, ok := all.Get(star)
	require.True(t, ok)
	require.False(t, add.IsActive())
	require.Equal(t, period.EndStateReset, add.LastEndState())
}

func TestAlgalonActivityKeepsAddsActiveUntilDefeat(t *testing.T) {
	t.Parallel()

	all := newAlgalonTestCharacters()
	player := guid.GUID(1)
	algalon := creatureGUID(algalonEntry)
	star := creatureGUID(32955)
	start := time.Date(2026, time.June, 13, 14, 24, 53, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, star))
	require.NoError(t, err)
	_, err = all.Process(testDamage(start.Add(50*time.Second), player, algalon))
	require.NoError(t, err)
	_, err = all.Process(messages.TimedOut(start.Add(61 * time.Second)))
	require.NoError(t, err)

	add, ok := all.Get(star)
	require.True(t, ok)
	require.True(t, add.IsActive(), "boss activity must prevent the add from timing out")

	lastDamage := start.Add(62 * time.Second)
	_, err = all.Process(testDamage(lastDamage, player, algalon))
	require.NoError(t, err)

	cleanupAt := lastDamage.Add(22 * time.Millisecond)
	processAlgalonAuraCleanup(t, all, algalon, cleanupAt)

	boss, ok := all.Get(algalon)
	require.True(t, ok)
	require.Equal(t, period.EndStateSlain, boss.LastEndState())
	require.False(t, add.IsActive())
	require.Equal(t, period.EndStateReset, add.LastEndState())
	require.Len(t, add.Periods(), 1)
}

func TestAlgalonAuraCleanupAfterRaidDeathRemainsWipe(t *testing.T) {
	t.Parallel()

	all := newAlgalonTestCharacters()
	players := []guid.GUID{1, 2}
	algalon := creatureGUID(algalonEntry)
	start := time.Date(2026, time.August, 26, 15, 33, 52, 0, time.UTC)

	for offset, player := range players {
		_, err := all.Process(testDamage(start.Add(time.Duration(offset)*time.Millisecond), player, algalon))
		require.NoError(t, err)
	}
	for offset, player := range players {
		_, err := all.Process(&messages.Slain{
			MessageBase: messages.Base(start.Add(time.Second + time.Duration(offset)*time.Millisecond)),
			Victim:      player,
		})
		require.NoError(t, err)
	}

	lastDamage := start.Add(2 * time.Second)
	_, err := all.Process(testDamage(lastDamage, players[0], algalon))
	require.NoError(t, err)
	processAlgalonAuraCleanup(t, all, algalon, lastDamage.Add(15*time.Millisecond))

	boss, ok := all.Get(algalon)
	require.True(t, ok)
	require.True(t, boss.IsActive())
	require.NotEqual(t, period.EndStateSlain, boss.LastEndState())
}
