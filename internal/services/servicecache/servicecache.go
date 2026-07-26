// Package servicecache provides a centralized cache service. All LRU caches
// in the process must be created through [NewCache] so they are automatically
// registered for admin introspection and share Prometheus instrumentation.
package servicecache

import (
	"context"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/internal/lrucache"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceprometheus"

	"github.com/coder/serpent"
)

// Default TTLs for game-data caches. Tune these to control memory pressure
// vs. DB load. A value of 0 means pure LRU eviction (no time-based expiry).
const (
	TTLSpells         = 30 * time.Minute
	TTLSpellsHasDB    = 30 * time.Minute
	TTLTalents        = 5 * time.Minute
	TTLItems          = 30 * time.Minute
	TTLCreatures      = 10 * time.Minute
	TTLDurationMods   = 15 * time.Minute
	TTLExtraAttacks   = 15 * time.Minute
	TTLPeriodicSpells = 15 * time.Minute
)

// TTLs for cached HTTP responses. These match the Cache-Control max-age the
// corresponding endpoints already send, so the server-side cache and the
// browser cache expire on the same schedule.
const (
	TTLRankingsResponses = 5 * time.Minute
	TTLSiteStats         = 30 * time.Minute

	// LoadTimeout bounds a single cache loader invocation.
	LoadTimeout = 30 * time.Second
)

var _ services.Servicer = (*Service)(nil)

// OnCache returns the service name for DependsOn declarations.
func OnCache() string {
	return (&Service{}).Name()
}

// CacheService retrieves the *Service from the service broker.
func CacheService(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

// CacheStat is a snapshot of a single cache's state for admin introspection.
type CacheStat struct {
	Name     string        `json:"name"`
	Entries  int           `json:"entries"`
	Capacity int           `json:"capacity"`
	TTL      time.Duration `json:"ttl"`
}

// Service is the centralized cache service. It owns metrics registration
// and a registry of all live caches for admin visibility.
type Service struct {
	broker *services.Services

	mu      sync.Mutex
	caches  []lrucache.CacheInfo
	metrics *lrucache.Metrics
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
	}
}

func (s *Service) Name() string         { return services.ServiceCache }
func (s *Service) Configures() []string { return []string{} }
func (s *Service) Options() serpent.OptionSet {
	return nil
}

func (s *Service) DependsOn() []string {
	return []string{
		serviceprometheus.OnPrometheus(),
	}
}

func (s *Service) Start(_ context.Context) error {
	reg := serviceprometheus.Registry(s.broker)
	s.metrics = lrucache.NewMetrics(reg)
	return nil
}

func (s *Service) Close(_ context.Context) error { return nil }

// register adds a cache to the introspection registry.
func (s *Service) register(c lrucache.CacheInfo) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.caches = append(s.caches, c)
}

// Stats returns a snapshot of all registered caches.
func (s *Service) Stats() []CacheStat {
	s.mu.Lock()
	defer s.mu.Unlock()

	stats := make([]CacheStat, len(s.caches))
	for i, c := range s.caches {
		stats[i] = CacheStat{
			Name:     c.Name(),
			Entries:  c.Len(),
			Capacity: c.Cap(),
			TTL:      c.TTL(),
		}
	}
	return stats
}

// Purge clears a single cache by name, or all caches if name is empty.
func (s *Service) Purge(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, c := range s.caches {
		if name == "" || c.Name() == name {
			c.Purge()
		}
	}
}

// NewCache creates a cache through the service, auto-registering it and
// wiring shared Prometheus metrics. Callers should not import lrucache
// directly or pass their own *Metrics.
//
// If svc is nil the cache is created without metrics or registration,
// which is useful in tests or CLI tools that don't boot the full service DAG.
func NewCache[K comparable, V any](svc *Service, opts lrucache.Opts[K, V]) (*lrucache.Cache[K, V], error) {
	if svc != nil {
		opts.Metrics = svc.metrics
	}
	c, err := lrucache.New(opts)
	if err != nil {
		return nil, err
	}
	if svc != nil {
		svc.register(c)
	}
	return c, nil
}

// NewLoadingCache creates a string-keyed cache with a coalescing loader,
// registered and instrumented like [NewCache]. Use it for expensive read
// paths where many callers can request the same key at once.
func NewLoadingCache[V any](svc *Service, opts lrucache.Opts[string, V]) (*lrucache.Loading[V], error) {
	c, err := NewCache(svc, opts)
	if err != nil {
		return nil, err
	}
	return lrucache.NewLoading(c, LoadTimeout), nil
}
