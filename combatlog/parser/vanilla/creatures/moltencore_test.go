package creatures_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"
)

const (
	ragnarosEntry = 11502
	sonOfFlame    = 12143
)

// TestSonOfFlame_BumpsRagnarosDuringSubmerge verifies that damage dealt to
// a Son of Flame refreshes the active Ragnaros's inactivity timeout,
// keeping him alive during his submerge phase.
func TestSonOfFlame_BumpsRagnarosDuringSubmerge(t *testing.T) {
	t.Parallel()

	chars := characters.NewCharacters(unitdb.New(), creatures.TurtleCharacterFactories(), identifier.NewIdentifier(map[uint32]identifier.Identity{}))

	player := guid.GUID(0x1)
	ragnaros := creatureGUID(ragnarosEntry, 0x1)
	son := creatureGUID(sonOfFlame, 0x2)

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

	// Engage Ragnaros with direct damage to start his activity period.
	_, err := chars.Process(damage(base, player, ragnaros))
	require.NoError(t, err)

	ragChar, ok := chars.Get(ragnaros)
	require.True(t, ok)
	require.True(t, ragChar.IsActive(), "Ragnaros should be active after direct damage")

	// Advance time to 50s — close to the 60s inactivity timeout.
	// Hit the Son of Flame instead of Ragnaros (submerge phase).
	sonHitTime := base.Add(50 * time.Second)
	_, err = chars.Process(damage(sonHitTime, player, son))
	require.NoError(t, err)

	// Ragnaros should still be active because the Son bump propagated.
	require.True(t, ragChar.IsActive(), "Ragnaros should still be active after Son was hit")

	// Advance past the original 60s timeout (but within 60s of the Son hit).
	// Process a tick to trigger timeout evaluation.
	tickTime := base.Add(65 * time.Second)
	_, err = chars.Process(damage(tickTime, player, son))
	require.NoError(t, err)

	require.True(t, ragChar.IsActive(), "Ragnaros should remain active — Son bump extended his timeout")
	require.Len(t, ragChar.Periods(), 1, "Ragnaros should have exactly one period (still active)")
}

// TestSonOfFlame_RepeatedBumpsKeepRagnarosAlive verifies that each Son bump
// refreshes Ragnaros, not only the initial activation.
func TestSonOfFlame_RepeatedBumpsKeepRagnarosAlive(t *testing.T) {
	t.Parallel()

	chars := characters.NewCharacters(unitdb.New(), creatures.TurtleCharacterFactories(), identifier.NewIdentifier(map[uint32]identifier.Identity{}))

	player := guid.GUID(0x1)
	ragnaros := creatureGUID(ragnarosEntry, 0x1)
	son := creatureGUID(sonOfFlame, 0x2)

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

	// Engage Ragnaros.
	_, err := chars.Process(damage(base, player, ragnaros))
	require.NoError(t, err)

	ragChar, ok := chars.Get(ragnaros)
	require.True(t, ok)

	// Simulate a long submerge: hit a Son every 55s.
	// Without propagation Ragnaros would time out after 60s.
	for i := 1; i <= 4; i++ {
		hitTime := base.Add(time.Duration(i) * 55 * time.Second)
		_, err = chars.Process(damage(hitTime, player, son))
		require.NoError(t, err)
		require.True(t, ragChar.IsActive(), "Ragnaros should remain active after Son bump #%d", i)
	}

	// Total elapsed: 220s — well past the initial 60s timeout.
	require.Len(t, ragChar.Periods(), 1, "Ragnaros should have exactly one period (still active)")
}

// TestSonOfFlame_DoesNotStartOrResurrectRagnaros verifies that Son activity
// does not create or restart a Ragnaros period when Ragnaros is absent,
// inactive (timed out), or slain.
func TestSonOfFlame_DoesNotStartOrResurrectRagnaros(t *testing.T) {
	t.Parallel()

	t.Run("ragnaros_absent", func(t *testing.T) {
		t.Parallel()
		chars := characters.NewCharacters(unitdb.New(), creatures.TurtleCharacterFactories(), identifier.NewIdentifier(map[uint32]identifier.Identity{}))

		player := guid.GUID(0x1)
		son := creatureGUID(sonOfFlame, 0x2)

		base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

		// Hit Son without Ragnaros ever appearing — no panic.
		_, err := chars.Process(damage(base, player, son))
		require.NoError(t, err)

		sonChar, ok := chars.Get(son)
		require.True(t, ok)
		require.True(t, sonChar.IsActive(), "Son should be active independently")
	})

	t.Run("ragnaros_timed_out", func(t *testing.T) {
		t.Parallel()
		chars := characters.NewCharacters(unitdb.New(), creatures.TurtleCharacterFactories(), identifier.NewIdentifier(map[uint32]identifier.Identity{}))

		player := guid.GUID(0x1)
		ragnaros := creatureGUID(ragnarosEntry, 0x1)
		son := creatureGUID(sonOfFlame, 0x2)
		dummy := creatureGUID(99999, 0x3)

		base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

		// Engage and let Ragnaros time out.
		_, err := chars.Process(damage(base, player, ragnaros))
		require.NoError(t, err)

		ragChar, ok := chars.Get(ragnaros)
		require.True(t, ok)

		// Process a message 61s later to trigger the timeout.
		_, err = chars.Process(damage(base.Add(61*time.Second), player, dummy))
		require.NoError(t, err)
		require.False(t, ragChar.IsActive(), "Ragnaros should have timed out")

		ragPeriodsBefore := ragChar.Periods()

		// Now hit a Son — should NOT restart Ragnaros.
		_, err = chars.Process(damage(base.Add(70*time.Second), player, son))
		require.NoError(t, err)
		require.False(t, ragChar.IsActive(), "Ragnaros should remain inactive after Son bump")
		require.Equal(t, len(ragPeriodsBefore), len(ragChar.Periods()), "no new Ragnaros period should be created")
	})

	t.Run("ragnaros_slain", func(t *testing.T) {
		t.Parallel()
		chars := characters.NewCharacters(unitdb.New(), creatures.TurtleCharacterFactories(), identifier.NewIdentifier(map[uint32]identifier.Identity{}))

		player := guid.GUID(0x1)
		ragnaros := creatureGUID(ragnarosEntry, 0x1)
		son := creatureGUID(sonOfFlame, 0x2)

		base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

		// Engage and kill Ragnaros.
		_, err := chars.Process(damage(base, player, ragnaros))
		require.NoError(t, err)
		_, err = chars.Process(slain(base.Add(5*time.Second), player, ragnaros))
		require.NoError(t, err)

		ragChar, ok := chars.Get(ragnaros)
		require.True(t, ok)

		// Wait past the 15s recently-slain window.
		_, err = chars.Process(damage(base.Add(20*time.Second), player, son))
		require.NoError(t, err)
		require.False(t, ragChar.IsActive(), "Ragnaros should remain dead after Son bump")
	})
}

// TestSonOfFlame_FactoryMatchesCorrectEntry verifies that the
// SonOfTheFlame factory only matches creature entry 12143 and that
// the Ragnaros factory still works for entry 11502.
func TestSonOfFlame_FactoryMatchesCorrectEntry(t *testing.T) {
	t.Parallel()

	chars := characters.NewCharacters(unitdb.New(), creatures.TurtleCharacterFactories(), identifier.NewIdentifier(map[uint32]identifier.Identity{}))

	// Son of Flame should match.
	sonID := creatureGUID(sonOfFlame, 0x1)
	created, ok := creatures.NewSonOfTheFlameCharacter(sonID, chars)
	require.True(t, ok)
	require.NotNil(t, created)

	// Ragnaros should not match the Son factory.
	ragID := creatureGUID(ragnarosEntry, 0x2)
	created, ok = creatures.NewSonOfTheFlameCharacter(ragID, chars)
	require.False(t, ok)
	require.Nil(t, created)

	// Ragnaros should still match its own factory with the 15s recently-slain.
	ragChar, ok := creatures.NewRagnarosCharacter(ragID, chars)
	require.True(t, ok)
	require.NotNil(t, ragChar)

	// Non-creature GUID should not match.
	created, ok = creatures.NewSonOfTheFlameCharacter(guid.GUID(0x1), chars)
	require.False(t, ok)
	require.Nil(t, created)
}
