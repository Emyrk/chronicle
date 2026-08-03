package creatures_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/creatures"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
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

	// Whitemane's activity keeps Mograine alive even after the normal 60-second
	// timeout would have elapsed.
	_, err = chars.Process(damage(base.Add(70*time.Second), player, whitemane))
	require.NoError(t, err)
	_, err = chars.Process(damage(base.Add(140*time.Second), player, whitemane))
	require.NoError(t, err)
	require.True(t, mograineChar.IsActive(), "Whitemane activity should bridge the resurrection phase")

	// Whitemane becoming active is not enough to transition Mograine. The
	// explicit Scarlet Resurrection cast controls when normal death handling resumes.
	_, err = chars.Process(damage(base.Add(141*time.Second), player, mograine))
	require.NoError(t, err)
	_, err = chars.Process(slain(base.Add(142*time.Second), player, mograine))
	require.NoError(t, err)
	require.True(t, mograineChar.IsActive(), "activity alone should not infer resurrection")

	_, err = chars.Process(spellGo(base.Add(143*time.Second), whitemane, mograine, 9232))
	require.NoError(t, err)
	_, err = chars.Process(damage(base.Add(144*time.Second), player, mograine))
	require.NoError(t, err)
	_, err = chars.Process(slain(base.Add(145*time.Second), player, mograine))
	require.NoError(t, err)

	require.False(t, mograineChar.IsActive(), "post-resurrection death should end Mograine's activity")
	periods := mograineChar.Periods()
	require.Len(t, periods, 1)
	require.Equal(t, period.EndStateSlain, periods[0].EndState)
}

func TestVanillaPlusMograine_InfersResurrectionFromOffensiveActivity(t *testing.T) {
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
	_, err = chars.Process(damage(base.Add(70*time.Second), player, whitemane))
	require.NoError(t, err)

	// Some Vanilla+ logs omit Whitemane's Scarlet Resurrection cast. Mograine
	// dealing direct damage still proves that he returned for the final phase.
	_, err = chars.Process(damage(base.Add(71*time.Second), mograine, player))
	require.NoError(t, err)
	_, err = chars.Process(slain(base.Add(72*time.Second), player, whitemane))
	require.NoError(t, err)
	_, err = chars.Process(slain(base.Add(73*time.Second), player, mograine))
	require.NoError(t, err)

	mograineChar, ok := chars.Get(mograine)
	require.True(t, ok)
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

func spellGo(ts time.Time, caster, target guid.GUID, spellID chrondbc.SpellID) *messages.SpellGo {
	return &messages.SpellGo{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		Target:      &target,
		SpellData: &chrondbc.Spell{
			ID: spellID,
		},
	}
}
