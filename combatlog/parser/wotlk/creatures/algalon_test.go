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
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
)

func newAlgalonTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func processAlgalonAuraRemovals(t *testing.T, all *characters.Characters, target guid.GUID, at time.Time, count int) {
	t.Helper()
	for i := range count {
		_, err := all.Process(&messages.Aura{
			MessageBase: messages.Base(at),
			Target:      target,
			SpellName:   fmt.Sprintf("Removed debuff %d", i),
			State:       types.AuraStateRemoved,
		})
		require.NoError(t, err)
	}
}

func processAlgalonAuraCleanup(t *testing.T, all *characters.Characters, target guid.GUID, at time.Time) {
	t.Helper()
	processAlgalonAuraRemovals(t, all, target, at, algalonAuraCleanupThreshold)
}

func TestAlgalonAuraCleanupWithOneLivingPlayerMarksDefeat(t *testing.T) {
	t.Parallel()

	all := newAlgalonTestCharacters()
	player := guid.GUID(1)
	deadPlayer := guid.GUID(2)
	algalon := creatureGUID(algalonEntry)
	all.DB().Update(unitinfo.Info{Guid: algalon, MaxHealth: 2})
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

func TestAlgalonPositiveOverkillMarksDefeat(t *testing.T) {
	t.Parallel()

	all := newAlgalonTestCharacters()
	player := guid.GUID(1)
	algalon := creatureGUID(algalonEntry)
	at := time.Date(2026, time.August, 26, 16, 6, 30, 0, time.UTC)
	damage := testDamage(at, player, algalon)
	damage.Overkill = 1

	_, err := all.Process(damage)
	require.NoError(t, err)

	boss, ok := all.Get(algalon)
	require.True(t, ok)
	require.False(t, boss.IsActive())
	require.Equal(t, period.EndStateSlain, boss.LastEndState())
	require.Equal(t, at, boss.Periods()[0].End.Timestamp.Date())
}

func TestAlgalonEvadeMarksDefeat(t *testing.T) {
	t.Parallel()

	all := newAlgalonTestCharacters()
	player := guid.GUID(1)
	algalon := creatureGUID(algalonEntry)
	start := time.Date(2026, time.August, 26, 16, 6, 30, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, algalon))
	require.NoError(t, err)
	evade := testDamage(start.Add(time.Second), player, algalon)
	evade.Amount = 0
	evade.HitType = types.HitTypeEvade
	_, err = all.Process(evade)
	require.NoError(t, err)
	_, err = all.Process(messages.TimedOut(evade.Date().Add(characters.ScriptedDefeatEvadeConfirmationWindow)))
	require.NoError(t, err)

	boss, ok := all.Get(algalon)
	require.True(t, ok)
	require.False(t, boss.IsActive())
	require.Equal(t, period.EndStateSlain, boss.LastEndState())
}

func TestAlgalonAuraCleanupBelowThresholdRemainsActive(t *testing.T) {
	t.Parallel()

	all := newAlgalonTestCharacters()
	player := guid.GUID(1)
	algalon := creatureGUID(algalonEntry)
	all.DB().Update(unitinfo.Info{Guid: algalon, MaxHealth: 1})
	start := time.Date(2026, time.August, 26, 16, 6, 30, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, algalon))
	require.NoError(t, err)
	processAlgalonAuraRemovals(t, all, algalon, start.Add(22*time.Millisecond), algalonAuraCleanupThreshold-1)

	boss, ok := all.Get(algalon)
	require.True(t, ok)
	require.True(t, boss.IsActive())
	require.NotEqual(t, period.EndStateSlain, boss.LastEndState())
}

func TestAlgalonActivityKeepsAddsActiveUntilDefeat(t *testing.T) {
	t.Parallel()

	all := newAlgalonTestCharacters()
	players := []guid.GUID{1, 2, 3}
	algalon := creatureGUID(algalonEntry)
	star := creatureGUID(32955)
	start := time.Date(2026, time.June, 13, 14, 24, 53, 0, time.UTC)

	_, err := all.Process(testDamage(start, players[0], star))
	require.NoError(t, err)
	for offset, player := range players {
		_, err = all.Process(testDamage(start.Add(50*time.Second+time.Duration(offset)*time.Millisecond), player, algalon))
		require.NoError(t, err)
	}
	_, err = all.Process(messages.TimedOut(start.Add(61 * time.Second)))
	require.NoError(t, err)

	add, ok := all.Get(star)
	require.True(t, ok)
	require.True(t, add.IsActive(), "boss activity must prevent the add from timing out")

	lastDamage := start.Add(62 * time.Second)
	_, err = all.Process(testDamage(lastDamage, players[0], algalon))
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

func TestAlgalonAuraCleanupBeforeSurrenderHealthRemainsWipe(t *testing.T) {
	t.Parallel()

	all := newAlgalonTestCharacters()
	algalon := creatureGUID(algalonEntry)
	all.DB().Update(unitinfo.Info{Guid: algalon, MaxHealth: 1000})
	start := time.Date(2026, time.August, 26, 15, 36, 53, 0, time.UTC)

	for offset, player := range []guid.GUID{1, 2, 3} {
		_, err := all.Process(testDamage(start.Add(time.Duration(offset)*time.Millisecond), player, algalon))
		require.NoError(t, err)
	}
	processAlgalonAuraCleanup(t, all, algalon, start.Add(15*time.Millisecond))

	boss, ok := all.Get(algalon)
	require.True(t, ok)
	require.True(t, boss.IsActive())
	require.NotEqual(t, period.EndStateSlain, boss.LastEndState())
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

	lastDamage := start.Add(time.Second)
	_, err := all.Process(testDamage(lastDamage, players[0], algalon))
	require.NoError(t, err)
	for offset, player := range players {
		_, err := all.Process(&messages.Slain{
			MessageBase: messages.Base(lastDamage.Add(time.Duration(offset+1) * time.Millisecond)),
			Victim:      player,
		})
		require.NoError(t, err)
	}
	processAlgalonAuraCleanup(t, all, algalon, lastDamage.Add(15*time.Millisecond))

	boss, ok := all.Get(algalon)
	require.True(t, ok)
	require.True(t, boss.IsActive())
	require.NotEqual(t, period.EndStateSlain, boss.LastEndState())
}
