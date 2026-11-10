package serviceog

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
)

func TestCensusOGParams(t *testing.T) {
	t.Parallel()

	rows := []database.CensusPlayerCountsRow{
		{Class: database.WowPlayableClassWARRIOR, Race: database.WowPlayableRaceOrc, Count: 500},
		{Class: database.WowPlayableClassPALADIN, Race: database.WowPlayableRaceHuman, Count: 300},
		{Class: database.WowPlayableClassMAGE, Race: database.WowPlayableRaceBloodElf, Count: 100},
		{Class: database.WowPlayableClassROGUE, Race: database.WowPlayableRaceUnknown, Count: 999},
	}

	t.Run("BloodElfIsHorde", func(t *testing.T) {
		t.Parallel()
		got := censusOGParams(rows, database.WoWFlavor{database.FlavorVanilla})
		require.Equal(t, url.Values{"horde": {"600"}, "alliance": {"300"}, "days": {"90"}}, got)
	})

	t.Run("NightmareOfUrsolHighElfIsAlliance", func(t *testing.T) {
		t.Parallel()
		got := censusOGParams(rows, database.WoWFlavor{database.FlavorVanilla, database.FlavorTurtle, database.FlavorNightmareOfUrsol})
		require.Equal(t, url.Values{"horde": {"500"}, "alliance": {"400"}, "days": {"90"}}, got)
	})

	t.Run("OnlyUnknownRaces", func(t *testing.T) {
		t.Parallel()
		require.Nil(t, censusOGParams([]database.CensusPlayerCountsRow{{Race: database.WowPlayableRaceUnknown, Count: 50}}, nil))
		require.Nil(t, censusOGParams(nil, nil))
	})
}

func TestCensusOG(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "https://capy.chronicleclassic.com/census", nil)

	og := testOGImageAPI(t, "").censusOG(req)
	require.Equal(t, "Realm Census", og.Title)
	require.Equal(t, "https://capy.chronicleclassic.com/census", og.URL)
	require.Empty(t, og.ImageURL, "no OG service → static metadata only")

	// Configured, but no store (no counts yet): the brand card fills in.
	api := testOGImageAPI(t, "https://og.example.com")
	og = api.withBrandOG(api.censusOG)(req)
	require.Equal(t, "Realm Census", og.Title)
	require.Contains(t, og.ImageURL, "template=brand")
}
