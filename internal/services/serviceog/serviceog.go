package serviceog

import (
	"context"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"

	"github.com/Gophercraft/core/vsn"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
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
	Logger       *slog.Logger
	Zed          *authz.Authz
	Chronicle    *chronicle.Chronicle
	Tenant       *servicetenant.Service
	Dataset      *servicedataset.Service
	AccessURL    *url.URL
	OGServiceURL *url.URL
	OGSigningKey string
	// PlayerCareer is optional; without it character cards show history only.
	PlayerCareer PlayerCareerReader
}

// Service resolves Open Graph metadata for Chronicle pages.
type Service struct {
	logger       *slog.Logger
	store        *authz.Authz
	chronicle    *chronicle.Chronicle
	tenant       *servicetenant.Service
	dataset      *servicedataset.Service
	accessURL    *url.URL
	imageBaseURL *url.URL
	signingKey   string
	playerCareer PlayerCareerReader
	ogSiteStats  tenantcache.Cache[database.SiteStatsRow]
	ogCensus     tenantcache.Cache[[]database.CensusPlayerCountsRow]
	ogHighlights tenantcache.Cache[[]chroniclesdk.HubLandingPreview]
}

func New(opts Options) *Service {
	return &Service{
		logger:       opts.Logger,
		store:        opts.Zed,
		chronicle:    opts.Chronicle,
		tenant:       opts.Tenant,
		dataset:      opts.Dataset,
		accessURL:    opts.AccessURL,
		imageBaseURL: opts.OGServiceURL,
		signingKey:   opts.OGSigningKey,
		playerCareer: opts.PlayerCareer,
	}
}

func (s *Service) resolvedSiteFlavor(ctx context.Context) database.WoWFlavor {
	if s != nil {
		tenant := servicetenant.TenantFromContext(ctx)
		if tenant != nil && tenant.DefaultDatasetID.Valid && s.dataset != nil {
			dataset, err := s.dataset.GetDataset(ctx, tenant.DefaultDatasetID.UUID)
			if err == nil {
				flavor := database.FlavorFromStrings(dataset.DefaultFlavor).
					Merge(database.FlavorFromStrings(tenant.AdditionalFlavor))
				if len(flavor) > 0 {
					return flavor
				}
			}
		}
	}

	base := database.FlavorVanilla
	if services.ServerBuild == vsn.V3_3_5a {
		base = database.FlavorWrath
	}
	return database.ServerFlavor(services.ServerName, base)
}

func canonicalRequestURL(s *Service, r *http.Request) string {
	path := r.URL.EscapedPath()
	if path == "" {
		path = "/"
	}
	return canonicalOrigin(s, r) + path
}

func canonicalOrigin(s *Service, r *http.Request) string {
	scheme := "https"
	if s != nil && s.accessURL != nil && s.accessURL.Scheme != "" {
		scheme = s.accessURL.Scheme
	}
	return scheme + "://" + ogHost(r)
}
