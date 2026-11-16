// Package servicestats serves the public, server-rendered /stats answer pages
// from precomputed per-tenant snapshots. See README.md for how to add a page.
//
// It owns the page families and their producers, the background jobs that
// refresh them, the tenant activity threshold, page rendering, sitemap entries
// and IndexNow pings. The api package owns route wiring and resolves the
// per-request Site.
package servicestats

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/coder/serpent"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceaccessurl"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// Options configures a Service.
type Options struct {
	Logger *slog.Logger
	Store  database.Store
	// Families defaults to DefaultFamilies().
	Families []Family
	// Static defaults to DefaultStaticPages().
	Static []StaticPage
	// SiteFlavor resolves a tenant's flavor tags (nil tenant = root site).
	// Defaults to the build's server flavor.
	SiteFlavor func(ctx context.Context, tenant *database.Tenant) database.WoWFlavor
	// AccessURL is the root site's URL. Its scheme is used for every origin
	// and its host for the root site's canonical host.
	AccessURL *url.URL
	// PrimaryDomain is the tenant subdomain parent (see servicetenant).
	PrimaryDomain string
	// IndexNowKey enables IndexNow pings when set.
	IndexNowKey string
	// IndexNowEndpoint overrides DefaultIndexNowEndpoint (tests).
	IndexNowEndpoint string
	// HTTPClient sends IndexNow pings. Defaults to a client with a timeout.
	HTTPClient *http.Client
	// Now overrides time.Now (tests).
	Now func() time.Time
}

// Service is the /stats capability. Construct it with New.
type Service struct {
	logger        *slog.Logger
	store         database.Store
	families      []*Family
	byProducer    map[string]*Family
	static        map[string]StaticPage
	staticOrder   []StaticPage
	siteFlavor    func(ctx context.Context, tenant *database.Tenant) database.WoWFlavor
	accessURL     *url.URL
	primaryDomain string
	indexNow      *indexNow
	now           func() time.Time
}

// New validates the registry and builds a Service.
func New(opts Options) (*Service, error) {
	if opts.Store == nil {
		return nil, errors.New("servicestats: store is required")
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	if opts.Families == nil {
		opts.Families = DefaultFamilies()
	}
	if opts.Static == nil {
		opts.Static = DefaultStaticPages()
	}
	if opts.SiteFlavor == nil {
		var datasets *servicedataset.Service
		opts.SiteFlavor = datasets.SiteFlavor
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	s := &Service{
		logger:        opts.Logger,
		store:         opts.Store,
		byProducer:    map[string]*Family{},
		static:        map[string]StaticPage{},
		staticOrder:   opts.Static,
		siteFlavor:    opts.SiteFlavor,
		accessURL:     opts.AccessURL,
		primaryDomain: strings.ToLower(opts.PrimaryDomain),
		now:           opts.Now,
	}
	for i := range opts.Families {
		f := opts.Families[i]
		if err := f.compile(); err != nil {
			return nil, fmt.Errorf("servicestats: %w", err)
		}
		if l, ok := f.Producer.(interface{ SetLogger(*slog.Logger) }); ok {
			l.SetLogger(opts.Logger)
		}
		key := f.Producer.Key()
		if s.byProducer[key] != nil {
			return nil, fmt.Errorf("servicestats: duplicate producer key %q", key)
		}
		for _, other := range s.families {
			if f.sameShape(other) {
				return nil, fmt.Errorf("servicestats: patterns %q and %q match the same paths", f.Pattern, other.Pattern)
			}
		}
		s.byProducer[key] = &f
		s.families = append(s.families, &f)
	}
	for _, p := range opts.Static {
		if _, err := parsePath(p.Path); err != nil || p.Render == nil {
			return nil, fmt.Errorf("servicestats: invalid static page %q", p.Path)
		}
		if _, ok := s.static[p.Path]; ok {
			return nil, fmt.Errorf("servicestats: duplicate static page %q", p.Path)
		}
		for _, f := range s.families {
			if _, ok := f.Match(p.Path); ok {
				return nil, fmt.Errorf("servicestats: static page %q is also matched by family pattern %q", p.Path, f.Pattern)
			}
		}
		s.static[p.Path] = p
	}
	if opts.IndexNowKey != "" {
		in, err := newIndexNow(opts.IndexNowKey, opts.IndexNowEndpoint, opts.HTTPClient, opts.Logger)
		if err != nil {
			return nil, err
		}
		s.indexNow = in
	}
	return s, nil
}

// DefaultFamilies is the registry of /stats page families. Add new ones here.
func DefaultFamilies() []Family {
	return []Family{
		aboutFamily(),
		searchesIndexFamily(),
		searchesFamily(),
	}
}

// DefaultStaticPages is the registry of /stats pages without snapshots.
func DefaultStaticPages() []StaticPage {
	return []StaticPage{
		methodologyPage(),
	}
}

// Family returns the registered (compiled) family for a producer key, or nil.
func (s *Service) Family(producerKey string) *Family {
	return s.byProducer[producerKey]
}

// servesFamily reports whether a request for path would be served by f: no
// static page has the path and f is the most specific family matching it.
func (s *Service) servesFamily(path string, f *Family) bool {
	if _, static := s.static[path]; static {
		return false
	}
	matched, _, ok := s.match(path)
	return ok && matched == f
}

// match returns the most specific family page for path.
func (s *Service) match(path string) (*Family, Page, bool) {
	var (
		best     *Family
		bestPage Page
	)
	for _, f := range s.families {
		page, ok := f.match(path)
		if !ok {
			continue
		}
		if best == nil || f.moreSpecific(best) {
			best, bestPage = f, page
		}
	}
	return best, bestPage, best != nil
}

// Runtime is the broker-managed wrapper that owns the process's Service.
type Runtime struct {
	broker      *services.Services
	indexNowKey string
	stats       *Service
}

var _ services.Servicer = (*Runtime)(nil)

// NewRuntime creates the broker-managed /stats service.
func NewRuntime(broker *services.Services) *Runtime { return &Runtime{broker: broker} }

// Stats returns the process's /stats service.
func Stats(broker *services.Services) *Service {
	return services.MustGet[*Runtime](broker).stats
}

// OnStats is the dependency name of the /stats service.
func OnStats() string { return (&Runtime{}).Name() }

func (*Runtime) Name() string                { return services.ServiceStats }
func (*Runtime) Configures() []string        { return nil }
func (*Runtime) Close(context.Context) error { return nil }
func (*Runtime) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		servicedbstore.OnDatabaseStore(),
		serviceaccessurl.OnAccessURL(),
		servicetenant.OnTenant(),
		servicedataset.OnDataset(),
	}
}

func (r *Runtime) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "IndexNow Key",
			Description: "Optional IndexNow key. When set, Chronicle serves it at /indexnow.txt and pings IndexNow when a /stats page's data changes.",
			Flag:        "indexnow-key",
			Env:         "CHRONICLE_INDEXNOW_KEY",
			Value:       serpent.StringOf(&r.indexNowKey),
		},
	}
}

func (r *Runtime) Start(context.Context) error {
	var accessURL *url.URL
	if raw := serviceaccessurl.AccessURL(r.broker); raw != "" {
		u, err := url.Parse(raw)
		if err != nil {
			return fmt.Errorf("parse access url: %w", err)
		}
		accessURL = u
	}
	stats, err := New(Options{
		Logger:        servicelogger.Logger(r.broker),
		Store:         servicedbstore.DatabaseStore(r.broker),
		SiteFlavor:    servicedataset.Dataset(r.broker).SiteFlavor,
		AccessURL:     accessURL,
		PrimaryDomain: servicetenant.Tenant(r.broker).PrimaryDomain(),
		IndexNowKey:   r.indexNowKey,
	})
	if err != nil {
		return err
	}
	r.stats = stats
	return nil
}

// indexNowKeyPattern is IndexNow's key format.
var indexNowKeyPattern = regexp.MustCompile(`^[a-zA-Z0-9-]{8,128}$`)
