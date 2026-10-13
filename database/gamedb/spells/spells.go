// Package spells provides cached, dataset-aware spell lookup from PostgreSQL.
package spells

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/Emyrk/chronicle/internal/lrucache"
	"github.com/Emyrk/chronicle/internal/services/servicecache"
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
// PostgreSQL is the only backing store. Custom synthetic spells still take
// precedence over persisted spell data.
type Fetcher struct {
	pool   *pgxpool.Pool
	cache  *lrucache.Cache[spellKey, entry]
	custom map[chrondbc.SpellID]chrondbc.Spell
}

// NewFetcher creates a database-backed spell fetcher. A nil pool is allowed for
// tests that only exercise custom spells; all other lookups return not-found.
func NewFetcher(pool *pgxpool.Pool, custom map[chrondbc.SpellID]chrondbc.Spell, cacheSvc *servicecache.Service, cacheSize int) *Fetcher {
	cache, _ := servicecache.NewCache(cacheSvc, lrucache.Opts[spellKey, entry]{
		Name:      "spells",
		Capacity:  cacheSize,
		TTL:       servicecache.TTLSpells,
		DatasetOf: func(k spellKey) string { return k.DatasetID.String() },
	})
	return &Fetcher{
		pool:   pool,
		cache:  cache,
		custom: custom,
	}
}

// Spell returns the spell for the given dataset and ID.
func (f *Fetcher) Spell(ctx context.Context, datasetID uuid.UUID, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	if sp, ok := f.custom[id]; ok {
		return &sp, nil
	}

	key := spellKey{DatasetID: datasetID, SpellID: id}
	if e, ok := f.cache.Get(key); ok {
		return e.Spell, e.Error
	}

	if f.pool == nil {
		notFound := chrondbc.SpellNotFound(id)
		f.cache.Add(key, entry{Error: notFound})
		return nil, notFound
	}

	row, err := spelldb.GetSpell(ctx, f.pool, datasetID, int32(id))
	if err != nil {
		notFound := chrondbc.SpellNotFound(id)
		f.cache.Add(key, entry{Error: notFound})
		return nil, notFound
	}
	sp := row.ToSpell()
	f.cache.Add(key, entry{Spell: &sp})
	return &sp, nil
}

// SpellsByName returns all spells matching a name for the given dataset.
func (f *Fetcher) SpellsByName(ctx context.Context, datasetID uuid.UUID, name string) ([]*chrondbc.Spell, error) {
	if f.pool == nil {
		return nil, fmt.Errorf("spell database is not configured")
	}
	rows, err := spelldb.GetSpellsByName(ctx, f.pool, datasetID, name)
	if err != nil {
		return nil, fmt.Errorf("db spell name lookup: %w", err)
	}
	result := make([]*chrondbc.Spell, 0, len(rows))
	for i := range rows {
		sp := rows[i].ToSpell()
		f.cache.Add(spellKey{DatasetID: datasetID, SpellID: sp.ID}, entry{Spell: &sp})
		result = append(result, &sp)
	}
	return result, nil
}

// RangeSpells iterates all persisted spells in a dataset. Return false from the
// callback to stop early.
func (f *Fetcher) RangeSpells(ctx context.Context, datasetID uuid.UUID, fn func(*chrondbc.Spell) bool) error {
	if f.pool == nil {
		return fmt.Errorf("spell database is not configured")
	}
	ids, err := spelldb.ListSpellIDs(ctx, f.pool, datasetID)
	if err != nil {
		return fmt.Errorf("list spell IDs: %w", err)
	}
	for _, id := range ids {
		sp, err := f.Spell(ctx, datasetID, chrondbc.SpellID(id))
		if err != nil {
			return err
		}
		if !fn(sp) {
			break
		}
	}
	return nil
}

// TotalSpells returns the number of persisted spells in a dataset.
func (f *Fetcher) TotalSpells(ctx context.Context, datasetID uuid.UUID) (int, error) {
	if f.pool == nil {
		return 0, fmt.Errorf("spell database is not configured")
	}
	return spelldb.CountSpells(ctx, f.pool, datasetID)
}

// InvalidateDataset evicts all cached entries for a dataset.
func (f *Fetcher) InvalidateDataset(datasetID uuid.UUID) {
	f.cache.RemoveFunc(func(k spellKey) bool {
		return k.DatasetID == datasetID
	})
}
