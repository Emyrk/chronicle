package api

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestTalentCalculatorOG(t *testing.T) {
	t.Parallel()

	t.Run("LandingPage", func(t *testing.T) {
		t.Parallel()
		og := talentCalculatorOG("capy.chronicleclassic.com", "", "")
		require.Equal(t, "Talent Calculator", og.Title)
		require.Equal(t, "Plan, share, and compare class talent builds.", og.Description)
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
