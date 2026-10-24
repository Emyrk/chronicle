package api

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestSEOProductName(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name   string
		flavor database.WoWFlavor
		want   string
	}{
		{"WoWForever", database.WoWFlavor{database.FlavorVanilla, database.FlavorWoWForever}, "WoW Forever"},
		{"Kronos", database.WoWFlavor{database.FlavorVanilla, database.FlavorKronos}, "Kronos"},
		{"ChromieCraft", database.WoWFlavor{database.FlavorWrath, database.FlavorAzerothcore, database.FlavorChromieCraft}, "ChromieCraft"},
		{"VanillaPlus", database.WoWFlavor{database.FlavorVanilla, database.FlavorVanillaPlus}, "VanillaPlus"},
		{"OctoWoW", database.WoWFlavor{database.FlavorVanilla, database.FlavorOctoWoW}, "OctoWoW"},
		{"CapybaraCraft", database.WoWFlavor{database.FlavorVanilla, database.FlavorCapybara}, "CapybaraCraft"},
		{"Generic", database.WoWFlavor{database.FlavorVanilla, database.FlavorTurtle}, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tc.want, seoProductName(tc.flavor))
		})
	}
}

func TestFlavorStaticOG(t *testing.T) {
	t.Parallel()
	og := flavorStaticOG("/", "WoW Forever", staticOGRoutes["/"], "https://forever.chronicleclassic.com/")
	require.Equal(t, "Raid Logs and Performance Analysis", og.Title)
	require.Contains(t, og.Description, "WoW Forever combat logs")
	require.Contains(t, og.Description, "rankings")
}

func TestTalentCalculatorOG(t *testing.T) {
	t.Parallel()

	t.Run("LandingPage", func(t *testing.T) {
		t.Parallel()
		og := talentCalculatorOG("capy.chronicleclassic.com", "", "")
		require.Equal(t, "Talent Calculator", og.Title)
		require.Equal(t, "Plan, share, and compare class talent builds.", og.Description)
	})

	t.Run("FlavorSpecificCopy", func(t *testing.T) {
		t.Parallel()
		landing := flavorTalentCalculatorOG("forever.chronicleclassic.com", "WoW Forever", "", "")
		require.Equal(t, "Build, share, and compare WoW Forever class talent builds with Chronicle's talent calculator.", landing.Description)

		class := flavorTalentCalculatorOG("forever.chronicleclassic.com", "WoW Forever", "warrior", "")
		require.Equal(t, "Plan, compare, and share WoW Forever Warrior talent builds with Chronicle's talent calculator.", class.Description)
	})

	t.Run("ClassWithoutBuild", func(t *testing.T) {
		t.Parallel()
		og := talentCalculatorOG("capy.chronicleclassic.com", "paladin", "")
		require.Equal(t, "Paladin Talent Calculator", og.Title)
		require.Equal(t, "Plan and share Paladin talent builds.", og.Description)
	})

	t.Run("ClassWithBuild", func(t *testing.T) {
		t.Parallel()
		// 0+5+3+2+0+3+1+2+0+0+5+2+5+1+3+5+1 = 38, "", 5+5+2+0+0+0+0+1 = 13
		og := talentCalculatorOG("capy.chronicleclassic.com", "paladin", "05320312005251351--55200001")
		require.Equal(t, "Holy Paladin (38/0/13)", og.Title)
		require.Equal(t, "A 51-point Paladin talent build. Open it in the talent calculator.", og.Description)
	})

	t.Run("DeathKnightSlug", func(t *testing.T) {
		t.Parallel()
		og := talentCalculatorOG("capy.chronicleclassic.com", "deathknight", "5-51")
		require.Equal(t, "Frost Death Knight (5/6/0)", og.Title)
	})

	t.Run("PetBuild", func(t *testing.T) {
		t.Parallel()
		og := talentCalculatorOG("capy.chronicleclassic.com", "pet", "5551--")
		require.Equal(t, "Hunter Pet (16/0/0)", og.Title)
		require.Equal(t, "A 16-point Hunter Pet talent build. Open it in the talent calculator.", og.Description)
		require.Equal(t, "https://capy.chronicleclassic.com/talents/pet?build=5551--", og.URL)
	})

	t.Run("EmptyBuildDigits", func(t *testing.T) {
		t.Parallel()
		og := talentCalculatorOG("capy.chronicleclassic.com", "mage", "000")
		require.Equal(t, "Mage (0/0/0)", og.Title)
	})

	t.Run("UnknownClassFallsBack", func(t *testing.T) {
		t.Parallel()
		og := talentCalculatorOG("capy.chronicleclassic.com", "gnomelord", "505")
		require.Equal(t, "Talent Calculator", og.Title)
	})

	t.Run("GarbageBuildIsSafe", func(t *testing.T) {
		t.Parallel()
		og := talentCalculatorOG("capy.chronicleclassic.com", "rogue", "<script>alert(1)</script>")
		require.Equal(t, "Assassination Rogue (1/0/0)", og.Title)
		require.Equal(t, "https://capy.chronicleclassic.com/talents/rogue?build=1", og.URL)
	})
}
