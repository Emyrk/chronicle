package instances

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestShadowfangKeepHostiles_Flavors(t *testing.T) {
	t.Parallel()

	vanilla := ShadowfangKeepHostiles(database.WoWFlavor{database.FlavorVanilla}).HostileEntries()
	for entry, name := range map[uint32]string{
		3851:  "Shadowfang Whitescalp",
		3853:  "Shadowfang Moonwalker",
		3854:  "Shadowfang Wolfguard",
		3855:  "Shadowfang Darksoul",
		3857:  "Shadowfang Glutton",
		3861:  "Bleak Worg",
		3862:  "Slavering Worg",
		3864:  "Fel Steed",
		3865:  "Shadow Charger",
		3866:  "Vile Bat",
		3868:  "Blood Seeker",
		3875:  "Haunted Servitor",
		3877:  "Wailing Guardsman",
		4958:  "Haunting Spirit",
		14682: "Sever",
	} {
		require.Equal(t, name, vanilla[entry].Name)
		require.False(t, vanilla[entry].Boss)
		require.True(t, vanilla[entry].CanBattle())
	}
	for entry, name := range map[uint32]string{
		2110:  "Black Rat",
		3850:  "Sorcerer Ashcrombe",
		10000: "Arugal",
	} {
		require.Equal(t, name, vanilla[entry].Name)
		require.False(t, vanilla[entry].CanBattle())
	}
	for _, entry := range []uint32{61969, 61970, 912408} {
		require.NotContains(t, vanilla, entry)
	}

	nightmare := ShadowfangKeepHostiles(database.WoWFlavor{
		database.FlavorVanilla,
		database.FlavorNightmareOfUrsol,
	}).HostileEntries()
	for entry, name := range map[uint32]string{
		61969:  "Prelate Ironmane",
		61970:  "Spectral Cleric",
		912408: "Burning Blade Flamekin",
	} {
		require.Equal(t, name, nightmare[entry].Name)
		require.False(t, nightmare[entry].Boss)
	}
}

func TestShadowfangKeepHostiles_BossCoverage(t *testing.T) {
	t.Parallel()

	hostiles := ShadowfangKeepHostiles(database.WoWFlavor{database.FlavorVanilla}).HostileEntries()
	require.True(t, hostiles[3887].Boss)
	require.Equal(t, "Baron Silverlaine", hostiles[3887].EncounterName)
	require.True(t, hostiles[4275].Boss)
	require.Equal(t, "Archmage Arugal", hostiles[4275].EncounterName)
	require.True(t, hostiles[4278].Boss)
	require.Equal(t, "Commander Springvale", hostiles[4278].EncounterName)
	require.True(t, hostiles[3872].Affiliation == types.AffiliationHostile)
	require.False(t, hostiles[3872].Boss)
}
