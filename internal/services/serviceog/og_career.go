package serviceog

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/services/serviceratings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// CareerLeadersReader reads the top of each career board for a tenant over the
// given raids (every raid when empty).
type CareerLeadersReader func(ctx context.Context, tenant uuid.UUID, guilds bool, raids []leaderboardconfig.CareerKey) (serviceratings.CareerLeaders, error)

// careerOGRaidTimeout bounds a raid selection's leaders, which can't share the
// per-tenant cache; a slow read keeps the brand card.
const careerOGRaidTimeout = 1500 * time.Millisecond

// careerOGViewLength is the card subtitle's limit (the renderer's `view`).
const careerOGViewLength = 40

// careerOGRaids are the page's valid ?raid= selections, in URL order.
func careerOGRaids(query url.Values) []leaderboardconfig.CareerKey {
	var out []leaderboardconfig.CareerKey
	for _, raw := range query["raid"] {
		if k, ok := leaderboardconfig.ParseCareerKeyQuery(raw); ok {
			out = append(out, k)
		}
	}
	return out
}

// careerOGScope names a selection as the page does: every raid, one raid, a
// short "A + B", or "N raids" when the names would not fit the card.
func careerOGScope(raids []leaderboardconfig.CareerKey, room int) string {
	switch len(raids) {
	case 0:
		return "every raid"
	case 1:
		return raids[0].Label()
	}
	labels := make([]string, len(raids))
	for i, k := range raids {
		labels[i] = k.Label()
	}
	if joined := strings.Join(labels, " + "); len([]rune(joined)) <= room {
		return joined
	}
	return fmt.Sprintf("%d raids", len(raids))
}

// careerOGView is a shareable ?view= board on /leaderboards/career.
type careerOGView struct {
	key, label, tone string
}

// careerCardListRows is a lone career board's rows: character rows carry a spec
// line, and five of those push the template's footer off the card.
const careerCardListRows = 4

var careerOGViews = []careerOGView{
	{"peak", "Peak", "peak"},
	{"mastery", "Mastery", "mastery"},
	{"renown", "Renown", "renown"},
}

// careerOG resolves /leaderboards/career. It must be routed before
// /leaderboards/{segment}, which would read "career" as a raid.
func (s *Service) careerOG(r *http.Request) *frontend.OGData {
	product := seoProductName(s.resolvedSiteFlavor(r.Context()))
	query := r.URL.Query()
	og := careerOGMetadata(product, canonicalRequestURL(s, r), query)
	og.ImageURL = s.careerCardURL(r, query)
	return og
}

func careerOGGuilds(query url.Values) bool {
	return query.Get("subject") == "guild" || query.Get("subject") == "guilds"
}

func careerOGSelectedView(query url.Values) (careerOGView, bool) {
	for _, v := range careerOGViews {
		if query.Get("view") == v.key {
			return v, true
		}
	}
	return careerOGView{}, false
}

func careerOGMetadata(product, canonicalURL string, query url.Values) *frontend.OGData {
	guilds := careerOGGuilds(query)
	title := "Career Leaderboards"
	description := "Every character across every raid: career Mastery and Peak from each character's strongest spec, and Renown across every spec."
	if guilds {
		title = "Guild Career Leaderboards"
		description = "Every guild across every raid: career Mastery and Peak from kill times, and Renown."
	}
	if v, ok := careerOGSelectedView(query); ok {
		title = strings.Replace(title, "Leaderboards", v.label, 1)
	}
	lead := "Career leaderboards"
	if product != "" {
		lead += " for " + product
	}
	if raids := careerOGRaids(query); len(raids) > 0 {
		// Titles have room for every name; the card falls back to a count.
		title += " · " + careerOGScope(raids, math.MaxInt)
		description = "Mastery and Peak weighted over " + careerOGScope(raids, math.MaxInt) + " alone, and Renown from those raids."
	}
	return &frontend.OGData{Title: title, Description: lead + ". " + description, URL: canonicalURL}
}

// careerCardURL is the signed leaderboard card for the career board, or "" to
// keep the brand card: no OG service, no tenant or reader, or no leaders yet.
// Leaders come from a per-tenant cache that never blocks the request.
func (s *Service) careerCardURL(r *http.Request, query url.Values) string {
	if !s.ogServiceConfigured() || s.careerLeaders == nil {
		return ""
	}
	tenant := servicetenant.TenantFromContext(r.Context())
	if tenant == nil {
		return ""
	}
	guilds := careerOGGuilds(query)
	raids := careerOGRaids(query)
	var leaders serviceratings.CareerLeaders
	if len(raids) == 0 {
		cache := &s.ogCareerPlayers
		if guilds {
			cache = &s.ogCareerGuilds
		}
		leaders = cache.Get(r.Context(), s.logger, func(ctx context.Context) (serviceratings.CareerLeaders, error) {
			return s.careerLeaders(ctx, tenant.ID, guilds, nil)
		})
	} else {
		ctx, cancel := context.WithTimeout(r.Context(), careerOGRaidTimeout)
		defer cancel()
		var err error
		if leaders, err = s.careerLeaders(ctx, tenant.ID, guilds, raids); err != nil {
			return ""
		}
	}
	params := careerCardParams(leaders, guilds, query)
	if params == nil {
		return ""
	}
	params.Set("path", r.URL.EscapedPath())
	return s.ogImageURL(r, "leaderboard", params)
}

// careerCardParams follows ?view= and ?subject=: one tall board for a chosen
// rating, else Peak, Mastery, and Renown side by side. Realm names never appear.
func careerCardParams(leaders serviceratings.CareerLeaders, guilds bool, query url.Values) url.Values {
	rows := func(v careerOGView, limit int) []string {
		out := make([]string, 0, limit)
		for _, l := range leaders.Boards[v.key] {
			if len(out) == limit {
				break
			}
			value := l.Renown
			switch v.key {
			case "peak":
				value = *l.Peak
			case "mastery":
				value = *l.Mastery
			}
			kind, sub := "guild", ""
			if !guilds {
				kind = ogClassSlug(l.CareerSubjectName.PlayerClass)
				if v.key != "renown" {
					sub = cardSpec(l.PlayerSpec)
				}
			}
			if row := cardRow(l.Name, kind, ratingValue(value, v.tone), v.tone, sub); row != "" {
				out = append(out, row)
			}
		}
		return out
	}
	prefix := ""
	if guilds {
		prefix = "Guild "
	}
	params := url.Values{"raid": {"Career"}, "chip": {"Leaderboards"}}
	boards := []leaderboardCardBoard{}
	raids := careerOGRaids(query)
	if v, ok := careerOGSelectedView(query); ok {
		lead := prefix + v.label + " · "
		params.Set("view", lead+careerOGScope(raids, careerOGViewLength-len([]rune(lead))))
		boards = append(boards, leaderboardCardBoard{prefix + v.label, rows(v, careerCardListRows)})
	} else {
		lead := ""
		if guilds {
			lead = "Guilds · "
		}
		scope := "every raid, weighted"
		if len(raids) > 0 {
			scope = careerOGScope(raids, careerOGViewLength-len([]rune(lead)))
		}
		// Capitalize only when the scope starts the subtitle ("Guilds · every raid…").
		if lead == "" {
			scope = strings.ToUpper(scope[:1]) + scope[1:]
		}
		params.Set("view", lead+scope)
		for _, v := range careerOGViews {
			boards = append(boards, leaderboardCardBoard{prefix + v.label, rows(v, leaderboardCardRows)})
		}
	}
	board := 0
	for _, b := range boards {
		if len(b.rows) == 0 {
			continue
		}
		board++
		params.Set(fmt.Sprintf("b%d", board), b.title)
		params.Set(fmt.Sprintf("r%d", board), strings.Join(b.rows, ","))
	}
	if board == 0 {
		return nil
	}
	return params
}
