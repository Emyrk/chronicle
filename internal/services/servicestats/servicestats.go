// Package servicestats serves the public, server-rendered /stats answer pages
// from precomputed per-tenant snapshots. See README.md for how to add a page.
//
// It owns the snapshot producers, the background job that refreshes them, the
// tenant activity threshold, page rendering, sitemap entries and IndexNow
// pings. The api package owns route wiring and resolves the per-request Site.
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
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// Options configures a Service.
type Options struct {
	Logger *slog.Logger
	Store  database.Store
	// Pages defaults to DefaultPages(Store).
	Pages []Page
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
	pages         []Page
	pageByPath    map[string]Page
	accessURL     *url.URL
	primaryDomain string
	indexNow      *indexNow
	now           func() time.Time
}

// New validates the page registry and builds a Service.
func New(opts Options) (*Service, error) {
	if opts.Store == nil {
		return nil, errors.New("servicestats: store is required")
	}
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	if opts.Pages == nil {
		opts.Pages = DefaultPages(opts.Store)
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	s := &Service{
		logger:        opts.Logger,
		store:         opts.Store,
		pages:         opts.Pages,
		pageByPath:    make(map[string]Page, len(opts.Pages)),
		accessURL:     opts.AccessURL,
		primaryDomain: strings.ToLower(opts.PrimaryDomain),
		now:           opts.Now,
	}
	keys := make(map[string]bool, len(opts.Pages))
	for _, p := range opts.Pages {
		if p.Producer == nil || p.Render == nil {
			return nil, fmt.Errorf("servicestats: page %q needs a producer and a render func", p.Path)
		}
		if p.Path != "/stats" && !strings.HasPrefix(p.Path, "/stats/") {
			return nil, fmt.Errorf("servicestats: page path %q must be under /stats", p.Path)
		}
		key := p.Producer.Key()
		if key == "" || strings.HasPrefix(key, "_") {
			return nil, fmt.Errorf("servicestats: page %q has invalid key %q", p.Path, key)
		}
		if keys[key] {
			return nil, fmt.Errorf("servicestats: duplicate page key %q", key)
		}
		if _, ok := s.pageByPath[p.Path]; ok {
			return nil, fmt.Errorf("servicestats: duplicate page path %q", p.Path)
		}
		keys[key] = true
		s.pageByPath[p.Path] = p
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

// DefaultPages is the registry of /stats pages. Add new pages here.
func DefaultPages(store database.Store) []Page {
	return []Page{
		aboutPage(store),
	}
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
