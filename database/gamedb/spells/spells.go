// Package spells provides a cached, dataset-aware spell lookup.
//
// Resolution order for Spell(datasetID, spellID):
//  1. Custom spells (synthetic entries like auto-attack, environment damage)
//  2. LRU cache keyed by (datasetID, spellID)
//  3. Database (dbc_spells table)
//  4. Compiled-in DBC file (fallback for the default dataset or when DB has no row)
//
// Call InvalidateDataset to flush cached entries after a spell import.
package spells

import (
	"context"
	"fmt"
	"sync/atomic"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/Emyrk/chronicle/internal/lrucache"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// spellKey is the composite cache key for dataset-scoped spell lookups.
type spellKey struct {
	DatasetID uuid.UUID
	SpellID   chrondbc.SpellID
}

// entry is a cache value that stores both the result and any error (negative
// caching for SpellNotFound).
type entry struct {
	Spell *chrondbc.Spell
	Error error
}

// Fetcher looks up spells by (datasetID, spellID) with LRU caching.
// It checks the database first, then falls back to the compiled-in DBC file.
type Fetcher struct {
	pool   *pgxpool.Pool // nil = DB lookups disabled (tests, CLI)
	dbc    *chrondbc.SpellsDBC
	cache  *lrucache.Cache[spellKey, entry]
	custom map[chrondbc.SpellID]chrondbc.Spell

	// hasDBSpells caches whether a dataset has any spells in the database.
	// Once true, DB misses are treated as not-found (no DBC fallback).
	// Invalidated per-dataset when new spells are imported.
	hasDBSpells *lrucache.Cache[uuid.UUID, bool]

	// names is the compiled-in DBC name index, populated asynchronously.
	names atomic.Pointer[map[string][]int32]
}

// NewFetcher creates a Fetcher backed by the database and a compiled-in DBC
// fallback. pool may be nil to disable DB lookups (for tests or CLI tools).
// Spell name index is loaded in a background goroutine from the DBC file.
func NewFetcher(ctx context.Context, pool *pgxpool.Pool, dbc *chrondbc.SpellsDBC, custom map[chrondbc.SpellID]chrondbc.Spell, cacheSize int, metrics *lrucache.Metrics) *Fetcher {
	cache, _ := lrucache.New(lrucache.Opts[spellKey, entry]{
		Name:      "spells",
		Capacity:  cacheSize,
		Metrics:   metrics,
		DatasetOf: func(k spellKey) string { return k.DatasetID.String() },
	})
	hasDB, _ := lrucache.New(lrucache.Opts[uuid.UUID, bool]{
		Name:     "spells_has_db",
		Capacity: 64,
		Metrics:  metrics,
	})
	f := &Fetcher{
		pool:        pool,
		dbc:         dbc,
		cache:       cache,
		hasDBSpells: hasDB,
		custom:      custom,
	}
	go f.loadNames(ctx)
	return f
}

// Spell returns the spell for the given dataset + ID.
//
// Resolution: custom → cache → DB (if dataset has imported spells) →
// compiled-in DBC (only if dataset has no imported spells) → not-found.
//
// Once a dataset has spells in the database, a DB miss is authoritative:
// the spell doesn't exist for that dataset. The compiled-in DBC is only
// used as a fallback when no spells have been imported for the dataset.
func (f *Fetcher) Spell(ctx context.Context, datasetID uuid.UUID, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	// Custom spells (auto-attack, environment) always win.
	if sp, ok := f.custom[id]; ok {
		return &sp, nil
	}

	key := spellKey{DatasetID: datasetID, SpellID: id}
	if e, ok := f.cache.Get(key); ok {
		return e.Spell, e.Error
	}

	if f.pool != nil && f.datasetHasDBSpells(ctx, datasetID) {
		// Dataset has imported spells — DB is authoritative.
		row, err := spelldb.GetSpell(ctx, f.pool, datasetID, int32(id))
		if err == nil {
			sp := row.ToSpell()
			f.cache.Add(key, entry{Spell: &sp})
			return &sp, nil
		}
		// DB miss = not found for this dataset. Negative-cache it.
		notFound := chrondbc.SpellNotFound(id)
		f.cache.Add(key, entry{Error: notFound})
		return nil, notFound
	}

	// No DB spells for this dataset — use compiled-in DBC.
	sp, err := f.dbc.ID(int(id))
	if err != nil {
		if chrondbc.IsSpellNotFound(err) {
			f.cache.Add(key, entry{Error: err})
		}
		return nil, err
	}

	f.cache.Add(key, entry{Spell: sp})
	return sp, nil
}

// datasetHasDBSpells checks whether the dataset has any spells in the
// dbc_spells table. Result is cached per dataset and invalidated on import.
func (f *Fetcher) datasetHasDBSpells(ctx context.Context, datasetID uuid.UUID) bool {
	if has, ok := f.hasDBSpells.Get(datasetID); ok {
		return has
	}

	var has bool
	err := f.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM dbc_spells WHERE dataset_id = $1)`,
		datasetID,
	).Scan(&has)
	if err != nil {
		has = false
	}
	f.hasDBSpells.Add(datasetID, has)
	return has
}

// SpellsByName returns all spells matching a name for the given dataset.
// If the dataset has DB-backed spells, queries dbc_spells directly.
// Otherwise falls back to the compiled-in DBC name index + Spell() lookups.
func (f *Fetcher) SpellsByName(ctx context.Context, datasetID uuid.UUID, name string) ([]*chrondbc.Spell, error) {
	if f.pool != nil && f.datasetHasDBSpells(ctx, datasetID) {
		rows, err := spelldb.GetSpellsByName(ctx, f.pool, datasetID, name)
		if err != nil {
			return nil, fmt.Errorf("db spell name lookup: %w", err)
		}
		result := make([]*chrondbc.Spell, 0, len(rows))
		for i := range rows {
			sp := rows[i].ToSpell()
			result = append(result, &sp)
		}
		return result, nil
	}

	// Compiled-in DBC fallback.
	m := f.names.Load()
	if m == nil {
		return nil, fmt.Errorf("spell names not loaded yet")
	}
	ids, ok := (*m)[name]
	if !ok {
		return nil, fmt.Errorf("spell not found: %s", name)
	}
	result := make([]*chrondbc.Spell, 0, len(ids))
	for _, id := range ids {
		sp, err := f.Spell(ctx, datasetID, chrondbc.SpellID(id))
		if err != nil {
			continue
		}
		result = append(result, sp)
	}
	return result, nil
}

// InvalidateDataset evicts all cached entries for a dataset (including the
// "has DB spells" flag). Call after importing new spell data so subsequent
// lookups hit the database.
func (f *Fetcher) InvalidateDataset(datasetID uuid.UUID) {
	f.cache.RemoveFunc(func(k spellKey) bool {
		return k.DatasetID == datasetID
	})
	f.hasDBSpells.Remove(datasetID)
}

// RangeSpells iterates all spells in the compiled-in DBC, calling fn for each.
// Return false from the callback to stop early.
func (f *Fetcher) RangeSpells(fn func(*chrondbc.Spell) bool) error {
	return f.dbc.Range(func(sp *chrondbc.Spell) bool {
		if sp == nil {
			return true
		}
		return fn(sp)
	})
}

// TotalSpells returns the number of spells in the compiled-in DBC.
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
