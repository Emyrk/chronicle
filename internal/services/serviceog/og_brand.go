package serviceog

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

const (
	brandOGTitle   = "Every pull, every parse, every wipe."
	brandOGRefresh = time.Hour
	// brandOGRetry is the wait after a failed SiteStats query.
	brandOGRetry = 5 * time.Minute
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
		stats = s.ogSiteStats.get(r.Context(), s.logger, s.store.SiteStats)
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

// ogTenantCache holds one value per tenant (uuid.Nil for the site itself;
// queries are tenant-scoped by RLS). get never waits on the database: a stale
// or missing entry starts one background refresh and returns what it has
// (the zero value before the first refresh lands). A failed refresh keeps the
// last value and retries after brandOGRetry.
type ogTenantCache[T any] struct {
	mu      sync.Mutex
	entries map[uuid.UUID]*ogTenantEntry[T]
}

// ogSiteStatsCache holds the brand card's site counts.
type ogSiteStatsCache = ogTenantCache[database.SiteStatsRow]

type ogTenantEntry[T any] struct {
	value       T
	nextRefresh time.Time
	refreshing  bool
}

func (c *ogTenantCache[T]) get(ctx context.Context, logger *slog.Logger, fetch func(context.Context) (T, error)) T {
	key := uuid.Nil
	if t := servicetenant.TenantFromContext(ctx); t != nil {
		key = t.ID
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if c.entries == nil {
		c.entries = make(map[uuid.UUID]*ogTenantEntry[T])
	}
	e := c.entries[key]
	if e == nil {
		e = &ogTenantEntry[T]{}
		c.entries[key] = e
	}
	if !e.refreshing && !time.Now().Before(e.nextRefresh) {
		e.refreshing = true
		// Keep the request's tenant and actor for RLS, but not its cancellation.
		refreshCtx := context.WithoutCancel(ctx)
		go c.refresh(refreshCtx, logger, fetch, e)
	}
	return e.value
}

func (c *ogTenantCache[T]) refresh(ctx context.Context, logger *slog.Logger, fetch func(context.Context) (T, error), e *ogTenantEntry[T]) {
	var (
		value T
		err   error
	)
	// Whatever happens, clear refreshing so the entry can refresh again; a
	// panic counts as a failed query.
	defer func() {
		if p := recover(); p != nil {
			if logger == nil {
				logger = slog.Default()
			}
			logger.Error("og cache refresh panicked", slog.Any("panic", p))
			err = errors.New("panic")
		}

		c.mu.Lock()
		defer c.mu.Unlock()
		e.refreshing = false
		if err != nil {
			// Keep the last good value; retry sooner than a full interval.
			e.nextRefresh = time.Now().Add(brandOGRetry)
			return
		}
		e.value = value
		e.nextRefresh = time.Now().Add(brandOGRefresh)
	}()

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	value, err = fetch(ctx)
}
