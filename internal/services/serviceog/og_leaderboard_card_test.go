package serviceog

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
)

func testPlayer(name, class, spec string, score float64) chroniclesdk.HubPlayerRatingEntry {
	return chroniclesdk.HubPlayerRatingEntry{RealmName: "Secret Realm", PlayerName: name, PlayerClass: class, PlayerSpec: spec, Score: score}
}

func testPreviews() []chroniclesdk.HubLandingPreview {
	naxx := chroniclesdk.HubLandingPreview{
		InstanceName: "Naxxramas",
		Player: chroniclesdk.HubPlayerRatings{
			Peak:          []chroniclesdk.HubPlayerRatingEntry{testPlayer("Ana", "SHAMAN", "Unknown", 97.84), testPlayer("Bo,b:", "PRIEST", "Shadow", 93.3)},
			RankedMastery: []chroniclesdk.HubPlayerRatingEntry{testPlayer("Cy", "WARLOCK", "Destruction", 82.7)},
			Renown:        []chroniclesdk.HubPlayerRatingEntry{testPlayer("Di", "PALADIN", "", 603.4)},
		},
		Guild: chroniclesdk.HubGuildRatings{
			Renown: []chroniclesdk.HubGuildRatingEntry{{RealmName: "Secret Realm", GuildName: "Zug Zug", Score: 1212}},
		},
		Speedruns:    []chroniclesdk.SpeedrunLeaderboardEntry{{GuildName: "Fast", RealmName: "Secret Realm", DurationMs: 5233099, PlayerCount: 41}},
		Performances: []chroniclesdk.RankingsEntry{{PlayerName: "Ek", PlayerClass: "ROGUE", EncounterName: "Thaddius", RealmName: "Secret Realm", DPS: 1636.3}},
	}
	return []chroniclesdk.HubLandingPreview{
		{InstanceName: "Molten Core", Player: chroniclesdk.HubPlayerRatings{Peak: []chroniclesdk.HubPlayerRatingEntry{testPlayer("Mo", "MAGE", "Fire", 90)}}},
		// A non-default cohort must not replace the default one.
		{InstanceName: "Naxxramas", DifficultyName: "Heroic", MaxPlayers: 10, Player: chroniclesdk.HubPlayerRatings{Peak: []chroniclesdk.HubPlayerRatingEntry{testPlayer("Wrong", "MAGE", "Fire", 1)}}},
		naxx,
		{InstanceName: "Blackwing Lair"}, // no leaders
		{InstanceName: "Temple of Ahn'Qiraj", Speedruns: []chroniclesdk.SpeedrunLeaderboardEntry{{GuildName: "Bugs", DurationMs: 3600000}}},
	}
}

func TestLeaderboardCardParams(t *testing.T) {
	t.Parallel()
	flavor := database.WoWFlavor{database.FlavorVanilla}
	params := func(tab, instance, query string) url.Values {
		q, err := url.ParseQuery(query)
		require.NoError(t, err)
		return leaderboardCardParams(testPreviews(), flavor, tab, instance, q)
	}

	t.Run("HubTopProgressionRaids", func(t *testing.T) {
		t.Parallel()
		p := params("", "", "")
		require.Equal(t, "Naxxramas", p.Get("b1"), "highest progression first")
		require.Equal(t, "Temple of Ahn'Qiraj", p.Get("b2"))
		require.Equal(t, "Molten Core", p.Get("b3"), "Blackwing Lair has no leaders")
		require.Equal(t, "naxxramas", p.Get("art"))
		require.Equal(t, "Ana:shaman:97.8:peak:Peak,Cy:warlock:82.7:mastery:Mastery,Fast:guild:5233:time:Fastest clear", p.Get("r1"))
		require.Empty(t, p.Get("raid"))
	})

	t.Run("RaidOverview", func(t *testing.T) {
		t.Parallel()
		p := params("", "naxxramas", "")
		require.Equal(t, "Naxxramas", p.Get("raid"))
		require.Equal(t, []string{"Peak", "Mastery", "Fastest clear"}, []string{p.Get("b1"), p.Get("b2"), p.Get("b3")})
		require.Equal(t, "Ana:shaman:97.8:peak:,Bob:priest:93.3:peak:Shadow", p.Get("r1"), "Unknown spec hidden, delimiters dropped")
		require.Equal(t, "Fast:guild:5233:time:41 players", p.Get("r3"))
	})

	t.Run("Ratings", func(t *testing.T) {
		t.Parallel()
		p := params("ratings", "Naxxramas", "")
		require.Equal(t, "Renown", p.Get("b3"))
		require.Equal(t, "Di:paladin:603:renown:", p.Get("r3"))

		p = params("ratings", "Naxxramas", "rating=mastery")
		require.Equal(t, "Mastery", p.Get("b1"))
		require.False(t, p.Has("b2"))

		p = params("ratings", "Naxxramas", "rating=renown&subject=guild")
		require.Equal(t, "Guild Renown", p.Get("b1"))
		require.Equal(t, "Zug Zug:guild:1212:renown:", p.Get("r1"))
		require.Equal(t, "Guild Renown", p.Get("view"))
	})

	t.Run("Tabs", func(t *testing.T) {
		t.Parallel()
		require.Equal(t, "Ek:rogue:1636:gold:Thaddius", params("performances", "Naxxramas", "").Get("r1"))
		require.Equal(t, "Bugs:guild:3600:time:", params("speedruns", "Temple of Ahn'Qiraj", "").Get("r1"))
		// A landing tab uses the highest-progression raid with data for it.
		require.Equal(t, "Naxxramas", params("speedruns", "", "").Get("raid"))
		require.Equal(t, "Ratings", params("ratings", "", "").Get("chip"))
	})

	t.Run("BrandFallback", func(t *testing.T) {
		t.Parallel()
		require.Nil(t, params("parsing", "Naxxramas", ""))
		require.Nil(t, params("rulesets", "", ""))
		require.Nil(t, params("statistics", "Naxxramas", ""))
		require.Nil(t, params("", "Blackwing Lair", ""), "no leaders")
		require.Nil(t, params("", "Gnomeregan", ""), "no highlights for the raid")
		require.Nil(t, leaderboardCardParams(nil, flavor, "", "", nil))
	})

	t.Run("NoRealmNames", func(t *testing.T) {
		t.Parallel()
		for _, tab := range []string{"", "ratings", "speedruns", "performances"} {
			for _, instance := range []string{"", "Naxxramas"} {
				p := params(tab, instance, "subject=guild")
				require.NotContains(t, p.Encode(), "Secret", "tab %q instance %q", tab, instance)
			}
		}
	})
}

func TestLeaderboardCardURL(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "https://capy.chronicleclassic.com/leaderboards/Naxxramas", nil)
	require.Empty(t, testOGImageAPI(t, "").leaderboardCardURL(req, nil, "", "Naxxramas"), "no OG service")
	require.Empty(t, testOGImageAPI(t, "https://og.example.com").leaderboardCardURL(req, nil, "", "Naxxramas"), "no store or tenant")
}
