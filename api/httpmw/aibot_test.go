package httpmw_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/httpmw"
)

func TestClassifyAIBot(t *testing.T) {
	t.Parallel()

	tests := []struct {
		ua   string
		bot  string
		kind string
	}{
		{"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot", "chatgpt-user", httpmw.BotKindUserFetch},
		{"Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)", "claude-user", httpmw.BotKindUserFetch},
		{"Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)", "perplexity-user", httpmw.BotKindUserFetch},
		{"Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)", "oai-searchbot", httpmw.BotKindSearch},
		{"Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +searchbot@anthropic.com)", "claude-searchbot", httpmw.BotKindSearch},
		{"Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", "perplexitybot", httpmw.BotKindSearch},
		{"Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)", "gptbot", httpmw.BotKindTraining},
		{"Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "claudebot", httpmw.BotKindTraining},
		{"CCBot/2.0 (https://commoncrawl.org/faq/)", "ccbot", httpmw.BotKindTraining},
		{"Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "googlebot", httpmw.BotKindSearchEngine},
		{"Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", "bingbot", httpmw.BotKindSearchEngine},
		{"Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)", "applebot", httpmw.BotKindSearchEngine},
		// Matching ignores case.
		{"chatgpt-USER/1.0", "chatgpt-user", httpmw.BotKindUserFetch},
		{"CLAUDEBOT", "claudebot", httpmw.BotKindTraining},
	}
	for _, tt := range tests {
		t.Run(tt.bot+"/"+tt.ua, func(t *testing.T) {
			t.Parallel()
			bot, kind, ok := httpmw.ClassifyAIBot(tt.ua)
			require.True(t, ok)
			require.Equal(t, tt.bot, bot)
			require.Equal(t, tt.kind, kind)
		})
	}

	for _, ua := range []string{
		"",
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
		"Google-Extended", // robots.txt token, not a user agent
		"curl/8.5.0",
	} {
		_, _, ok := httpmw.ClassifyAIBot(ua)
		require.False(t, ok, "%q", ua)
	}
}

// testing.AllocsPerRun panics in parallel tests, so this one is not parallel.
func TestClassifyAIBotDoesNotAllocate(t *testing.T) {
	ua := "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
	require.Zero(t, testing.AllocsPerRun(100, func() { httpmw.ClassifyAIBot(ua) }))
	human := "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
	require.Zero(t, testing.AllocsPerRun(100, func() { httpmw.ClassifyAIBot(human) }))
}

func TestRouteFamily(t *testing.T) {
	t.Parallel()

	tests := map[string]string{
		"":                        httpmw.RouteFamilyHome,
		"/":                       httpmw.RouteFamilyHome,
		"/stats":                  httpmw.RouteFamilyStats,
		"/stats/wow-forever":      httpmw.RouteFamilyStats,
		"/blog":                   httpmw.RouteFamilyBlog,
		"/blog/some-post":         httpmw.RouteFamilyBlog,
		"/leaderboards":           httpmw.RouteFamilyLeaderboards,
		"/leaderboards/speedruns": httpmw.RouteFamilyLeaderboards,
		"/g/0b7e8c1e-0000-0000-0000-000000000000": httpmw.RouteFamilyGuild,
		"/guilds":            httpmw.RouteFamilyGuild,
		"/instances/abc123":  httpmw.RouteFamilyRaid,
		"/recent":            httpmw.RouteFamilyRaid,
		"/armory":            httpmw.RouteFamilyArmory,
		"/armory/Realm/0x51": httpmw.RouteFamilyArmory,
		"/api/v1/stats":      httpmw.RouteFamilyAPI,
		"/api":               httpmw.RouteFamilyAPI,
		"/talents/priest":    httpmw.RouteFamilyOther,
		"/sitemap.xml":       httpmw.RouteFamilyOther,
		// Prefixes only match whole path segments.
		"/statsfoo":     httpmw.RouteFamilyOther,
		"/blogger":      httpmw.RouteFamilyOther,
		"/gx":           httpmw.RouteFamilyOther,
		"/armory-extra": httpmw.RouteFamilyOther,
		"/apiary":       httpmw.RouteFamilyOther,
	}
	for path, want := range tests {
		require.Equal(t, want, httpmw.RouteFamily(path), path)
	}
}

func TestAIBotMetrics(t *testing.T) {
	t.Parallel()

	registry := prometheus.NewRegistry()
	router := chi.NewRouter()
	router.Use(httpmw.AIBotMetrics(registry))
	router.Get("/blog/{slug}", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) })
	router.Get("/instances/{id}", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNotFound) })

	do := func(path, ua string) {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		if ua != "" {
			req.Header.Set("User-Agent", ua)
		}
		router.ServeHTTP(httptest.NewRecorder(), req)
	}
	const (
		claudeUser = "Mozilla/5.0 (compatible; Claude-User/1.0)"
		gptBot     = "Mozilla/5.0 (compatible; GPTBot/1.1)"
		browser    = "Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0 Safari/537.36"
	)
	do("/blog/a", claudeUser)
	do("/blog/b", claudeUser) // raw paths do not split the series
	do("/instances/x", gptBot)
	do("/no/such/page", gptBot) // unrouted, still counted
	do("/blog/a", browser)      // not a bot
	do("/blog/a", "")

	families, err := registry.Gather()
	require.NoError(t, err)
	require.Len(t, families, 1)
	require.Equal(t, "chronicle_ai_bot_requests_total", families[0].GetName())

	got := map[string]float64{}
	for _, m := range families[0].Metric {
		labels := map[string]string{}
		for _, l := range m.Label {
			labels[l.GetName()] = l.GetValue()
		}
		require.Len(t, labels, 4)
		got[labels["bot"]+"|"+labels["kind"]+"|"+labels["route_family"]+"|"+labels["status_class"]] = m.Counter.GetValue()
	}
	require.Equal(t, map[string]float64{
		"claude-user|user_fetch|blog|2xx": 2,
		"gptbot|training|raid|4xx":        1,
		"gptbot|training|other|4xx":       1,
	}, got)
}
