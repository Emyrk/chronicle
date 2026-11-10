package serviceog

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/Emyrk/chronicle/frontend"
)

// leaderboardOGTab mirrors a leaderboard hub tab (frontend Hub/hubTabs.ts).
type leaderboardOGTab struct {
	Label       string
	Description string
}

// leaderboardOGTabs keys the hub's tab path segments. Overview has no segment.
var leaderboardOGTabs = map[string]leaderboardOGTab{
	"ratings":      {"Ratings", "Character and guild boards for Peak, Ranked Mastery, and Renown."},
	"performances": {"Performances", "Best single-fight DPS and HPS, each linking to the log it came from."},
	"speedruns":    {"Speedruns", "Fastest full clears, boss kills, and combined kill times for a set of bosses."},
	"statistics":   {"Statistics", "Spec distributions, kill times, full clear times, and success rates."},
	"parsing":      {"Parsing", "How parses spread across specs, per-spec details, and kill-time distributions."},
	"rulesets":     {"Rulesets", "Which targets count for DPS, and what a speedrun must include."},
}

const leaderboardOGOverview = "Each raid's headline leaders at a glance: fastest clear, top Peak, guild Renown, and best performance."

// leaderboardOGRatingViews mirrors the shareable ?rating= boards (Ratings/ratingThemes.ts).
var leaderboardOGRatingViews = map[string]string{
	"peak":    "Peak",
	"mastery": "Ranked Mastery",
	"renown":  "Renown",
}

// leaderboardOGInstanceLength caps an instance name taken from the URL.
const leaderboardOGInstanceLength = 48

func (s *Service) leaderboardRoutes() []frontend.OGRoute {
	resolve := func(segment, instance, tab string) func(r *http.Request) *frontend.OGData {
		return func(r *http.Request) *frontend.OGData {
			return leaderboardOG(
				seoProductName(s.resolvedSiteFlavor(r.Context())),
				canonicalRequestURL(s, r),
				chi.URLParam(r, segment), chi.URLParam(r, instance), chi.URLParam(r, tab),
				r.URL.Query(),
			)
		}
	}
	return []frontend.OGRoute{
		{Pattern: "/leaderboards", Resolve: resolve("", "", "")},
		{Pattern: "/leaderboards/{segment}", Resolve: resolve("segment", "", "")},
		{Pattern: "/leaderboards/{instance}/{tab}", Resolve: resolve("", "instance", "tab")},
	}
}

// leaderboardOG builds metadata for a hub URL, following v2Selection: a lone
// known tab segment is a landing tab, any other lone segment is an instance
// overview, and with two segments an unknown tab falls back to Overview.
func leaderboardOG(productName, canonicalURL, segment, instanceSegment, tabSegment string, query url.Values) *frontend.OGData {
	tabID := tabSegment
	if instanceSegment == "" {
		if _, ok := leaderboardOGTabs[segment]; ok {
			tabID = segment
		} else {
			instanceSegment = segment
		}
	}
	instance := leaderboardOGInstanceName(instanceSegment)
	tab, hasTab := leaderboardOGTabs[tabID]

	scope := "Raid"
	if instance != "" {
		scope = instance
	}

	title := scope + " Leaderboards"
	description := leaderboardOGOverview
	if hasTab {
		title = scope + " " + tab.Label
		description = tab.Description
		if tabID == "ratings" {
			subject := ""
			if s := query.Get("subject"); s == "guild" || s == "guilds" {
				subject = "Guild "
			}
			if view, ok := leaderboardOGRatingViews[query.Get("rating")]; ok {
				title = scope + " " + subject + view
			} else if subject != "" {
				title = scope + " " + subject + tab.Label
			}
		}
	}
	if instance == "" && !hasTab {
		title = "Leaderboards"
	}

	lead := "Raid leaderboards"
	if instance != "" {
		lead = instance + " leaderboards"
	}
	if productName != "" {
		lead += " for " + productName
	}
	return &frontend.OGData{Title: title, Description: lead + ". " + description, URL: canonicalURL}
}

// leaderboardOGInstanceName decodes an instance path segment the way the
// frontend does (dashes become spaces). Names with anything but letters,
// digits, spaces and apostrophes, or that run too long, are dropped.
func leaderboardOGInstanceName(segment string) string {
	if decoded, err := url.PathUnescape(segment); err == nil {
		segment = decoded
	}
	name := strings.TrimSpace(strings.ReplaceAll(segment, "-", " "))
	if name == "" || len([]rune(name)) > leaderboardOGInstanceLength {
		return ""
	}
	for _, ch := range name {
		if (ch < 'a' || ch > 'z') && (ch < 'A' || ch > 'Z') && (ch < '0' || ch > '9') && ch != ' ' && ch != '\'' {
			return ""
		}
	}
	return name
}
