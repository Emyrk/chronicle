package serviceinference

import (
	"errors"
	"fmt"
	"sort"
	"sync"
)

// Registry stores provider implementations by stable provider ID.
type Registry struct {
	mu        sync.RWMutex
	providers map[ProviderID]Provider
}

func NewRegistry() *Registry {
	return &Registry{providers: make(map[ProviderID]Provider)}
}

func (r *Registry) Register(provider Provider) error {
	if provider == nil {
		return errors.New("inference provider is nil")
	}
	id := provider.ID()
	if id == "" {
		return errors.New("inference provider ID is required")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.providers[id]; exists {
		return fmt.Errorf("inference provider %q is already registered", id)
	}
	r.providers[id] = provider
	return nil
}

func (r *Registry) Provider(id ProviderID) (Provider, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	provider, ok := r.providers[id]
	return provider, ok
}

func (r *Registry) IDs() []ProviderID {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ids := make([]ProviderID, 0, len(r.providers))
	for id := range r.providers {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids
}
