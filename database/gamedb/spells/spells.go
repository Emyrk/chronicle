// Package spells provides a cached spell lookup backed by a DBC file.
package spells

import (
	"context"
	"fmt"
	"sync/atomic"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/lrucache"
)

// entry is a cache value that stores both the result and any error (negative
// caching for SpellNotFound).
type entry struct {
	Spell *chrondbc.Spell
	Error error
}

// Fetcher looks up spells by ID with LRU caching. It also provides name-based
// lookup after an asynchronous index build completes.
type Fetcher struct {
	dbc    *chrondbc.SpellsDBC
	cache  *lrucache.Cache[chrondbc.SpellID, entry]
	custom map[chrondbc.SpellID]chrondbc.Spell

	// names is populated asynchronously after construction.
	names atomic.Pointer[map[string][]int32]
}

// NewFetcher creates a Fetcher backed by the given DBC and custom spell overrides.
// Spell name index is loaded in a background goroutine.
func NewFetcher(ctx context.Context, dbc *chrondbc.SpellsDBC, custom map[chrondbc.SpellID]chrondbc.Spell, cacheSize int, metrics *lrucache.Metrics) *Fetcher {
	cache, _ := lrucache.New(lrucache.Opts[chrondbc.SpellID, entry]{
		Name:     "spells",
		Capacity: cacheSize,
		Metrics:  metrics,
		// Spells are not dataset-scoped (yet).
	})
	f := &Fetcher{
		dbc:    dbc,
		cache:  cache,
		custom: custom,
	}
	go f.loadNames(ctx)
	return f
}

// Spell returns the spell for the given ID, checking custom overrides first,
// then the LRU cache, then the DBC file. Not-found errors are cached.
func (f *Fetcher) Spell(id chrondbc.SpellID) (*chrondbc.Spell, error) {
	if sp, ok := f.custom[id]; ok {
		return &sp, nil
	}

	if e, ok := f.cache.Get(id); ok {
		return e.Spell, e.Error
	}

	sp, err := f.dbc.ID(int(id))
	if err != nil {
		if chrondbc.IsSpellNotFound(err) {
			f.cache.Add(id, entry{Error: err})
		}
		return nil, err
	}

	f.cache.Add(id, entry{Spell: sp})
	return sp, nil
}

// SpellByName returns spell IDs matching the given name.
// Returns an error if the name index is still loading.
func (f *Fetcher) SpellByName(name string) ([]int32, error) {
	m := f.names.Load()
	if m == nil {
		return nil, fmt.Errorf("spell names not loaded yet")
	}
	ids, ok := (*m)[name]
	if !ok {
		return nil, fmt.Errorf("spell not found: %s", name)
	}
	return ids, nil
}

// RangeSpells iterates all spells in the DBC, calling f for each.
// Return false from the callback to stop early.
func (f *Fetcher) RangeSpells(fn func(*chrondbc.Spell) bool) error {
	return f.dbc.Range(func(sp *chrondbc.Spell) bool {
		if sp == nil {
			return true
		}
		return fn(sp)
	})
}

// TotalSpells returns the number of spells in the DBC.
func (f *Fetcher) TotalSpells() int {
	return f.dbc.Len()
}

func (f *Fetcher) loadNames(_ context.Context) {
	names := make(map[string][]int32, f.dbc.Len())
	_ = f.dbc.Range(func(cursor *chrondbc.Spell) bool {
		names[cursor.Name()] = append(names[cursor.Name()], int32(cursor.ID))
		return true
	})
	f.names.Store(&names)
}
