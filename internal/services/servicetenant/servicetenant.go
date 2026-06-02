package servicetenant

import (
  "context"
  "fmt"
  "net/url"
  "strings"
  "time"

  "github.com/Emyrk/chronicle/database"
  "github.com/Emyrk/chronicle/internal/maps"
  "github.com/Emyrk/chronicle/internal/services"
  "github.com/Emyrk/chronicle/internal/services/serviceaccessurl"
  "github.com/Emyrk/chronicle/internal/services/servicepgxpool"

  "github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func Tenant(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

func OnTenant() string {
	return (&Service{}).Name()
}

type Service struct {
	broker *services.Services

	primaryDomain string
	// accessURL is the root "all tenants" URL (e.g. https://legacy.chronicleclassic.com).
	// Its origin is always allowed in CORS.
	accessURL url.URL

	// db is a raw database.Store used for tenant queries.
	// This store is NOT behind RLS — tenant queries themselves are not tenant-scoped.
	db database.Store

	slugs maps.MutexMap[string, database.Tenant]
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
		slugs:  maps.NewMutexMap[string, database.Tenant](),
	}
}

// NewTest creates a Service without a broker, suitable for unit tests.
// The access URL is set directly for CORS origin checking.
func NewTest(accessURL url.URL) *Service {
	return &Service{
		accessURL: accessURL,
		slugs:     maps.NewMutexMap[string, database.Tenant](),
	}
}

func (s *Service) Name() string         { return services.ServiceTenant }
func (s *Service) Configures() []string { return []string{} }
func (s *Service) DependsOn() []string {
	return []string{
		servicepgxpool.OnPGXPool(),
		serviceaccessurl.OnAccessURL(),
	}
}

func (s *Service) Start(ctx context.Context) error {
	pool := servicepgxpool.PGXPool(s.broker)
	s.db = database.New(pool)

	// Pull the access URL from the access URL service.
	if raw := serviceaccessurl.AccessURL(s.broker); raw != "" {
		if u, err := url.Parse(raw); err == nil {
			s.accessURL = *u
		}
	}

	// Wire tenant-aware pool hooks. These run on every connection
	// acquire/release in the shared pgxpool.
	database.PrepareConnFunc = PrepareConn
	database.ResetConnFunc = ResetConn
	database.CheckNestedTxFunc = CheckNestedTx

	// Initial cache load.
	if err := s.refreshCache(ctx); err != nil {
		return fmt.Errorf("load tenant cache: %w", err)
	}

	// Background goroutine refreshes the cache every 5 minutes.
	go s.refreshLoop(ctx)

	return nil
}

func (s *Service) Close(_ context.Context) error {
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "primary-domain",
			Description: "Primary domain for tenant subdomains (e.g. chronicleclassic.com). Tenant slugs become subdomains of this.",
			Env:         "CHRONICLE_PRIMARY_DOMAIN",
			Flag:        "primary-domain",
			Default:     "",
			Value:       serpent.StringOf(&s.primaryDomain),
		},
	}
}

// GetTenantBySlug returns the cached tenant for a slug.
func (s *Service) GetTenantBySlug(slug string) (database.Tenant, bool) {
	return s.slugs.Get(slug)
}

const refreshInterval = 5 * time.Minute

// refreshLoop runs in the background, refreshing the cache on a schedule.
// Stops when the context is cancelled (service shutdown).
func (s *Service) refreshLoop(ctx context.Context) {
	ticker := time.NewTicker(refreshInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_ = s.refreshCache(ctx)
		}
	}
}

func (s *Service) refreshCache(ctx context.Context) error {
	// Tenant queries bypass RLS — the tenants table is not behind RLS policies.
	// But we still need to bypass wow_servers/wow_server_realms RLS to do
	// this safely, in case any future query touches those tables.
	ctx = AdminBypass(ctx)
	tenants, err := s.db.ListTenants(ctx)
	if err != nil {
		return err
	}

	newSlugs := make(map[string]database.Tenant, len(tenants))
	for _, t := range tenants {
		if t.Slug.Valid && t.Slug.String != "" {
			newSlugs[t.Slug.String] = t
		}
	}

	s.slugs.Replace(newSlugs)
	return nil
}

// InvalidateCache forces an immediate cache refresh from the database.
func (s *Service) InvalidateCache() {
	_ = s.refreshCache(context.Background())
}

// IsAllowedOrigin checks if the given origin is a valid tenant subdomain
// or a known base origin. Used by CORS middleware.
func (s *Service) IsAllowedOrigin(origin string) bool {
	// Always allow the access URL origin (root "all tenants" domain).
	if s.accessURL.Host != "" {
		accessOrigin := s.accessURL.Scheme + "://" + s.accessURL.Host
		if origin == accessOrigin {
			return true
		}
	}

	// Always allow known base origins.
	if origin == "https://chronicleclassic.com" || origin == "https://wiki.chronicleclassic.com" || origin == "https://jollygrin.github.io" {
		return true
	}

	// In dev mode, allow localhost and *.localhost subdomains.
	if strings.HasPrefix(origin, "http://localhost:") || origin == "http://localhost" {
		return true
	}
	if strings.Contains(origin, ".localhost:") || strings.HasSuffix(origin, ".localhost") {
		return true
	}

	// Check tenant subdomains.
	if s.primaryDomain == "" {
		return false
	}

	// Extract hostname from origin (strip scheme).
	host := origin
	if idx := strings.Index(host, "://"); idx != -1 {
		host = host[idx+3:]
	}
	// Strip port if present.
	if idx := strings.LastIndex(host, ":"); idx != -1 {
		host = host[:idx]
	}
	host = strings.ToLower(host)

	// Check if host is exactly the primary domain (root).
	if host == s.primaryDomain {
		return true
	}

	// Check if host is a tenant subdomain.
	slug := s.extractSlug(host)
	if slug == "" {
		return false
	}
	_, ok := s.GetTenantBySlug(slug)
	return ok
}

// PrimaryDomain returns the configured primary domain.
func (s *Service) PrimaryDomain() string {
	return s.primaryDomain
}

// ExtractSlug exposes subdomain extraction from a host string (including port).
// Returns "" if the host doesn't match a tenant subdomain pattern.
func (s *Service) ExtractSlug(host string) string {
	return s.extractSlug(host)
}
