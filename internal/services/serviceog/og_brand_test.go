package serviceog

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/frontend"
)

func TestBrandOGParams(t *testing.T) {
	t.Parallel()

	base, err := url.Parse("https://og.example.com")
	require.NoError(t, err)

	raw := signedOGImageURL(base, "k", "brand", "forever.chronicleclassic.com", "WoW Forever",
		brandOGParams("WoW Forever", database.SiteStatsRow{LogsParsed: 12480, BossKills: 1900000}))
	u, err := url.Parse(raw)
	require.NoError(t, err)
	q := u.Query()

	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	require.Equal(t, []string{"excerpt", "host", "product", "sig", "stat1", "stat2", "template", "title", "v"}, keys)
	require.Equal(t, "brand", q.Get("template"))
	require.Equal(t, "Every pull, every parse, every wipe.", q.Get("title"))
	require.Equal(t, "Free raid log analysis for WoW Forever", q.Get("excerpt"))
	require.Equal(t, "12480:raids logged", q.Get("stat1"))
	require.Equal(t, "1900000:bosses killed", q.Get("stat2"))
	require.Equal(t, "forever.chronicleclassic.com", q.Get("host"))
	require.Equal(t, "WoW Forever", q.Get("product"))
	require.Equal(t, ogSignature("k", q), q.Get("sig"))

	t.Run("NoCounts", func(t *testing.T) {
		t.Parallel()
		q := brandOGParams("", database.SiteStatsRow{})
		require.Equal(t, url.Values{
			"title":   {"Every pull, every parse, every wipe."},
			"excerpt": {"Free raid log analysis for World of Warcraft"},
		}, q)
		q = brandOGParams("", database.SiteStatsRow{LogsParsed: 3})
		require.Equal(t, "3:raids logged", q.Get("stat1"))
		require.False(t, q.Has("stat2"))
	})
}

func TestWithBrandOG(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "https://chronicleclassic.com/instances/missing", nil)
	failed := func(*http.Request) *frontend.OGData { return nil }
	noImage := func(*http.Request) *frontend.OGData { return &frontend.OGData{Title: "Recent Raids"} }
	ownImage := func(*http.Request) *frontend.OGData {
		return &frontend.OGData{Title: "Sidekick", ImageURL: "https://chronicleclassic.com/c/images/og/sidekick.jpg"}
	}

	t.Run("Unset", func(t *testing.T) {
		t.Parallel()
		api := testOGImageAPI(t, "")
		require.Nil(t, api.withBrandOG(failed)(req))
		require.Equal(t, &frontend.OGData{Title: "Recent Raids"}, api.withBrandOG(noImage)(req))
	})

	t.Run("Configured", func(t *testing.T) {
		t.Parallel()
		api := testOGImageAPI(t, "https://og.example.com")

		og := api.withBrandOG(failed)(req)
		require.NotNil(t, og)
		require.Empty(t, og.Title, "a failed lookup keeps the page's default title")
		u, err := url.Parse(og.ImageURL)
		require.NoError(t, err)
		require.Equal(t, "brand", u.Query().Get("template"))
		require.False(t, u.Query().Has("stat1"), "no cached counts → no pills")

		og = api.withBrandOG(noImage)(req)
		require.Equal(t, "Recent Raids", og.Title)
		require.Contains(t, og.ImageURL, "template=brand")

		require.Equal(t, ownImage(req), api.withBrandOG(ownImage)(req))
	})
}

func TestChooseOGImageURL(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "https://choose.chronicleclassic.com/instances/abc", nil)
	require.Empty(t, testOGImageAPI(t, "").ChooseOGImageURL(req, 9), "no OG service → no image")

	api := testOGImageAPI(t, "https://og.example.com")
	u, err := url.Parse(api.ChooseOGImageURL(req, 9))
	require.NoError(t, err)
	q := u.Query()
	require.Equal(t, "brand", q.Get("template"))
	require.Equal(t, brandOGTitle, q.Get("title"))
	require.Equal(t, "Raid logs for 9 World of Warcraft communities", q.Get("excerpt"))
	require.Equal(t, "choose.chronicleclassic.com", q.Get("host"))
	require.False(t, q.Has("product"), "the chooser has no tenant product")
	require.NotEmpty(t, q.Get("sig"))

	u, err = url.Parse(api.ChooseOGImageURL(req, 0))
	require.NoError(t, err)
	require.Equal(t, "Free raid log analysis for World of Warcraft", u.Query().Get("excerpt"))
}

func TestBrandOGCatchAll(t *testing.T) {
	t.Parallel()

	resolve := func(api *Service, target string) *frontend.OGData {
		r := chi.NewRouter()
		var got *frontend.OGData
		for _, route := range api.Routes() {
			resolve := route.Resolve
			r.Get(route.Pattern, func(_ http.ResponseWriter, r *http.Request) { got = resolve(r) })
		}
		r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, target, nil))
		return got
	}

	api := testOGImageAPI(t, "https://og.example.com")
	for _, page := range []string{"/blog/armory-refresh", "/blog", "/tools/some/deep/page", "/missing-page"} {
		og := resolve(api, "https://chronicleclassic.com"+page)
		require.NotNil(t, og, page)
		require.Contains(t, og.ImageURL, "template=brand", page)
		require.Empty(t, og.Title, "%s keeps its own rendered title", page)
		require.Empty(t, og.URL, "%s keeps its own canonical URL", page)
	}
	require.Nil(t, resolve(api, "https://chronicleclassic.com/c/assets/index-abc.js"), "static assets get no OG")
	require.Equal(t, "Leaderboards", resolve(api, "https://chronicleclassic.com/leaderboards").Title, "specific routes still win")
	require.Empty(t, resolve(testOGImageAPI(t, ""), "https://chronicleclassic.com/blog/armory-refresh").ImageURL,
		"no OG service → no image")
}
