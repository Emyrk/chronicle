package serviceog

import (
	"net/http"
	"net/url"
	"strconv"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/frontend"
)

const (
	brandOGTitle = "Every pull, every parse, every wipe."
)

// brandOGImageURL returns the signed brand card URL for r, or "" when the OG
// service isn't configured. Site counts come from ogSiteStats and are left out
// until the first refresh lands; the card then hides its pill row.
func (s *Service) brandOGImageURL(r *http.Request) string {
	if s.imageBaseURL == nil || s.signingKey == "" {
		return ""
	}
	var stats database.SiteStatsRow
	if s.store != nil {
		stats = s.ogSiteStats.Get(r.Context(), s.logger, s.store.SiteStats)
	}
	product := seoProductName(s.resolvedSiteFlavor(r.Context()))
	return s.ogImageURLForProduct(r, "brand", product, brandOGParams(product, stats))
}

// brandOGParams is the brand card's query. A zero count (not fetched yet, or a
// new tenant) drops its pill; with neither, the card hides the pill row.
func brandOGParams(product string, stats database.SiteStatsRow) url.Values {
	excerpt := "Free raid log analysis for World of Warcraft"
	if product != "" {
		excerpt = "Free raid log analysis for " + product
	}
	params := url.Values{"title": {brandOGTitle}, "excerpt": {excerpt}}
	if stats.LogsParsed > 0 {
		params.Set("stat1", strconv.FormatInt(stats.LogsParsed, 10)+":raids logged")
	}
	if stats.BossKills > 0 {
		params.Set("stat2", strconv.FormatInt(stats.BossKills, 10)+":bosses killed")
	}
	return params
}

// ChooseOGImageURL is the brand card for the community chooser
// (servicechoose.OGImager), or "" when the OG service isn't configured. The
// chooser has no tenant, so the card names no product and shows no site counts.
func (s *Service) ChooseOGImageURL(r *http.Request, communities int) string {
	if !s.ogServiceConfigured() {
		return ""
	}
	excerpt := "Free raid log analysis for World of Warcraft"
	if communities > 1 {
		excerpt = "Raid logs for " + strconv.Itoa(communities) + " World of Warcraft communities"
	}
	return s.ogImageURLForProduct(r, "brand", "", url.Values{"title": {brandOGTitle}, "excerpt": {excerpt}})
}

// withBrandOG gives a page the brand card when its resolver sets no image,
// including when its lookup fails (nil). With the OG service unset, the
// resolver's result passes through untouched.
func (s *Service) withBrandOG(resolve func(r *http.Request) *frontend.OGData) func(r *http.Request) *frontend.OGData {
	return func(r *http.Request) *frontend.OGData {
		og := resolve(r)
		if og != nil && og.ImageURL != "" {
			return og
		}
		image := s.brandOGImageURL(r)
		if image == "" {
			return og
		}
		if og == nil {
			og = &frontend.OGData{}
		}
		og.ImageURL = image
		return og
	}
}
