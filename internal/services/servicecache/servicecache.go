// Package servicecache provides a centralized cache service. All LRU caches
// in the process must be created through [NewCache] so they are automatically
// registered for admin introspection and share Prometheus instrumentation.
package servicecache

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/pubsub"
	"github.com/Emyrk/chronicle/internal/lrucache"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
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

// DatasetNamespaces returns every namespace whose cache entries are partitioned
// by dataset. Dataset deletion uses global generations for these namespaces so
// replicas can purge safely before dataset-scoped generation rows are removed.
func DatasetNamespaces() []Namespace {
	return []Namespace{
		NamespaceSpells,
		NamespaceTalents,
		NamespaceItems,
		NamespaceCreatures,
		NamespaceExtraAttacks,
		NamespaceDurationMods,
		NamespacePeriodicSpells,
	}
}

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

	db     database.Store
	pubsub pubsub.Pubsub
	logger *slog.Logger

	reconcileMu     sync.Mutex
	observed        map[handlerGenerationKey]int64
	serviceCtx      context.Context
	cancel          context.CancelFunc
	cancelSubscribe func()
	periodic        <-chan time.Time
	reconcileDone   chan<- struct{}
	loopDone        chan struct{}
	callbackMu      sync.Mutex
	callbacks       sync.WaitGroup
	closing         bool
	stopPeriodic    func()
}

type generationKey struct {
	namespace Namespace
	scope     Scope
	scopeID   uuid.UUID
}

type handlerGenerationKey struct {
	generationKey
	handler string
}

// PublishedGeneration is the durable version created inside a transaction.
// Call [Service.ApplyPublished] only after that transaction commits.
type PublishedGeneration struct {
	Invalidation Invalidation
	Generation   int64
}

const (
	invalidationChannel  = "cache_invalidation"
	maxNotificationBytes = 1024
	reconcileInterval    = time.Minute
)

func New(broker *services.Services) *Service {
	return &Service{
		broker:       broker,
		invalidators: make(map[Namespace][]invalidator),
		observed:     make(map[handlerGenerationKey]int64),
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
		servicepgxpool.OnPGXPool(),
		servicelogger.OnLogger(),
	}
}

func (s *Service) Start(ctx context.Context) error {
	reg := serviceprometheus.Registry(s.broker)
	s.metrics = lrucache.NewMetrics(reg)
	s.db = database.New(servicepgxpool.PGXPool(s.broker))
	s.pubsub = servicepgxpool.Pubsub(s.broker)
	s.logger = servicelogger.Logger(s.broker)
	return s.startReconciler(ctx)
}

func (s *Service) Close(_ context.Context) error {
	if s.cancelSubscribe != nil {
		s.cancelSubscribe()
	}
	s.callbackMu.Lock()
	s.closing = true
	s.callbackMu.Unlock()
	if s.cancel != nil {
		s.cancel()
	}
	if s.stopPeriodic != nil {
		s.stopPeriodic()
	}
	if s.loopDone != nil {
		<-s.loopDone
	}
	// SubscribeWithErr owns its callback goroutine. Wait for any callback that
	// started before cancellation to finish before returning from shutdown.
	s.callbacks.Wait()
	return nil
}

// RegisterInvalidator registers a named handler for a namespace and scope.
// Handlers run in registration order. Registering the same handler name twice
// for one namespace returns [ErrDuplicateInvalidator].
func (s *Service) RegisterInvalidator(namespace Namespace, scope Scope, name string, handler InvalidationHandler) error {
	if namespace == "" || name == "" || handler == nil {
		return fmt.Errorf("register cache invalidator: namespace, name, and handler are required")
	}
	if !knownNamespace(namespace) {
		return fmt.Errorf("register cache invalidator %q: %w: %q", name, ErrUnknownNamespace, namespace)
	}
	if scope != ScopeGlobal && scope != ScopeDataset {
		return fmt.Errorf("register cache invalidator %q: %w: %d", name, ErrUnsupportedScope, scope)
	}

	s.mu.Lock()
	if s.invalidators == nil {
		s.invalidators = make(map[Namespace][]invalidator)
	}
	for _, registered := range s.invalidators[namespace] {
		if registered.name == name {
			s.mu.Unlock()
			return fmt.Errorf("%w: namespace %q handler %q", ErrDuplicateInvalidator, namespace, name)
		}
	}
	s.invalidators[namespace] = append(s.invalidators[namespace], invalidator{
		name:    name,
		scope:   scope,
		handler: handler,
	})
	started := s.serviceCtx != nil && s.db != nil
	s.mu.Unlock()

	if started {
		if err := s.reconcileRegistered(s.serviceCtx, namespace, scope); err != nil {
			return fmt.Errorf("reconcile newly registered invalidator %q: %w", name, err)
		}
	}
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

// Publish atomically increments the durable generation and sends the NOTIFY
// hint, then invalidates this process only after the transaction commits.
func (s *Service) Publish(ctx context.Context, req Invalidation) error {
	if s.db == nil {
		return s.Invalidate(ctx, req)
	}
	var published PublishedGeneration
	if err := s.db.InTx(ctx, func(tx database.Store) error {
		var err error
		published, err = s.PublishTx(ctx, tx, req)
		return err
	}, nil); err != nil {
		return err
	}
	return s.ApplyPublished(ctx, published)
}

// PublishTx increments a durable generation and queues its NOTIFY inside tx.
// It never invalidates locally because the caller's transaction has not yet
// committed. The caller must invoke [Service.ApplyPublished] after commit.
func (s *Service) PublishTx(ctx context.Context, tx database.Store, req Invalidation) (PublishedGeneration, error) {
	key, err := keyFromInvalidation(req)
	if err != nil {
		return PublishedGeneration{}, err
	}
	row, err := tx.PublishCacheGeneration(ctx, database.PublishCacheGenerationParams{
		Namespace: string(key.namespace),
		Scope:     key.scope.String(),
		ScopeID:   key.scopeID,
	})
	if err != nil {
		return PublishedGeneration{}, fmt.Errorf("publish cache generation: %w", err)
	}
	return PublishedGeneration{Invalidation: req, Generation: row.Generation}, nil
}

// ApplyPublished applies a generation returned by PublishTx. Call it only after
// the transaction that produced the generation has committed.
func (s *Service) ApplyPublished(ctx context.Context, published ...PublishedGeneration) error {
	var errs []error
	for _, generation := range published {
		key, err := keyFromInvalidation(generation.Invalidation)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		if err := s.applyGeneration(ctx, key, generation.Generation); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func (scope Scope) String() string {
	switch scope {
	case ScopeGlobal:
		return "global"
	case ScopeDataset:
		return "dataset"
	default:
		return "unknown"
	}
}

func keyFromInvalidation(req Invalidation) (generationKey, error) {
	if !knownNamespace(req.Namespace) {
		return generationKey{}, fmt.Errorf("%w: %q", ErrUnknownNamespace, req.Namespace)
	}
	switch req.Scope {
	case ScopeGlobal:
		if req.DatasetID != uuid.Nil {
			return generationKey{}, fmt.Errorf("invalidate %q: global scope must use nil dataset ID", req.Namespace)
		}
		return generationKey{namespace: req.Namespace, scope: req.Scope}, nil
	case ScopeDataset:
		if req.DatasetID == uuid.Nil {
			return generationKey{}, fmt.Errorf("invalidate %q: dataset ID is required", req.Namespace)
		}
		return generationKey{namespace: req.Namespace, scope: req.Scope, scopeID: req.DatasetID}, nil
	default:
		return generationKey{}, fmt.Errorf("invalidate %q: %w: %d", req.Namespace, ErrUnsupportedScope, req.Scope)
	}
}

func knownNamespace(namespace Namespace) bool {
	switch namespace {
	case NamespaceTenantSlugs, NamespaceSpells, NamespaceTalents, NamespaceItems,
		NamespaceCreatures, NamespaceExtraAttacks, NamespaceDurationMods, NamespacePeriodicSpells:
		return true
	default:
		return false
	}
}

type notification struct {
	Namespace  string    `json:"namespace"`
	Scope      string    `json:"scope"`
	ScopeID    uuid.UUID `json:"scope_id"`
	Generation int64     `json:"generation"`
}

func (s *Service) startReconciler(ctx context.Context) error {
	if s.db == nil || s.pubsub == nil {
		return nil
	}
	if s.logger == nil {
		s.logger = slog.Default()
	}
	s.serviceCtx, s.cancel = context.WithCancel(ctx)

	cancel, err := s.pubsub.SubscribeWithErr(invalidationChannel, func(_ context.Context, message []byte, notifyErr error) {
		s.callbackMu.Lock()
		if s.closing {
			s.callbackMu.Unlock()
			return
		}
		s.callbacks.Add(1)
		s.callbackMu.Unlock()
		defer s.callbacks.Done()
		s.handleNotification(s.serviceCtx, message, notifyErr)
	})
	if err != nil {
		s.cancel()
		return fmt.Errorf("subscribe to cache invalidations: %w", err)
	}
	s.cancelSubscribe = cancel

	// Subscribe before the initial scan so a commit racing startup is observed
	// either by the scan or by its notification.
	if err := s.reconcileAll(s.serviceCtx); err != nil {
		cancel()
		s.cancel()
		return fmt.Errorf("initial cache generation reconciliation: %w", err)
	}

	if s.periodic == nil {
		ticker := time.NewTicker(reconcileInterval)
		s.periodic = ticker.C
		s.stopPeriodic = ticker.Stop
	}
	s.loopDone = make(chan struct{})
	go s.reconcileLoop(s.serviceCtx)
	return nil
}

func (s *Service) reconcileLoop(ctx context.Context) {
	defer close(s.loopDone)
	for {
		select {
		case <-ctx.Done():
			return
		case <-s.periodic:
			if err := s.reconcileAll(ctx); err != nil && !errors.Is(err, context.Canceled) {
				s.logger.Error("periodic cache generation reconciliation failed", "error", err)
			}
			if s.reconcileDone != nil {
				select {
				case s.reconcileDone <- struct{}{}:
				default:
				}
			}
		}
	}
}

func (s *Service) handleNotification(ctx context.Context, message []byte, notifyErr error) {
	if notifyErr != nil {
		s.logger.Warn("cache invalidation listener uncertainty; reconciling all generations", "error", notifyErr)
		if err := s.reconcileAll(ctx); err != nil && !errors.Is(err, context.Canceled) {
			s.logger.Error("cache generation reconciliation after listener error failed", "error", err)
		}
		return
	}
	if len(message) == 0 || len(message) > maxNotificationBytes {
		s.logger.Warn("skipping malformed cache invalidation notification", "bytes", len(message))
		return
	}
	var hint notification
	if err := json.Unmarshal(message, &hint); err != nil {
		s.logger.Warn("skipping malformed cache invalidation notification", "error", err)
		return
	}
	key, err := keyFromRow(hint.Namespace, hint.Scope, hint.ScopeID, hint.Generation)
	if err != nil {
		s.logger.Warn("skipping invalid cache invalidation notification", "error", err)
		return
	}
	if err := s.reconcileKey(ctx, key); err != nil && !errors.Is(err, context.Canceled) {
		s.logger.Error("targeted cache generation reconciliation failed", "error", err)
	}
}

func keyFromRow(namespace, scope string, scopeID uuid.UUID, generation int64) (generationKey, error) {
	if generation <= 0 {
		return generationKey{}, fmt.Errorf("generation must be positive")
	}
	req := Invalidation{Namespace: Namespace(namespace), DatasetID: scopeID}
	switch scope {
	case "global":
		req.Scope = ScopeGlobal
	case "dataset":
		req.Scope = ScopeDataset
	default:
		return generationKey{}, fmt.Errorf("unknown cache generation scope %q", scope)
	}
	return keyFromInvalidation(req)
}

func (s *Service) reconcileAll(ctx context.Context) error {
	rows, err := s.db.ListCacheGenerations(ctx)
	if err != nil {
		return err
	}
	var errs []error
	for _, row := range rows {
		key, err := keyFromRow(row.Namespace, row.Scope, row.ScopeID, row.Generation)
		if err != nil {
			s.logger.Warn("skipping invalid cache generation row", "namespace", row.Namespace, "scope", row.Scope, "error", err)
			continue
		}
		if err := s.applyGeneration(ctx, key, row.Generation); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func (s *Service) reconcileKey(ctx context.Context, key generationKey) error {
	row, err := s.db.GetCacheGeneration(ctx, database.GetCacheGenerationParams{
		Namespace: string(key.namespace), Scope: key.scope.String(), ScopeID: key.scopeID,
	})
	if err != nil {
		return err
	}
	validated, err := keyFromRow(row.Namespace, row.Scope, row.ScopeID, row.Generation)
	if err != nil {
		return err
	}
	return s.applyGeneration(ctx, validated, row.Generation)
}

func (s *Service) reconcileRegistered(ctx context.Context, namespace Namespace, scope Scope) error {
	rows, err := s.db.ListCacheGenerations(ctx)
	if err != nil {
		return err
	}
	var errs []error
	for _, row := range rows {
		key, err := keyFromRow(row.Namespace, row.Scope, row.ScopeID, row.Generation)
		if err != nil {
			continue
		}
		if key.namespace == namespace && key.scope == scope {
			if err := s.applyGeneration(ctx, key, row.Generation); err != nil {
				errs = append(errs, err)
			}
		}
	}
	return errors.Join(errs...)
}

func (s *Service) applyGeneration(ctx context.Context, key generationKey, generation int64) error {
	s.reconcileMu.Lock()
	defer s.reconcileMu.Unlock()

	s.mu.Lock()
	handlers := append([]invalidator(nil), s.invalidators[key.namespace]...)
	s.mu.Unlock()

	req := Invalidation{Namespace: key.namespace, Scope: key.scope, DatasetID: key.scopeID}
	var errs []error
	matched := false
	for _, registered := range handlers {
		if registered.scope != key.scope {
			continue
		}
		matched = true
		observedKey := handlerGenerationKey{generationKey: key, handler: registered.name}
		if generation <= s.observed[observedKey] {
			continue
		}
		if err := registered.handler(ctx, req); err != nil {
			errs = append(errs, fmt.Errorf("invalidate %q with %q: %w", key.namespace, registered.name, err))
			continue
		}
		s.observed[observedKey] = generation
	}
	if len(errs) == 0 && matched && key.scope == ScopeGlobal {
		// Dataset deletion publishes a persistent global purge before removing
		// scoped generation rows. Forget scoped observations after that purge so
		// recreating a dataset with the same UUID can restart at generation 1.
		for observedKey := range s.observed {
			if observedKey.namespace == key.namespace && observedKey.scope == ScopeDataset {
				delete(s.observed, observedKey)
			}
		}
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
