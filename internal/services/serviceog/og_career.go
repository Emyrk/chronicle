package serviceog

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/services/serviceratings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// CareerLeadersReader reads the top of each unfiltered career board for a tenant.
type CareerLeadersReader func(ctx context.Context, tenant uuid.UUID, guilds bool) (serviceratings.CareerLeaders, error)

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
	cache := &s.ogCareerPlayers
	if guilds {
		cache = &s.ogCareerGuilds
	}
	leaders := cache.Get(r.Context(), s.logger, func(ctx context.Context) (serviceratings.CareerLeaders, error) {
		return s.careerLeaders(ctx, tenant.ID, guilds)
	})
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
	if v, ok := careerOGSelectedView(query); ok {
		params.Set("view", prefix+v.label+" · every raid")
		boards = append(boards, leaderboardCardBoard{prefix + v.label, rows(v, careerCardListRows)})
	} else {
		view := "Every raid, weighted"
		if guilds {
			view = "Guilds · every raid, weighted"
		}
		params.Set("view", view)
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
