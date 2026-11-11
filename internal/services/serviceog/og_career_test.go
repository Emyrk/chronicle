package serviceog

import (
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/internal/services/serviceratings"
)

func careerLeadersFixture() serviceratings.CareerLeaders {
	f := func(v float64) *float64 { return &v }
	leader := func(name, class, spec string, mastery, peak, renown float64) serviceratings.CareerLeader {
		return serviceratings.CareerLeader{
			CareerBoardEntry:  serviceratings.CareerBoardEntry{PlayerSpec: spec, Mastery: f(mastery), Peak: f(peak), Renown: renown},
			CareerSubjectName: serviceratings.CareerSubjectName{Name: name, PlayerClass: class, RealmName: "Nordanaar"},
		}
	}
	a := leader("Aeloria", "PRIEST", "Holy", 61.24, 74.8, 812)
	b := leader("Ravenshield", "WARRIOR", "Fury", 58.7, 79.1, 1204.4)
	return serviceratings.CareerLeaders{Status: "ready", Boards: map[string][]serviceratings.CareerLeader{
		"mastery": {a, b},
		"peak":    {b, a},
		"renown":  {b, a},
	}}
}

func TestCareerCardParams(t *testing.T) {
	t.Parallel()
	leaders := careerLeadersFixture()

	t.Run("overview: three boards, specs on Peak and Mastery only", func(t *testing.T) {
		t.Parallel()
		got := careerCardParams(leaders, false, url.Values{})
		require.Equal(t, "Career", got.Get("raid"))
		require.Equal(t, "Every raid, weighted", got.Get("view"))
		require.Equal(t, "Peak", got.Get("b1"))
		require.Equal(t, "Ravenshield:warrior:79.1:peak:Fury,Aeloria:priest:74.8:peak:Holy", got.Get("r1"))
		require.Equal(t, "Aeloria:priest:61.2:mastery:Holy,Ravenshield:warrior:58.7:mastery:Fury", got.Get("r2"))
		require.Equal(t, "Ravenshield:warrior:1204:renown:,Aeloria:priest:812:renown:", got.Get("r3"))
		for key := range got {
			require.NotContains(t, got.Get(key), "Nordanaar", "realm names never appear on cards")
		}
	})

	t.Run("one view is one tall board", func(t *testing.T) {
		t.Parallel()
		got := careerCardParams(leaders, false, url.Values{"view": {"renown"}})
		require.Equal(t, "Renown · every raid", got.Get("view"))
		require.Equal(t, "Renown", got.Get("b1"))
		require.Empty(t, got.Get("b2"))
	})

	t.Run("guilds", func(t *testing.T) {
		t.Parallel()
		got := careerCardParams(leaders, true, url.Values{"subject": {"guilds"}})
		require.Equal(t, "Guilds · every raid, weighted", got.Get("view"))
		require.Equal(t, "Guild Peak", got.Get("b1"))
		require.Equal(t, "Ravenshield:guild:79.1:peak:,Aeloria:guild:74.8:peak:", got.Get("r1"))
	})

	t.Run("no leaders keeps the brand card", func(t *testing.T) {
		t.Parallel()
		require.Nil(t, careerCardParams(serviceratings.CareerLeaders{}, false, url.Values{}))
	})
}

func TestCareerOGMetadata(t *testing.T) {
	t.Parallel()
	og := careerOGMetadata("Turtle WoW", "https://x/leaderboards/career", url.Values{})
	require.Equal(t, "Career Leaderboards", og.Title)
	require.Contains(t, og.Description, "Career leaderboards for Turtle WoW.")
	require.Equal(t, "Guild Career Peak", careerOGMetadata("", "", url.Values{"subject": {"guilds"}, "view": {"peak"}}).Title)
}

func TestCareerOGRaidSelection(t *testing.T) {
	t.Parallel()
	leaders := careerLeadersFixture()
	bwl := url.Values{"raid": {"Blackwing Lair||0"}}
	two := url.Values{"raid": {"Blackwing Lair||0", "Molten Core||0"}}
	many := url.Values{"raid": {"Naxxramas||0", "Temple of Ahn'Qiraj||0", "Blackwing Lair||0", "Molten Core||0"}}

	// The card subtitle names the selection, or counts it when the names don't fit.
	require.Equal(t, "Blackwing Lair", careerCardParams(leaders, false, bwl).Get("view"))
	require.Equal(t, "Blackwing Lair + Molten Core", careerCardParams(leaders, false, two).Get("view"))
	require.Equal(t, "4 raids", careerCardParams(leaders, false, many).Get("view"))
	require.Equal(t, "Guilds · Blackwing Lair + Molten Core", careerCardParams(leaders, true, url.Values{"raid": two["raid"], "subject": {"guilds"}}).Get("view"))
	mastery := careerCardParams(leaders, false, url.Values{"raid": two["raid"], "view": {"mastery"}}).Get("view")
	require.Equal(t, "Mastery · Blackwing Lair + Molten Core", mastery)
	for _, q := range []url.Values{bwl, two, many} {
		require.LessOrEqual(t, len([]rune(careerCardParams(leaders, false, q).Get("view"))), careerOGViewLength)
	}

	// Malformed raid values are ignored rather than breaking the card.
	require.Equal(t, "Every raid, weighted", careerCardParams(leaders, false, url.Values{"raid": {"nonsense"}}).Get("view"))

	// Titles have room for every name.
	og := careerOGMetadata("", "", many)
	require.Equal(t, "Career Leaderboards · Naxxramas + Temple of Ahn'Qiraj + Blackwing Lair + Molten Core", og.Title)
	require.Contains(t, og.Description, "weighted over Naxxramas + Temple of Ahn'Qiraj + Blackwing Lair + Molten Core alone")
}

func TestCareerRouteBeforeSegment(t *testing.T) {
	t.Parallel()
	routes := New(Options{}).leaderboardRoutes()
	require.Equal(t, "/leaderboards/career", routes[0].Pattern)
}
