package serviceog

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/frontend"
)

func TestLeaderboardOG(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name                       string
		segment, instance, tab     string
		query                      string
		wantTitle, wantDescription string
	}{
		{name: "Hub", wantTitle: "Leaderboards", wantDescription: "Raid leaderboards. " + leaderboardOGOverview},
		{name: "LandingTab", segment: "speedruns", wantTitle: "Raid Speedruns"},
		{name: "InstanceOverview", segment: "Molten-Core", wantTitle: "Molten Core Leaderboards", wantDescription: "Molten Core leaderboards. " + leaderboardOGOverview},
		{name: "InstanceTab", instance: "Ahn'Qiraj-Temple", tab: "statistics", wantTitle: "Ahn'Qiraj Temple Statistics"},
		{name: "EscapedInstance", instance: "Ahn%27Qiraj-Temple", tab: "parsing", wantTitle: "Ahn'Qiraj Temple Parsing"},
		{name: "UnknownTabIsOverview", instance: "Naxxramas", tab: "nope", wantTitle: "Naxxramas Leaderboards"},
		{name: "RatingView", instance: "Naxxramas", tab: "ratings", query: "rating=mastery", wantTitle: "Naxxramas Ranked Mastery"},
		{name: "GuildRatingView", segment: "ratings", query: "rating=renown&subject=guild", wantTitle: "Raid Guild Renown"},
		{name: "GuildRatings", segment: "ratings", query: "subject=guilds&rating=bogus", wantTitle: "Raid Guild Ratings"},
		{name: "RatingIgnoredOffRatingsTab", segment: "speedruns", query: "rating=peak", wantTitle: "Raid Speedruns"},
		{name: "UnsafeInstanceDropped", segment: "%3Cscript%3E", wantTitle: "Leaderboards"},
		{name: "UnsafeInstanceWithTab", instance: "<b>", tab: "rulesets", wantTitle: "Raid Rulesets"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			query, err := url.ParseQuery(tc.query)
			require.NoError(t, err)
			og := leaderboardOG("", "https://chronicleclassic.com/x", tc.segment, tc.instance, tc.tab, query)
			require.Equal(t, tc.wantTitle, og.Title)
			if tc.wantDescription != "" {
				require.Equal(t, tc.wantDescription, og.Description)
			}
			require.Equal(t, "https://chronicleclassic.com/x", og.URL)
		})
	}

	t.Run("ProductName", func(t *testing.T) {
		t.Parallel()
		og := leaderboardOG("WoW Forever", "", "", "Naxxramas", "speedruns", nil)
		require.Equal(t, "Naxxramas leaderboards for WoW Forever. "+leaderboardOGTabs["speedruns"].Description, og.Description)
	})
}

func TestLeaderboardOGRoutes(t *testing.T) {
	t.Parallel()

	r := chi.NewRouter()
	var got *frontend.OGData
	for _, route := range New(Options{}).Routes() {
		resolve := route.Resolve
		r.Get(route.Pattern, func(_ http.ResponseWriter, r *http.Request) { got = resolve(r) })
	}
	for path, want := range map[string]string{
		"/leaderboards":                               "Leaderboards",
		"/leaderboards/statistics":                    "Raid Statistics",
		"/leaderboards/Molten-Core":                   "Molten Core Leaderboards",
		"/leaderboards/Naxxramas/ratings?rating=peak": "Naxxramas Peak",
	} {
		got = nil
		r.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "https://capy.chronicleclassic.com"+path, nil))
		require.NotNil(t, got, path)
		require.Equal(t, want, got.Title, path)
		require.Equal(t, "https://capy.chronicleclassic.com"+strings.SplitN(path, "?", 2)[0], got.URL, path)
	}
}
