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

const (
	razorgoreEntry        = 12435
	blackwingLegionnaire  = 12416
	blackwingMage         = 12420
	deathTalonDragonspawn = 12422
	destroyEggSpellID     = 19873
	razorgoreEggThreshold = 30
)

func eggCast(ts time.Time, caster guid.GUID, spellID int32) *messages.SpellGo {
	return &messages.SpellGo{
		MessageBase: messages.Base(ts),
		Caster:      caster,
		SpellData:   &chrondbc.Spell{ID: chrondbc.SpellID(spellID)},
	}
}

// TestRazorgoreEggs_VanillaPlus_KillsAddsAt30 verifies that on the VanillaPlus
// flavor, casting "Destroy Egg" (spell 19873) 30 times marks the phase-1 adds
// (Blackwing Legionnaire, Blackwing Mage, Death Talon Dragonspawn) as killed.
func TestRazorgoreEggs_VanillaPlus_KillsAddsAt30(t *testing.T) {
	t.Parallel()

	flavor := database.WoWFlavor{database.FlavorVanilla, database.FlavorVanillaPlus}
	chars := characters.NewCharacters(unitdb.New(),
		creatures.VanillaCharacterFactories(flavor),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}))

	player := guid.GUID(0x1)
	razor := creatureGUID(razorgoreEntry, 0x1)
	legionnaire := creatureGUID(blackwingLegionnaire, 0x2)
	mage := creatureGUID(blackwingMage, 0x3)
	dragonspawn := creatureGUID(deathTalonDragonspawn, 0x4)

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

	// Activate the adds so we can observe them being killed.
	for i, add := range []guid.GUID{legionnaire, mage, dragonspawn} {
		_, err := chars.Process(damage(base.Add(time.Duration(i)*time.Second), player, add))
		require.NoError(t, err)
	}

	// Cast "Destroy Egg" 30 times.
	for i := 0; i < razorgoreEggThreshold; i++ {
		ts := base.Add(time.Duration(10+i) * time.Second)
		_, err := chars.Process(eggCast(ts, razor, destroyEggSpellID))
		require.NoError(t, err)
	}

	razorChar, ok := chars.Get(razor)
	require.True(t, ok)
	require.True(t, razorChar.IsActive(), "razorgore should remain active after destroying eggs")

	for name, id := range map[string]guid.GUID{
		"Blackwing Legionnaire":   legionnaire,
		"Blackwing Mage":          mage,
		"Death Talon Dragonspawn": dragonspawn,
	} {
		add, ok := chars.Get(id)
		require.True(t, ok, "%s should exist", name)
		require.False(t, add.IsActive(), "%s should be killed after 30 eggs", name)
		periods := add.Periods()
		require.Len(t, periods, 1, "%s should have one activity period", name)
		require.Equal(t, period.EndStateSlain, periods[0].EndState, "%s should be slain", name)
		require.Equal(t, "razorgore_eggs_destroyed", periods[0].End.Reason, "%s end reason", name)
	}
}

// TestRazorgoreEggs_NightmareOfUrsol_KillsAddsAt20 verifies that Nightmare of
// Ursol's shorter phase 1 marks the adds as killed after 20 destroyed eggs.
func TestRazorgoreEggs_NightmareOfUrsol_KillsAddsAt20(t *testing.T) {
	t.Parallel()

	flavor := database.WoWFlavor{database.FlavorVanilla, database.FlavorNightmareOfUrsol}
	chars := characters.NewCharacters(unitdb.New(),
		creatures.VanillaCharacterFactories(flavor),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}))

	player := guid.GUID(0x1)
	razor := creatureGUID(razorgoreEntry, 0x1)
	legionnaire := creatureGUID(blackwingLegionnaire, 0x2)
	mage := creatureGUID(blackwingMage, 0x3)
	dragonspawn := creatureGUID(deathTalonDragonspawn, 0x4)

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

	for i, add := range []guid.GUID{legionnaire, mage, dragonspawn} {
		_, err := chars.Process(damage(base.Add(time.Duration(i)*time.Second), player, add))
		require.NoError(t, err)
	}

	for i := 0; i < 19; i++ {
		ts := base.Add(time.Duration(10+i) * time.Second)
		_, err := chars.Process(eggCast(ts, razor, destroyEggSpellID))
		require.NoError(t, err)
	}

	for _, id := range []guid.GUID{legionnaire, mage, dragonspawn} {
		add, ok := chars.Get(id)
		require.True(t, ok)
		require.True(t, add.IsActive(), "add should remain active after 19 eggs")
	}

	_, err := chars.Process(eggCast(base.Add(29*time.Second), razor, destroyEggSpellID))
	require.NoError(t, err)

	for name, id := range map[string]guid.GUID{
		"Blackwing Legionnaire":   legionnaire,
		"Blackwing Mage":          mage,
		"Death Talon Dragonspawn": dragonspawn,
	} {
		add, ok := chars.Get(id)
		require.True(t, ok, "%s should exist", name)
		require.False(t, add.IsActive(), "%s should be killed after 20 eggs", name)
		periods := add.Periods()
		require.Len(t, periods, 1, "%s should have one activity period", name)
		require.Equal(t, period.EndStateSlain, periods[0].EndState, "%s should be slain", name)
		require.Equal(t, "razorgore_eggs_destroyed", periods[0].End.Reason, "%s end reason", name)
	}
}

func TestRazorgorePhaseOneAddActivityKeepsBossActive(t *testing.T) {
	t.Parallel()

	flavor := database.WoWFlavor{database.FlavorVanilla, database.FlavorVanillaPlus}
	chars := characters.NewCharacters(unitdb.New(),
		creatures.VanillaCharacterFactories(flavor),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}))

	player := guid.GUID(0x1)
	razor := creatureGUID(razorgoreEntry, 0x1)
	legionnaire := creatureGUID(blackwingLegionnaire, 0x2)
	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

	_, err := chars.Process(eggCast(base, razor, destroyEggSpellID))
	require.NoError(t, err)

	// Razorgore can disappear from the log for more than the default one-minute
	// inactivity timeout while the raid is still fighting his phase-one adds.
	_, err = chars.Process(damage(base.Add(55*time.Second), player, legionnaire))
	require.NoError(t, err)

	add, ok := chars.Get(legionnaire)
	require.True(t, ok)
	require.IsType(t, &creatures.RazorAdCharacter{}, add)

	_, err = chars.Process(damage(base.Add(70*time.Second), player, razor))
	require.NoError(t, err)
	_, err = chars.Process(slain(base.Add(80*time.Second), player, razor))
	require.NoError(t, err)
	_, err = chars.Process(damage(base.Add(85*time.Second), player, legionnaire))
	require.NoError(t, err)

	razorChar, ok := chars.Get(razor)
	require.True(t, ok)
	require.False(t, razorChar.IsActive(), "add activity must not restart an inactive Razorgore")
	require.Len(t, razorChar.Periods(), 1, "phase-one add activity must not split the Razorgore encounter")
	require.Equal(t, period.EndStateSlain, razorChar.Periods()[0].EndState)
}

// TestRazorgoreEggs_UnsupportedFlavor_NoKill verifies that without an egg
// threshold the mechanic does not fire and the adds remain active while the boss
// is active.
func TestRazorgoreEggs_UnsupportedFlavor_NoKill(t *testing.T) {
	t.Parallel()

	flavor := database.WoWFlavor{database.FlavorVanilla}
	chars := characters.NewCharacters(unitdb.New(),
		creatures.VanillaCharacterFactories(flavor),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}))

	player := guid.GUID(0x1)
	razor := creatureGUID(razorgoreEntry, 0x1)
	legionnaire := creatureGUID(blackwingLegionnaire, 0x2)
	mage := creatureGUID(blackwingMage, 0x3)
	dragonspawn := creatureGUID(deathTalonDragonspawn, 0x4)

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

	for i, add := range []guid.GUID{legionnaire, mage, dragonspawn} {
		_, err := chars.Process(damage(base.Add(time.Duration(i)*time.Second), player, add))
		require.NoError(t, err)
	}

	for i := 0; i < razorgoreEggThreshold; i++ {
		ts := base.Add(time.Duration(10+i) * time.Second)
		_, err := chars.Process(eggCast(ts, razor, destroyEggSpellID))
		require.NoError(t, err)
	}

	for name, id := range map[string]guid.GUID{
		"Blackwing Legionnaire":   legionnaire,
		"Blackwing Mage":          mage,
		"Death Talon Dragonspawn": dragonspawn,
	} {
		add, ok := chars.Get(id)
		require.True(t, ok, "%s should exist", name)
		require.True(t, add.IsActive(), "%s should stay active without the V+ egg mechanic", name)
	}
}

// TestRazorgoreEggs_CountResetsOnBossReset verifies the egg count resets when
// the boss resets. A partial count (below threshold) before a reset must not
// carry over: freshly-spawned adds should survive a sub-threshold second batch.
func TestRazorgoreEggs_CountResetsOnBossReset(t *testing.T) {
	t.Parallel()

	flavor := database.WoWFlavor{database.FlavorVanilla, database.FlavorVanillaPlus}
	chars := characters.NewCharacters(unitdb.New(),
		creatures.VanillaCharacterFactories(flavor),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}))

	player := guid.GUID(0x1)
	razor := creatureGUID(razorgoreEntry, 0x1)

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

	// First pull: 20 egg casts (below the 30 threshold), then the boss resets.
	for i := 0; i < 20; i++ {
		ts := base.Add(time.Duration(i) * time.Second)
		_, err := chars.Process(eggCast(ts, razor, destroyEggSpellID))
		require.NoError(t, err)
	}

	razorChar, ok := chars.Get(razor)
	require.True(t, ok)
	require.True(t, razorChar.IsActive())

	// Boss reset: the boss is slain / evades, ending its activity period.
	resetAt := base.Add(30 * time.Second)
	_, err := chars.Process(slain(resetAt, player, razor))
	require.NoError(t, err)
	require.False(t, razorChar.IsActive(), "razorgore should be inactive after reset")

	// Second pull: spawn fresh adds and cast 20 more eggs. If the count had not
	// reset (20 + 20 = 40 >= 30) these adds would be killed.
	second := resetAt.Add(1 * time.Minute)
	legionnaire := creatureGUID(blackwingLegionnaire, 0x12)
	mage := creatureGUID(blackwingMage, 0x13)
	dragonspawn := creatureGUID(deathTalonDragonspawn, 0x14)
	for i, add := range []guid.GUID{legionnaire, mage, dragonspawn} {
		_, err := chars.Process(damage(second.Add(time.Duration(i)*time.Second), player, add))
		require.NoError(t, err)
	}

	for i := 0; i < 20; i++ {
		ts := second.Add(time.Duration(10+i) * time.Second)
		_, err := chars.Process(eggCast(ts, razor, destroyEggSpellID))
		require.NoError(t, err)
	}

	for name, id := range map[string]guid.GUID{
		"Blackwing Legionnaire":   legionnaire,
		"Blackwing Mage":          mage,
		"Death Talon Dragonspawn": dragonspawn,
	} {
		add, ok := chars.Get(id)
		require.True(t, ok, "%s should exist", name)
		require.True(t, add.IsActive(),
			"%s should survive: egg count must reset on boss reset", name)
	}
}
