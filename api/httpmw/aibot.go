package httpmw

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// AI bot kinds, used as the `kind` label.
const (
	BotKindUserFetch    = "user_fetch"    // a live AI answer pulled the page for a user
	BotKindSearch       = "search"        // builds an AI search index
	BotKindTraining     = "training"      // collects model training data
	BotKindSearchEngine = "search_engine" // classic search engine
)

// Route families, used as the `route_family` label. This is a small fixed set:
// raw paths must never become label values.
const (
	RouteFamilyStats        = "stats"
	RouteFamilyBlog         = "blog"
	RouteFamilyHome         = "home"
	RouteFamilyLeaderboards = "leaderboards"
	RouteFamilyGuild        = "guild"
	RouteFamilyRaid         = "raid"
	RouteFamilyArmory       = "armory"
	RouteFamilyAPI          = "api"
	RouteFamilyOther        = "other"
)

type aiBot struct {
	// needle is the lowercase UA substring to match.
	needle string
	// name is the `bot` label value.
	name string
	kind string
}

// aiBots is matched in order, first hit wins. Needles are distinct enough that
// order does not matter today (e.g. "claudebot" does not match "claude-user"),
// but keep more specific needles first. Google-Extended is a robots.txt token,
// not a user agent, so it is intentionally absent.
var aiBots = []aiBot{
	{"chatgpt-user", "chatgpt-user", BotKindUserFetch},
	{"claude-user", "claude-user", BotKindUserFetch},
	{"perplexity-user", "perplexity-user", BotKindUserFetch},
	{"oai-searchbot", "oai-searchbot", BotKindSearch},
	{"claude-searchbot", "claude-searchbot", BotKindSearch},
	{"perplexitybot", "perplexitybot", BotKindSearch},
	{"gptbot", "gptbot", BotKindTraining},
	{"claudebot", "claudebot", BotKindTraining},
	{"ccbot", "ccbot", BotKindTraining},
	{"googlebot", "googlebot", BotKindSearchEngine},
	{"bingbot", "bingbot", BotKindSearchEngine},
	{"applebot", "applebot", BotKindSearchEngine},
}

// ClassifyAIBot maps a User-Agent to a bot name and kind. ok is false for any
// other agent. It matches case-insensitively without allocating.
func ClassifyAIBot(userAgent string) (name, kind string, ok bool) {
	if userAgent == "" {
		return "", "", false
	}
	for _, b := range aiBots {
		if containsFold(userAgent, b.needle) {
			return b.name, b.kind, true
		}
	}
	return "", "", false
}

// containsFold reports whether s contains lowerSubstr, ignoring ASCII case.
// lowerSubstr must already be lowercase ASCII.
func containsFold(s, lowerSubstr string) bool {
	n := len(lowerSubstr)
	for i := 0; i+n <= len(s); i++ {
		j := 0
		for ; j < n; j++ {
			c := s[i+j]
			if 'A' <= c && c <= 'Z' {
				c += 'a' - 'A'
			}
			if c != lowerSubstr[j] {
				break
			}
		}
		if j == n {
			return true
		}
	}
	return false
}

// familyPrefixes are matched on path segment boundaries, in order. "/" (home)
// and the "other" fallback are handled separately.
var familyPrefixes = []struct {
	prefix string
	family string
}{
	{"/api", RouteFamilyAPI},
	{"/stats", RouteFamilyStats},
	{"/blog", RouteFamilyBlog},
	{"/leaderboards", RouteFamilyLeaderboards},
	{"/g", RouteFamilyGuild},
	{"/guilds", RouteFamilyGuild},
	{"/instances", RouteFamilyRaid},
	{"/recent", RouteFamilyRaid},
	{"/armory", RouteFamilyArmory},
}

// RouteFamily maps a request path to one of the fixed route families.
func RouteFamily(path string) string {
	if path == "" || path == "/" {
		return RouteFamilyHome
	}
	for _, f := range familyPrefixes {
		if path == f.prefix || (strings.HasPrefix(path, f.prefix) && path[len(f.prefix)] == '/') {
			return f.family
		}
	}
	return RouteFamilyOther
}

// AIBotMetrics counts requests from known AI and search bots, labelled by bot,
// kind, route family, status class and tenant. tenantLabel must return a
// bounded set of values (as for PrometheusMW). Other traffic only pays for the
// User-Agent check and is not wrapped.
func AIBotMetrics(register prometheus.Registerer, tenantLabel func(*http.Request) string) func(http.Handler) http.Handler {
	requests := promauto.With(register).NewCounterVec(prometheus.CounterOpts{
		Namespace: "chronicle",
		Subsystem: "ai_bot",
		Name:      "requests_total",
		Help:      "Requests from known AI and search bots by bot, kind, route family, status class and tenant.",
	}, []string{"bot", "kind", "route_family", "status_class", "tenant"})

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			bot, kind, ok := ClassifyAIBot(r.UserAgent())
			if !ok {
				next.ServeHTTP(w, r)
				return
			}
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			status := ww.Status()
			if status == 0 {
				status = http.StatusOK
			}
			requests.WithLabelValues(bot, kind, RouteFamily(r.URL.Path), statusClass(status), tenantLabel(r)).Inc()
		})
	}
}

func statusClass(status int) string {
	if status < 100 || status > 599 {
		return "other"
	}
	return strconv.Itoa(status/100) + "xx"
}
