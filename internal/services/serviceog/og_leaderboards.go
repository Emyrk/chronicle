package serviceog

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/frontend"
)

// leaderboardOGTab mirrors a leaderboard hub tab (frontend Hub/hubTabs.ts).
type leaderboardOGTab struct {
	Label       string
	Description string
}

// leaderboardOGTabs keys the hub's tab path segments. Overview has no segment.
var leaderboardOGTabs = map[string]leaderboardOGTab{
	"ratings":      {"Ratings", "Character and guild boards for Peak, Mastery, and Renown."},
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
	"mastery": "Mastery",
	"renown":  "Renown",
}

// leaderboardOGInstanceLength caps an instance name taken from the URL.
const leaderboardOGInstanceLength = 48

func (s *Service) leaderboardRoutes() []frontend.OGRoute {
	resolve := func(segment, instance, tab string) func(r *http.Request) *frontend.OGData {
		return func(r *http.Request) *frontend.OGData {
			flavor := s.resolvedSiteFlavor(r.Context())
			seg, inst, t := chi.URLParam(r, segment), chi.URLParam(r, instance), chi.URLParam(r, tab)
			if s.leaderboardNotFound(flavor, seg, inst, t) {
				return &frontend.OGData{NotFound: true}
			}
			og := leaderboardOG(seoProductName(flavor), canonicalRequestURL(s, r), seg, inst, t, r.URL.Query())
			tabID, instanceName := leaderboardOGSelection(seg, inst, t)
			og.ImageURL = s.leaderboardCardURL(r, flavor, tabID, instanceName)
			return og
		}
	}
	return []frontend.OGRoute{
		// Before {segment}, which would read "career" as a raid.
		{Pattern: "/leaderboards/career", Resolve: s.careerOG},
		{Pattern: "/leaderboards", Resolve: resolve("", "", "")},
		{Pattern: "/leaderboards/{segment}", Resolve: resolve("segment", "", "")},
		{Pattern: "/leaderboards/{instance}/{tab}", Resolve: resolve("", "instance", "tab")},
	}
}

// leaderboardOG builds metadata for a hub URL, following v2Selection: a lone
// known tab segment is a landing tab, any other lone segment is an instance
// overview, and with two segments an unknown tab falls back to Overview.
func leaderboardOG(productName, canonicalURL, segment, instanceSegment, tabSegment string, query url.Values) *frontend.OGData {
	tabID, instance := leaderboardOGSelection(segment, instanceSegment, tabSegment)
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

// leaderboardOGSelection resolves a hub URL's tab ("" for Overview) and
// instance name ("" for the hub landing), following v2Selection.
func leaderboardOGSelection(segment, instanceSegment, tabSegment string) (tabID, instance string) {
	tabID = tabSegment
	if instanceSegment == "" {
		if _, ok := leaderboardOGTabs[segment]; ok {
			tabID = segment
		} else {
			instanceSegment = segment
		}
	}
	if _, ok := leaderboardOGTabs[tabID]; !ok {
		tabID = ""
	}
	return tabID, leaderboardOGInstanceName(instanceSegment)
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

// leaderboardNotFound reports whether a hub URL names something that does not
// exist: a lone segment that is neither a tab nor a raid, a raid the site's
// registry does not know, or an unknown tab after a raid (which the SPA would
// quietly show as Overview). It answers false whenever it cannot tell, so a
// service without a registry never 404s.
func (s *Service) leaderboardNotFound(flavor database.WoWFlavor, segment, instance, tab string) bool {
	if instance != "" {
		if tab != "" && tab != "overview" {
			if _, ok := leaderboardOGTabs[tab]; !ok {
				return true
			}
		}
	} else {
		if segment == "" {
			return false // the hub landing
		}
		if _, ok := leaderboardOGTabs[segment]; ok {
			return false // a landing tab
		}
		if segment == "overview" {
			return false
		}
		instance = segment
	}
	known, ok := s.leaderboardInstances(flavor)
	if !ok {
		return false
	}
	_, found := known[normalizeLeaderboardInstance(instance)]
	return !found
}

// normalizeLeaderboardInstance folds an instance path segment or registry name
// to one comparable form: decoded, dashes as spaces, single-spaced, lowercase.
func normalizeLeaderboardInstance(name string) string {
	if decoded, err := url.PathUnescape(name); err == nil {
		name = decoded
	}
	return strings.ToLower(strings.Join(strings.Fields(strings.ReplaceAll(name, "-", " ")), " "))
}

// leaderboardInstances returns the normalized names of every raid and dungeon
// the site's flavor registry knows, including derived (sub-raid) names. The set
// is built once per flavor: the registry is fixed at startup. ok is false when
// the service has no registry.
func (s *Service) leaderboardInstances(flavor database.WoWFlavor) (names map[string]struct{}, ok bool) {
	if s == nil {
		return nil, false
	}
	key := flavor.CanonicalKey()
	if cached, hit := s.leaderboardNames.Load(key); hit {
		return cached.(map[string]struct{}), true
	}
	if s.chronicle == nil {
		return nil, false
	}
	names = leaderboardInstanceNames(s.chronicle.RegistryForFlavor(flavor).AllInstanceDetails())
	s.leaderboardNames.Store(key, names)
	return names, true
}

// leaderboardInstanceNames normalizes every instance name, and derived
// (sub-raid) name, in details.
func leaderboardInstanceNames(details []registry.InstanceDetail) map[string]struct{} {
	names := make(map[string]struct{}, len(details))
	for _, d := range details {
		names[normalizeLeaderboardInstance(d.Name)] = struct{}{}
		for _, derived := range d.DerivedNames {
			names[normalizeLeaderboardInstance(derived)] = struct{}{}
		}
	}
	return names
}
