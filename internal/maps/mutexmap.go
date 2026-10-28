package maps

import "sync"

// MutexMap is a generic concurrency-safe map.
type MutexMap[K comparable, V any] struct {
	mu sync.RWMutex
	m  map[K]V
}

// NewMutexMap creates a MutexMap with an empty underlying map.
func NewMutexMap[K comparable, V any]() MutexMap[K, V] {
	return MutexMap[K, V]{m: make(map[K]V)}
}

// Get returns the value for the key and whether it was found.
func (mm *MutexMap[K, V]) Get(key K) (V, bool) {
	mm.mu.RLock()
	defer mm.mu.RUnlock()
	v, ok := mm.m[key]
	return v, ok
}

// Set stores a key-value pair.
func (mm *MutexMap[K, V]) Set(key K, value V) {
	mm.mu.Lock()
	defer mm.mu.Unlock()
	mm.m[key] = value
}

// Replace atomically swaps the entire underlying map.
func (mm *MutexMap[K, V]) Replace(m map[K]V) {
	mm.mu.Lock()
	defer mm.mu.Unlock()
	mm.m = m
}

// Len returns the number of entries.
func (mm *MutexMap[K, V]) Len() int {
	mm.mu.RLock()
	defer mm.mu.RUnlock()
	return len(mm.m)
}

// Values returns a snapshot of all values in unspecified order.
func (mm *MutexMap[K, V]) Values() []V {
	mm.mu.RLock()
	defer mm.mu.RUnlock()
	out := make([]V, 0, len(mm.m))
	for _, v := range mm.m {
		out = append(out, v)
	}
	return out
}
