// Package servicecache provides a centralized cache service. All LRU caches
// in the process must be created through [NewCache] so they are automatically
// registered for admin introspection and share Prometheus instrumentation.
package servicecache

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/internal/lrucache"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceprometheus"

	"github.com/coder/serpent"
	"github.com/google/uuid"
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

// Namespace is a stable logical cache name used by invalidation publishers.
type Namespace string

const (
	NamespaceTenantSlugs    Namespace = "tenant_slugs"
	NamespaceSpells         Namespace = "spells"
	NamespaceTalents        Namespace = "talents"
	NamespaceItems          Namespace = "items"
	NamespaceCreatures      Namespace = "creatures"
	NamespaceExtraAttacks   Namespace = "extra_attacks"
	NamespaceDurationMods   Namespace = "duration_modifiers"
	NamespacePeriodicSpells Namespace = "periodic_spells"
)

// Scope identifies the supported invalidation granularity for a handler.
type Scope uint8

const (
	ScopeGlobal Scope = iota + 1
	ScopeDataset
)

// Invalidation is a typed local-process cache invalidation request.
type Invalidation struct {
	Namespace Namespace
	Scope     Scope
	DatasetID uuid.UUID
}

// GlobalInvalidation creates an invalidation for an entire namespace.
func GlobalInvalidation(namespace Namespace) Invalidation {
	return Invalidation{Namespace: namespace, Scope: ScopeGlobal}
}

// DatasetInvalidation creates an invalidation scoped to one dataset.
func DatasetInvalidation(namespace Namespace, datasetID uuid.UUID) Invalidation {
	return Invalidation{Namespace: namespace, Scope: ScopeDataset, DatasetID: datasetID}
}

// InvalidationHandler handles one local invalidation.
type InvalidationHandler func(context.Context, Invalidation) error

var (
	ErrDuplicateInvalidator = errors.New("duplicate cache invalidator")
	ErrUnknownNamespace     = errors.New("unknown cache invalidation namespace")
	ErrUnsupportedScope     = errors.New("unsupported cache invalidation scope")
)

type invalidator struct {
	name    string
	scope   Scope
	handler InvalidationHandler
}

// Service is the centralized cache service. It owns metrics registration
// and a registry of all live caches for admin visibility.
type Service struct {
	broker *services.Services

	mu           sync.Mutex
	caches       []lrucache.CacheInfo
	invalidators map[Namespace][]invalidator
	metrics      *lrucache.Metrics
}

func New(broker *services.Services) *Service {
	return &Service{
		broker:       broker,
		invalidators: make(map[Namespace][]invalidator),
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

// RegisterInvalidator registers a named handler for a namespace and scope.
// Handlers run in registration order. Registering the same handler name twice
// for one namespace returns [ErrDuplicateInvalidator].
func (s *Service) RegisterInvalidator(namespace Namespace, scope Scope, name string, handler InvalidationHandler) error {
	if namespace == "" || name == "" || handler == nil {
		return fmt.Errorf("register cache invalidator: namespace, name, and handler are required")
	}
	if scope != ScopeGlobal && scope != ScopeDataset {
		return fmt.Errorf("register cache invalidator %q: %w: %d", name, ErrUnsupportedScope, scope)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.invalidators == nil {
		s.invalidators = make(map[Namespace][]invalidator)
	}
	for _, registered := range s.invalidators[namespace] {
		if registered.name == name {
			return fmt.Errorf("%w: namespace %q handler %q", ErrDuplicateInvalidator, namespace, name)
		}
	}
	s.invalidators[namespace] = append(s.invalidators[namespace], invalidator{
		name:    name,
		scope:   scope,
		handler: handler,
	})
	return nil
}

// Invalidate routes a local invalidation to every registered handler for its
// namespace. All matching handlers run even if an earlier handler fails.
func (s *Service) Invalidate(ctx context.Context, req Invalidation) error {
	if req.Scope != ScopeGlobal && req.Scope != ScopeDataset {
		return fmt.Errorf("invalidate %q: %w: %d", req.Namespace, ErrUnsupportedScope, req.Scope)
	}
	if req.Scope == ScopeDataset && req.DatasetID == uuid.Nil {
		return fmt.Errorf("invalidate %q: dataset ID is required", req.Namespace)
	}

	s.mu.Lock()
	handlers, ok := s.invalidators[req.Namespace]
	handlers = append([]invalidator(nil), handlers...)
	s.mu.Unlock()
	if !ok {
		return fmt.Errorf("%w: %q", ErrUnknownNamespace, req.Namespace)
	}

	var errs []error
	matched := false
	for _, registered := range handlers {
		if registered.scope != req.Scope {
			continue
		}
		matched = true
		if err := registered.handler(ctx, req); err != nil {
			errs = append(errs, fmt.Errorf("invalidate %q with %q: %w", req.Namespace, registered.name, err))
		}
	}
	if !matched {
		return fmt.Errorf("invalidate %q: %w: %d", req.Namespace, ErrUnsupportedScope, req.Scope)
	}
	return errors.Join(errs...)
}

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
