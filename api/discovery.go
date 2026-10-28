package api

import (
	"context"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// discoveryStatsCache is a lazy in-memory cache for tenant activity metrics
// used by the discovery endpoint. The underlying SQL query is expensive so
// we cache results for 6 hours.
type discoveryStatsCache struct {
	mu      sync.Mutex
	stats   map[uuid.UUID]database.TenantDiscoveryStatsRow
	expires time.Time
	// last mirrors stats for readers that must not wait on a refresh.
	last atomic.Pointer[map[uuid.UUID]database.TenantDiscoveryStatsRow]
}

type discoveryStatsQuerier interface {
	TenantDiscoveryStats(ctx context.Context, since pgtype.Timestamptz) ([]database.TenantDiscoveryStatsRow, error)
}

func (c *discoveryStatsCache) get(ctx context.Context, q discoveryStatsQuerier) map[uuid.UUID]database.TenantDiscoveryStatsRow {
	c.mu.Lock()
	defer c.mu.Unlock()

	if time.Now().Before(c.expires) && c.stats != nil {
		return c.stats
	}

	since := pgtype.Timestamptz{Time: time.Now().AddDate(0, 0, -14), Valid: true}
	rows, err := q.TenantDiscoveryStats(ctx, since)
	if err != nil {
		// Return stale data on error (graceful degradation).
		return c.stats
	}

	m := make(map[uuid.UUID]database.TenantDiscoveryStatsRow, len(rows))
	for _, r := range rows {
		m[r.TenantID] = r
	}
	c.stats = m
	c.last.Store(&m)
	c.expires = time.Now().Add(6 * time.Hour)
	return m
}

// cached returns the last computed stats without waiting on the query, which
// may be nil. When they are missing or expired, it refreshes in the background.
func (c *discoveryStatsCache) cached(ctx context.Context, q discoveryStatsQuerier) map[uuid.UUID]database.TenantDiscoveryStatsRow {
	// A held lock means a refresh is already running.
	if c.mu.TryLock() {
		stale := c.stats == nil || !time.Now().Before(c.expires)
		c.mu.Unlock()
		if stale {
			go c.get(context.WithoutCancel(ctx), q)
		}
	}
	if m := c.last.Load(); m != nil {
		return *m
	}
	return nil
}

// choosePopularity ranks communities in the chooser by unique players over
// the discovery stats window.
func (a *API) choosePopularity(ctx context.Context) map[uuid.UUID]int64 {
	stats := a.discoveryStats.cached(servicetenant.AdminBypass(ctx), a.Opts.Zed)
	out := make(map[uuid.UUID]int64, len(stats))
	for id, s := range stats {
		out[id] = s.UniquePlayerCount
	}
	return out
}

// Discovery returns branding for this deployment and all its tenants.
// On a tenant subdomain: returns a single-element array for that tenant.
// On the primary domain: returns site-level branding plus every tenant.
// Used by the landing site (chronicleclassic.com) to aggregate server info.
// With ?scope=all, a tenant subdomain returns the primary-domain list too,
// e.g. to show every server a supporter tier applies to. The requesting
// tenant is always included and flagged as current.
//
//	@Summary  Discovery info for landing page aggregation
//	@Tags     Public
//	@Param    scope query string false "Set to 'all' to list every discoverable server, even from a tenant subdomain"
//	@Success  200 {array} chroniclesdk.DiscoveryEntry
//	@Router   /api/v1/discovery [get]
func (a *API) Discovery(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Cache for 1 hour — this data changes slowly.
	w.Header().Set("Cache-Control", "public, max-age=3600")

	current := servicetenant.TenantFromContext(ctx)

	// On a tenant subdomain, return just that tenant (if discoverable).
	if t := current; t != nil && r.URL.Query().Get("scope") != "all" {
		if !t.Discoverable {
			httpapi.Write(ctx, w, http.StatusOK, []chroniclesdk.DiscoveryEntry{})
			return
		}
		sdkTenant := chroniclesdk.TenantFromDB(*t)
		url := ""
		if a.Opts.AccessURL != nil {
			if a.Opts.Tenant != nil && t.Slug.Valid && a.Opts.Tenant.PrimaryDomain() != "" {
				url = a.Opts.AccessURL.Scheme + "://" + t.Slug.String + "." + a.Opts.Tenant.PrimaryDomain()
			}
		}
		httpapi.Write(ctx, w, http.StatusOK, []chroniclesdk.DiscoveryEntry{{
			Branding: sdkTenant.Branding,
			URL:      url,
		}})
		return
	}

	// Primary domain (or scope=all): return site-level branding (if discoverable) + all discoverable tenants.
	// Read across every tenant, not just the one serving this request.
	listCtx := servicetenant.AdminBypass(ctx)
	var entries []chroniclesdk.DiscoveryEntry

	// Site-level branding.
	config, err := a.Opts.Zed.GetSiteConfig(listCtx)
	if err == nil && config.Discoverable {
		if b := unmarshalBranding(config.Branding); b != nil {
			url := ""
			if a.Opts.AccessURL != nil {
				url = a.Opts.AccessURL.String()
			}
			entries = append(entries, chroniclesdk.DiscoveryEntry{
				Branding: b,
				URL:      url,
				Current:  current == nil,
			})
		}
	}

	// All discoverable tenants.
	if a.Opts.Tenant != nil {
		tenants, err := a.Opts.Zed.ListTenants(listCtx)
		if err == nil {
			stats := a.discoveryStats.get(listCtx, a.Opts.Zed)
			primaryDomain := a.Opts.Tenant.PrimaryDomain()
			scheme := "https"
			if a.Opts.AccessURL != nil {
				scheme = a.Opts.AccessURL.Scheme
			}
			for _, t := range tenants {
				isCurrent := current != nil && t.ID == current.ID
				if !t.Discoverable && !isCurrent {
					continue
				}
				sdkTenant := chroniclesdk.TenantFromDB(t)
				if sdkTenant.Branding == nil {
					continue
				}
				url := ""
				if t.Slug.Valid && primaryDomain != "" {
					url = scheme + "://" + t.Slug.String + "." + primaryDomain
				}
				entry := chroniclesdk.DiscoveryEntry{
					Branding: sdkTenant.Branding,
					URL:      url,
					Current:  isCurrent,
				}
				if s, ok := stats[t.ID]; ok {
					entry.Instances14d = &s.InstanceCount
					entry.UniquePlayers14d = &s.UniquePlayerCount
				}
				entries = append(entries, entry)
			}
		}
	}

	if entries == nil {
		entries = []chroniclesdk.DiscoveryEntry{}
	}

	httpapi.Write(ctx, w, http.StatusOK, entries)
}
