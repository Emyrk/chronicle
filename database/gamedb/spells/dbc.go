package spells

import (
	"context"
	"fmt"
	"sync/atomic"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
)

// DBCFetcher is an explicit Spell.dbc-backed source for tests and offline CLI
// tools. It is intentionally separate from Fetcher so production lookups never
// fall back from PostgreSQL to bundled spell data.
type DBCFetcher struct {
	dbc    *chrondbc.SpellsDBC
	custom map[chrondbc.SpellID]chrondbc.Spell
	names  atomic.Pointer[map[string][]int32]
}

func NewDBCFetcher(dbc *chrondbc.SpellsDBC, custom map[chrondbc.SpellID]chrondbc.Spell) *DBCFetcher {
	f := &DBCFetcher{dbc: dbc, custom: custom}
	f.loadNames()
	return f
}

func (f *DBCFetcher) Spell(_ context.Context, _ uuid.UUID, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	if sp, ok := f.custom[id]; ok {
		return &sp, nil
	}
	return f.dbc.ID(int(id))
}

func (f *DBCFetcher) SpellsByName(ctx context.Context, datasetID uuid.UUID, name string) ([]*chrondbc.Spell, error) {
	m := f.names.Load()
	if m == nil {
		return nil, fmt.Errorf("spell names not loaded")
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

func (f *DBCFetcher) RangeSpells(_ context.Context, _ uuid.UUID, fn func(*chrondbc.Spell) bool) error {
	return f.dbc.Range(func(sp *chrondbc.Spell) bool {
		if sp == nil {
			return true
		}
		return fn(sp)
	})
}

func (f *DBCFetcher) TotalSpells(context.Context, uuid.UUID) (int, error) {
	return f.dbc.Len(), nil
}

func (f *DBCFetcher) InvalidateAll() {}

func (f *DBCFetcher) InvalidateDataset(uuid.UUID) {}

func (f *DBCFetcher) loadNames() {
	names := make(map[string][]int32, f.dbc.Len())
	_ = f.dbc.Range(func(sp *chrondbc.Spell) bool {
		names[sp.Name()] = append(names[sp.Name()], int32(sp.ID))
		return true
	})
	f.names.Store(&names)
}
