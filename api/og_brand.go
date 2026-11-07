package api

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
func (api *API) brandOGImageURL(r *http.Request) string {
	if api.Opts == nil || api.Opts.OGServiceURL == nil || api.Opts.OGSigningKey == "" {
		return ""
	}
	var stats database.SiteStatsRow
	if api.Opts.Zed != nil {
		stats = api.ogSiteStats.get(r.Context(), api.Opts.Logger, api.Opts.Zed)
	}
	product := seoProductName(api.resolvedSiteFlavor(r.Context()))
	return api.ogImageURLForProduct(r, "brand", product, brandOGParams(product, stats))
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

// withBrandOG gives a page the brand card when its resolver sets no image,
// including when its lookup fails (nil). With the OG service unset, the
// resolver's result passes through untouched.
func (api *API) withBrandOG(resolve func(r *http.Request) *frontend.OGData) func(r *http.Request) *frontend.OGData {
	return func(r *http.Request) *frontend.OGData {
		og := resolve(r)
		if og != nil && og.ImageURL != "" {
			return og
		}
		image := api.brandOGImageURL(r)
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

type siteStatsQuerier interface {
	SiteStats(ctx context.Context) (database.SiteStatsRow, error)
}

// ogSiteStatsCache holds SiteStats per tenant (uuid.Nil for the site itself;
// the query is tenant-scoped by RLS). get never waits on the database: a stale
// or missing entry starts one background refresh and returns what it has
// (zero counts before the first refresh lands). A failed refresh keeps the
// last counts and retries after brandOGRetry.
type ogSiteStatsCache struct {
	mu      sync.Mutex
	entries map[uuid.UUID]*ogSiteStatsEntry
}

type ogSiteStatsEntry struct {
	stats       database.SiteStatsRow
	nextRefresh time.Time
	refreshing  bool
}

func (c *ogSiteStatsCache) get(ctx context.Context, logger *slog.Logger, q siteStatsQuerier) database.SiteStatsRow {
	key := uuid.Nil
	if t := servicetenant.TenantFromContext(ctx); t != nil {
		key = t.ID
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if c.entries == nil {
		c.entries = make(map[uuid.UUID]*ogSiteStatsEntry)
	}
	e := c.entries[key]
	if e == nil {
		e = &ogSiteStatsEntry{}
		c.entries[key] = e
	}
	if !e.refreshing && !time.Now().Before(e.nextRefresh) {
		e.refreshing = true
		// Keep the request's tenant and actor for RLS, but not its cancellation.
		refreshCtx := context.WithoutCancel(ctx)
		go c.refresh(refreshCtx, logger, q, e)
	}
	return e.stats
}

func (c *ogSiteStatsCache) refresh(ctx context.Context, logger *slog.Logger, q siteStatsQuerier, e *ogSiteStatsEntry) {
	var (
		stats database.SiteStatsRow
		err   error
	)
	// Whatever happens, clear refreshing so the entry can refresh again; a
	// panic counts as a failed query.
	defer func() {
		if p := recover(); p != nil {
			if logger == nil {
				logger = slog.Default()
			}
			logger.Error("og site stats refresh panicked", slog.Any("panic", p))
			err = errors.New("panic")
		}

		c.mu.Lock()
		defer c.mu.Unlock()
		e.refreshing = false
		if err != nil {
			// Keep the last good counts; retry sooner than a full interval.
			e.nextRefresh = time.Now().Add(brandOGRetry)
			return
		}
		e.stats = stats
		e.nextRefresh = time.Now().Add(brandOGRefresh)
	}()

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	stats, err = q.SiteStats(ctx)
}
