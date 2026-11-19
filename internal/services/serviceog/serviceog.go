package serviceog

import (
	"context"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/serviceratings"
	"github.com/Emyrk/chronicle/internal/services/serviceseo"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/tenantcache"
)

const defaultSEODescription = "Chronicle provides combat log analysis for World of Warcraft communities. Upload combat logs to explore encounters, rankings, and performance insights."

func parseArmoryPlayerGUID(player string) guid.GUID {
	if id, err := guid.FromString(player); err == nil {
		return id
	}
	if id, err := strconv.ParseUint(player, 10, 32); err == nil {
		return guid.GUID(id)
	}
	return 0
}

// Options are the dependencies used to resolve page metadata and generated OG
// card URLs. OGServiceURL and OGSigningKey are both required to enable generated
// cards; without them, Routes preserves Chronicle's existing static metadata.
type Options struct {
	// SharedContentSlug selects the canonical tenant for shared content; empty keeps the request host.
	SharedContentSlug string
	Logger            *slog.Logger
	Zed               *authz.Authz
	Chronicle         *chronicle.Chronicle
	Tenant            *servicetenant.Service
	Dataset           *servicedataset.Service
	AccessURL         *url.URL
	OGServiceURL      *url.URL
	OGSigningKey      string
	// PlayerCareer is optional; without it character cards show history only.
	PlayerCareer PlayerCareerReader
	// CareerLeaders is optional; without it /leaderboards/career keeps the brand card.
	CareerLeaders CareerLeadersReader
}

// Service resolves Open Graph metadata for Chronicle pages.
type Service struct {
	logger          *slog.Logger
	store           *authz.Authz
	chronicle       *chronicle.Chronicle
	tenant          *servicetenant.Service
	dataset         *servicedataset.Service
	accessURL       *url.URL
	imageBaseURL    *url.URL
	signingKey      string
	playerCareer    PlayerCareerReader
	careerLeaders   CareerLeadersReader
	ogCareerPlayers tenantcache.Cache[serviceratings.CareerLeaders]
	ogCareerGuilds  tenantcache.Cache[serviceratings.CareerLeaders]
	ogSiteStats     tenantcache.Cache[database.SiteStatsRow]
	ogCensus        tenantcache.Cache[[]database.CensusPlayerCountsRow]
	ogHighlights    tenantcache.Cache[[]chroniclesdk.HubLandingPreview]
	canonical       *serviceseo.Canonical
}

func New(opts Options) *Service {
	return &Service{
		logger:        opts.Logger,
		store:         opts.Zed,
		chronicle:     opts.Chronicle,
		tenant:        opts.Tenant,
		dataset:       opts.Dataset,
		accessURL:     opts.AccessURL,
		imageBaseURL:  opts.OGServiceURL,
		signingKey:    opts.OGSigningKey,
		playerCareer:  opts.PlayerCareer,
		careerLeaders: opts.CareerLeaders,
		canonical: serviceseo.NewCanonical(serviceseo.CanonicalOptions{
			SharedContentSlug: opts.SharedContentSlug,
			Logger:            opts.Logger,
			Tenant:            opts.Tenant,
			Dataset:           opts.Dataset,
			AccessURL:         opts.AccessURL,
		}),
	}
}

func (s *Service) resolvedSiteFlavor(ctx context.Context) database.WoWFlavor {
	var dataset *servicedataset.Service
	if s != nil {
		dataset = s.dataset
	}
	return dataset.SiteFlavor(ctx)
}

// realmOwnerHost returns the host of the tenant that owns realmID, so
// tenant-owned pages (guilds, characters) are canonical on their owner's host
// like instances (see serviceseo.Canonical.OwnerHost). It returns fallback
// when the realm belongs to the root site or the owner cannot be resolved.
func (s *Service) realmOwnerHost(ctx context.Context, realmID uuid.UUID, fallback string) string {
	if s.store == nil {
		return fallback
	}
	slug, err := s.store.GetRealmTenantSlug(ctx, realmID)
	if err != nil {
		if s.logger != nil {
			s.logger.DebugContext(ctx, "resolve realm owner for canonical host, keeping the request host", "realm_id", realmID, "host", fallback, "error", err)
		}
		return fallback
	}
	return s.canonical.OwnerHost(ctx, slug.String, fallback)
}

// ogCacheWait bounds how long a page waits for a card's first cached fetch.
const ogCacheWait = 1500 * time.Millisecond

// loadOGCache reads a card's cached data. Unlike Get, a cold cache (the first
// request after a deploy) waits briefly for the fetch: crawlers such as
// Discord keep the first embed they see, so serving the brand card while the
// cache warms would stick. A slow or failed fetch returns the zero value and
// the brand card; the refresh keeps running for later requests.
func loadOGCache[T any](r *http.Request, logger *slog.Logger, cache *tenantcache.Cache[T], fetch func(context.Context) (T, error)) T {
	ctx, cancel := context.WithTimeout(r.Context(), ogCacheWait)
	defer cancel()
	value, _ := cache.Load(ctx, logger, fetch)
	return value
}
