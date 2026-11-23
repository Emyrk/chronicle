package serviceog

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/testutil"
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

// The SQL predicate treats an empty realm array as all realms, but NULL
// matches none. Keep this distinct from tests of faction aggregation.
type censusOGStore struct {
	database.Store
	params chan database.CensusPlayerCountsParams
}

func (s *censusOGStore) CensusPlayerCounts(_ context.Context, params database.CensusPlayerCountsParams) ([]database.CensusPlayerCountsRow, error) {
	s.params <- params
	if params.RealmIds == nil {
		return nil, nil
	}
	return []database.CensusPlayerCountsRow{{Race: database.WowPlayableRaceOrc, Count: 500}}, nil
}

func TestCensusOGUnfilteredRealms(t *testing.T) {
	t.Parallel()
	store := &censusOGStore{params: make(chan database.CensusPlayerCountsParams, 1)}
	svc := testOGImageAPI(t, "https://og.example.com")
	svc.store = authz.NewDatabaseOnly(testutil.Logger(t), store)
	req := httptest.NewRequest(http.MethodGet, "https://chromie.chronicleclassic.com/census", nil).
		WithContext(testutil.Context(t, testutil.WaitShort))
	og := svc.censusOG(req)
	select {
	case params := <-store.params:
		require.NotNil(t, params.RealmIds, "nil encodes as SQL NULL and excludes every realm")
		require.Empty(t, params.RealmIds)
	default:
		t.Fatal("census lookup did not run")
	}
	require.Contains(t, og.ImageURL, "template=census")
	require.Contains(t, og.ImageURL, "horde=500")
}
