package creatures_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestVanillaPlusMograine_IgnoresPhaseOneDeath(t *testing.T) {
	t.Parallel()

	flavor := database.WoWFlavor{database.FlavorVanilla, database.FlavorVanillaPlus}
	chars := characters.NewCharacters(
		unitdb.New(),
		creatures.VanillaCharacterFactories(flavor),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)

	player := guid.GUID(0x1)
	mograine := creatureGUID(25227, 0x1)
	whitemane := creatureGUID(25228, 0x2)
	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

	_, err := chars.Process(damage(base, player, mograine))
	require.NoError(t, err)
	_, err = chars.Process(slain(base.Add(time.Second), player, mograine))
	require.NoError(t, err)

	mograineChar, ok := chars.Get(mograine)
	require.True(t, ok)
	require.True(t, mograineChar.IsActive(), "phase-one death should not end Mograine's activity")
	require.Equal(t, period.EndStateNone, mograineChar.LastEndState())

	_, err = chars.Process(damage(base.Add(2*time.Second), player, whitemane))
	require.NoError(t, err)
	_, err = chars.Process(damage(base.Add(5*time.Second), player, mograine))
	require.NoError(t, err)
	_, err = chars.Process(slain(base.Add(6*time.Second), player, mograine))
	require.NoError(t, err)

	require.False(t, mograineChar.IsActive(), "post-resurrection death should end Mograine's activity")
	periods := mograineChar.Periods()
	require.Len(t, periods, 1)
	require.Equal(t, period.EndStateSlain, periods[0].EndState)
}

func TestVanillaPlusMograine_ResetsAfterWipe(t *testing.T) {
	t.Parallel()

	flavor := database.WoWFlavor{database.FlavorVanilla, database.FlavorVanillaPlus}
	chars := characters.NewCharacters(
		unitdb.New(),
		creatures.VanillaCharacterFactories(flavor),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)

	player := guid.GUID(0x1)
	mograine := creatureGUID(25227, 0x1)
	unrelated := creatureGUID(25201, 0x2)
	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

	_, err := chars.Process(damage(base, player, mograine))
	require.NoError(t, err)
	_, err = chars.Process(slain(base.Add(time.Second), player, mograine))
	require.NoError(t, err)
	_, err = chars.Process(damage(base.Add(62*time.Second), player, unrelated))
	require.NoError(t, err)

	mograineChar, ok := chars.Get(mograine)
	require.True(t, ok)
	require.False(t, mograineChar.IsActive(), "Mograine should time out after a phase-two wipe")

	_, err = chars.Process(damage(base.Add(63*time.Second), player, mograine))
	require.NoError(t, err)
	_, err = chars.Process(slain(base.Add(64*time.Second), player, mograine))
	require.NoError(t, err)

	require.True(t, mograineChar.IsActive(), "the first death of a new pull should be ignored again")
}

func TestVanillaMograine_UsesDefaultDeathHandling(t *testing.T) {
	t.Parallel()

	flavor := database.WoWFlavor{database.FlavorVanilla}
	chars := characters.NewCharacters(
		unitdb.New(),
		creatures.VanillaCharacterFactories(flavor),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)

	player := guid.GUID(0x1)
	mograine := creatureGUID(25227, 0x1)
	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

	_, err := chars.Process(damage(base, player, mograine))
	require.NoError(t, err)
	_, err = chars.Process(slain(base.Add(time.Second), player, mograine))
	require.NoError(t, err)

	mograineChar, ok := chars.Get(mograine)
	require.True(t, ok)
	require.False(t, mograineChar.IsActive(), "non-Vanilla+ flavors should not use the resurrection handler")
	require.Equal(t, period.EndStateSlain, mograineChar.LastEndState())
}
