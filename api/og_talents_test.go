package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/services"
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
		{"Warmane", database.WoWFlavor{database.FlavorWrath, database.FlavorWarmane}, "Warmane"},
		{"Epoch Reborn", database.WoWFlavor{database.FlavorWrath, database.FlavorEpoch}, "Epoch Reborn"},
		{"VanillaPlus", database.WoWFlavor{database.FlavorVanilla, database.FlavorVanillaPlus}, "VanillaPlus"},
		{"OctoWoW", database.WoWFlavor{database.FlavorVanilla, database.FlavorOctoWoW}, "OctoWoW"},
		{"CapybaraCraft", database.WoWFlavor{database.FlavorVanilla, database.FlavorCapybara}, "CapybaraCraft"},
		{"Sun Reach", database.WoWFlavor{database.FlavorVanilla, database.FlavorSunreach}, "Sun Reach"},
		{"Faebright", database.WoWFlavor{database.FlavorVanilla, database.FlavorFaebright}, "Faebright"},
		{"Moonwell", database.WoWFlavor{database.FlavorVanilla, database.FlavorMoonwell}, "Moonwell"},
		{"AshenWoW", database.WoWFlavor{database.FlavorVanilla, database.FlavorAshenWoW}, "AshenWoW"},
		{"Hellfire WoW", database.WoWFlavor{database.FlavorTBC, database.FlavorHellfire}, "Hellfire WoW"},
		{"Crusader Storm", database.WoWFlavor{database.FlavorVanilla, database.FlavorCrusaderStorm}, "Crusader Storm"},
		{"Level One Lunatics", database.WoWFlavor{database.FlavorVanilla, database.FlavorLunatic}, "Level One Lunatics"},
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

func TestDownloadOGImage(t *testing.T) {
	t.Parallel()
	api := &API{Opts: &Options{}}
	req := httptest.NewRequest(http.MethodGet, "https://octo.chronicleclassic.com/download", nil)
	for _, route := range api.OGRoutes() {
		if route.Pattern != "/download" {
			continue
		}
		og := route.Resolve(req)
		require.Equal(t, "Chronicle Sidekick", og.Title)
		require.Equal(t, "https://octo.chronicleclassic.com/download", og.URL)
		require.Equal(t, "https://octo.chronicleclassic.com/c/images/og/sidekick.jpg", og.ImageURL)
		return
	}
	t.Fatal("no /download OG route")
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

func TestTalentOGImageParams(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name, class, build string
		want               url.Values
	}{
		{"Build", "Mage", "2305000000000000000000-0055300002032501312-", url.Values{"class": {"mage"}, "points": {"10-32-0"}, "spec": {"Fire"}}},
		{"NoBuild", "mage", "", url.Values{"class": {"mage"}}},
		{"UnknownSpec", "mage", "000", url.Values{"class": {"mage"}, "points": {"0-0-0"}}},
		{"Pet", "pet", "5551--", url.Values{"class": {"pet"}, "points": {"16"}}},
		{"GarbageBuild", "rogue", "<script>", url.Values{"class": {"rogue"}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tc.want, talentOGImageParams(tc.class, tc.build))
		})
	}
	require.Nil(t, talentOGImageParams("gnomelord", "505"))
}

func TestTalentRouteOGImage(t *testing.T) {
	t.Parallel()

	resolve := func(t *testing.T, api *API, target string) *frontend.OGData {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, target, nil)
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("class", "mage")
		req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
		for _, route := range api.OGRoutes() {
			if route.Pattern == "/talents/{class}" {
				return route.Resolve(req)
			}
		}
		t.Fatal("no /talents/{class} OG route")
		return nil
	}
	const target = "https://forever.chronicleclassic.com/talents/mage?build=2305000000000000000000-0055300002032501312-"

	t.Run("Configured", func(t *testing.T) {
		t.Parallel()
		og := resolve(t, testOGImageAPI(t, "https://og.example.com"), target)
		require.Equal(t, "Fire Mage (10/32/0)", og.Title)

		u, err := url.Parse(og.ImageURL)
		require.NoError(t, err)
		require.Equal(t, "https://og.example.com/api/og", u.Scheme+"://"+u.Host+u.Path)
		q := u.Query()
		sig := q.Get("sig")
		q.Del("sig")
		want := url.Values{
			"template": {"talents"},
			"class":    {"mage"},
			"spec":     {"Fire"},
			"points":   {"10-32-0"},
			"host":     {"forever.chronicleclassic.com"},
			"v":        {ogImageVersion},
		}
		// The test API has no tenant, so the product comes from the build's
		// server flavor: none for turtle (the default build).
		switch services.ServerName {
		case services.ServerIdentityKronos:
			want.Set("product", "Kronos")
		case services.ServerIdentityEpoch:
			want.Set("product", "Epoch Reborn")
		case services.ServerIdentityVanillaPlus:
			want.Set("product", "VanillaPlus")
		case services.ServerIdentityOctoWoW:
			want.Set("product", "OctoWoW")
		}
		require.Equal(t, want, q)
		require.Equal(t, ogSignature("test-og-signing-key", q), sig)
	})

	t.Run("Unconfigured", func(t *testing.T) {
		t.Parallel()
		og := resolve(t, testOGImageAPI(t, ""), target)
		require.Empty(t, og.ImageURL)
	})
}
