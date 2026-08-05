package registry

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestWrathRegistryReplacesClassicOnyxia(t *testing.T) {
	t.Parallel()

	tbc := RegistryForFlavor(nil, database.WoWFlavor{database.FlavorTBC}).EntryByName("Onyxia's Lair")
	require.NotNil(t, tbc)
	require.NotNil(t, tbc.SpeedrunRules)
	require.Equal(t, []uint32{10184, 45133}, tbc.SpeedrunRules.Requirements[0].EntryIDs)

	wrath := RegistryForFlavor(nil, database.WoWFlavor{database.FlavorWrath}).EntryByName("Onyxia's Lair")
	require.NotNil(t, wrath)
	require.NotNil(t, wrath.SpeedrunRules)
	require.Nil(t, wrath.SpeedrunRules.LevelRange)
	require.Equal(t, []uint32{10184}, wrath.SpeedrunRules.Requirements[0].EntryIDs)
}

func TestProgressionOnyxiaHasSeparateSpeedrunRules(t *testing.T) {
	t.Parallel()

	flavor := database.WoWFlavor{
		database.FlavorWrath,
		database.FlavorAzerothcore,
		database.FlavorAzerothcoreProgression,
	}
	rules := RegistryForFlavor(nil, flavor).SpeedrunRules()

	classic := rules["Onyxia Classic"]
	require.NotNil(t, classic)
	require.Equal(t, []uint32{301000}, classic.Requirements[0].EntryIDs)
	require.Equal(t, []uint32{301002}, classic.Requirements[1].EntryIDs)
	require.NotNil(t, classic.LevelRange)
	require.Equal(t, int32(60), classic.LevelRange.MaxLevel)

	wrath := rules["Onyxia's Lair"]
	require.NotNil(t, wrath)
	require.Equal(t, []uint32{10184}, wrath.Requirements[0].EntryIDs)
	require.Nil(t, wrath.LevelRange)
}

func TestFlavoredDeadminesHostiles(t *testing.T) {
	t.Parallel()

	vanilla := RegistryForFlavor(nil, database.WoWFlavor{database.FlavorVanilla}).EntryByName("Deadmines")
	require.NotNil(t, vanilla)
	for _, entry := range []uint32{61962, 912408, 61963} {
		require.NotContains(t, vanilla.HostileEntries, entry)
	}

	lunatic := RegistryForFlavor(nil, database.WoWFlavor{
		database.FlavorVanilla,
		database.FlavorLunatic,
	}).EntryByName("Deadmines")
	require.NotNil(t, lunatic)
	for _, entry := range []uint32{61962, 912408, 61963} {
		require.NotContains(t, lunatic.HostileEntries, entry)
	}

	nightmare := RegistryForFlavor(nil, database.WoWFlavor{
		database.FlavorVanilla,
		database.FlavorNightmareOfUrsol,
	}).EntryByName("Deadmines")
	require.NotNil(t, nightmare)
	manufacturedGolem := nightmare.HostileEntries[61962]
	require.Equal(t, "Manufactured Golem", manufacturedGolem.Name)
	require.False(t, manufacturedGolem.Boss)
	burningBladeFlamekin := nightmare.HostileEntries[912408]
	require.Equal(t, "Burning Blade Flamekin", burningBladeFlamekin.Name)
	require.False(t, burningBladeFlamekin.Boss)
	masterpieceHarvester := nightmare.HostileEntries[61963]
	require.Equal(t, "Masterpiece Harvester", masterpieceHarvester.Name)
	require.True(t, masterpieceHarvester.Boss)
	require.Equal(t, "Masterpiece Harvester", masterpieceHarvester.EncounterName)
}

func TestInstanceDetailsBossCount(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name      string
		flavor    database.WoWFlavor
		instance  string
		bossCount *int
	}{
		{name: "vanilla onyxia", flavor: database.WoWFlavor{database.FlavorVanilla}, instance: "Onyxia's Lair", bossCount: intPtr(1)},
		{name: "turtle onyxia", flavor: database.WoWFlavor{database.FlavorTurtle}, instance: "Onyxia's Lair", bossCount: intPtr(1)},
		{name: "nightmare of ursol onyxia", flavor: database.WoWFlavor{database.FlavorNightmareOfUrsol}, instance: "Onyxia's Lair", bossCount: intPtr(2)},
		{name: "epoch onyxia", flavor: database.WoWFlavor{database.FlavorEpoch}, instance: "Onyxia's Lair", bossCount: intPtr(3)},
		{name: "naxxramas groups multi-unit encounters", flavor: database.WoWFlavor{database.FlavorVanilla}, instance: "Naxxramas", bossCount: intPtr(15)},
		{name: "gruul groups council members", flavor: database.WoWFlavor{database.FlavorTBC}, instance: "Gruul's Lair", bossCount: intPtr(2)},
		{name: "instance without speedrun rules", flavor: database.WoWFlavor{database.FlavorVanilla}, instance: "Shadowfang Keep"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			reg := RegistryForFlavor(nil, tc.flavor)
			for _, detail := range reg.AllInstanceDetails() {
				if detail.Name == tc.instance {
					require.Equal(t, tc.bossCount, detail.BossCount)
					return
				}
			}
			t.Fatalf("instance %q not found", tc.instance)
		})
	}
}

func intPtr(value int) *int {
	return &value
}
