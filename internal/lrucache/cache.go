// Package lrucache provides a generic, thread-safe LRU cache with optional
// Prometheus instrumentation for hits, misses, entry count, and capacity —
// optionally broken down by dataset.
package lrucache

import (
	"sync"

	lru "github.com/hashicorp/golang-lru/v2"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Metrics holds shared Prometheus collectors for all LRU caches in a process.
// Create once (e.g. at service start) and pass to every [Cache].
type Metrics struct {
	hits           *prometheus.CounterVec // labels: cache, dataset
	misses         *prometheus.CounterVec // labels: cache, dataset
	entries        *prometheus.GaugeVec   // labels: cache
	datasetEntries *prometheus.GaugeVec   // labels: cache, dataset
	capacity       *prometheus.GaugeVec   // labels: cache
}

// NewMetrics registers the shared Prometheus metrics on reg.
// If reg is nil, prometheus.DefaultRegisterer is used.
func NewMetrics(reg prometheus.Registerer) *Metrics {
	if reg == nil {
		reg = prometheus.NewRegistry() // no-op for testing
	}
	f := promauto.With(reg)
	return &Metrics{
		hits: f.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "cache",
			Name:      "hits_total",
			Help:      "Total LRU cache hits.",
		}, []string{"cache", "dataset"}),
		misses: f.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "cache",
			Name:      "misses_total",
			Help:      "Total LRU cache misses.",
		}, []string{"cache", "dataset"}),
		entries: f.NewGaugeVec(prometheus.GaugeOpts{
			Namespace: "chronicle",
			Subsystem: "cache",
			Name:      "entries",
			Help:      "Current number of entries in the LRU cache.",
		}, []string{"cache"}),
		datasetEntries: f.NewGaugeVec(prometheus.GaugeOpts{
			Namespace: "chronicle",
			Subsystem: "cache",
			Name:      "dataset_entries",
			Help:      "Current number of entries per dataset in the LRU cache.",
		}, []string{"cache", "dataset"}),
		capacity: f.NewGaugeVec(prometheus.GaugeOpts{
			Namespace: "chronicle",
			Subsystem: "cache",
			Name:      "capacity",
			Help:      "Maximum capacity of the LRU cache.",
		}, []string{"cache"}),
	}
}

// Opts configures a new [Cache].
type Opts[K comparable, V any] struct {
	Name      string
	Capacity  int
	Metrics   *Metrics       // nil disables instrumentation.
	DatasetOf func(K) string // Extracts a dataset label from a key; nil = no per-dataset breakdown.
}

// Cache is a thread-safe, optionally Prometheus-instrumented LRU cache.
type Cache[K comparable, V any] struct {
	mu        sync.Mutex
	inner     *lru.Cache[K, V]
	name      string
	metrics   *Metrics
	datasetOf func(K) string
}

// New creates a new Cache. Returns an error only if Capacity < 1.
func New[K comparable, V any](opts Opts[K, V]) (*Cache[K, V], error) {
	c := &Cache[K, V]{
		name:      opts.Name,
		metrics:   opts.Metrics,
		datasetOf: opts.DatasetOf,
	}

	inner, err := lru.NewWithEvict[K, V](opts.Capacity, func(key K, _ V) {
		// Called inside c.mu — do NOT re-lock.
		// Prometheus operations are goroutine-safe.
		if c.metrics != nil && c.datasetOf != nil {
			c.metrics.datasetEntries.WithLabelValues(c.name, c.datasetOf(key)).Dec()
		}
	})
	if err != nil {
		return nil, err
	}
	c.inner = inner

	if c.metrics != nil {
		c.metrics.capacity.WithLabelValues(c.name).Set(float64(opts.Capacity))
		c.metrics.entries.WithLabelValues(c.name).Set(0)
	}

	return c, nil
}

func (c *Cache[K, V]) dataset(key K) string {
	if c.datasetOf != nil {
		return c.datasetOf(key)
	}
	return ""
}

// Get returns the value for key, promoting it in the LRU.
func (c *Cache[K, V]) Get(key K) (V, bool) {
	c.mu.Lock()
	val, ok := c.inner.Get(key)
	c.mu.Unlock()

	if c.metrics != nil {
		ds := c.dataset(key)
		if ok {
			c.metrics.hits.WithLabelValues(c.name, ds).Inc()
		} else {
			c.metrics.misses.WithLabelValues(c.name, ds).Inc()
		}
	}
	return val, ok
}

// Add inserts or updates a cache entry.
func (c *Cache[K, V]) Add(key K, value V) {
	c.mu.Lock()
	existed := c.inner.Contains(key)
	c.inner.Add(key, value) // may fire eviction callback for a different key
	size := c.inner.Len()
	c.mu.Unlock()

	if c.metrics != nil {
		c.metrics.entries.WithLabelValues(c.name).Set(float64(size))
		if !existed && c.datasetOf != nil {
			c.metrics.datasetEntries.WithLabelValues(c.name, c.datasetOf(key)).Inc()
		}
	}
}

// Remove evicts a specific key. Returns true if the key was present.
func (c *Cache[K, V]) Remove(key K) bool {
	c.mu.Lock()
	ok := c.inner.Remove(key) // fires eviction callback if present
	size := c.inner.Len()
	c.mu.Unlock()

	if ok && c.metrics != nil {
		c.metrics.entries.WithLabelValues(c.name).Set(float64(size))
	}
	return ok
}

// RemoveFunc evicts all keys for which match returns true.
// Useful for bulk-invalidating a subset of the cache (e.g. all entries for a
// dataset after an import). Holds the lock for the full scan to prevent
// new entries from sneaking in between the snapshot and the removals.
func (c *Cache[K, V]) RemoveFunc(match func(K) bool) {
	c.mu.Lock()
	for _, k := range c.inner.Keys() {
		if match(k) {
			c.inner.Remove(k) // fires eviction callback (dataset_entries dec)
		}
	}
	size := c.inner.Len()
	c.mu.Unlock()

	if c.metrics != nil {
		c.metrics.entries.WithLabelValues(c.name).Set(float64(size))
	}
}

// Contains checks whether key is present without updating recency.
func (c *Cache[K, V]) Contains(key K) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.inner.Contains(key)
}

// Len returns the current number of entries.
func (c *Cache[K, V]) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.inner.Len()
}
