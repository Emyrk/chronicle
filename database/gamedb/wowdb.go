// TODO: Add a database backing and LRU caching system for WoW data.
// TODO: Flesh out all the params and data the structures can have
package gamedb

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync/atomic"

	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Gophercraft/core/format/dbc"
	lru "github.com/hashicorp/golang-lru/v2"
)

type GameDB interface {
	SpellFetcher
	GearResolver
}

type SpellFetcher interface {
	Spell(id chrondbc.SpellID) (*chrondbc.Spell, error)
}

type GearResolver interface {
	ResolveGear(gear []combatant.GearItem)
}

type Options struct {
	SpellsDBCPath string
	DB            ItemMetadataQuerier
}

type SpellEntry struct {
	Spell *chrondbc.Spell
	Error error
}

type WoWDB struct {
	ctx        context.Context
	spellFiles *os.File
	spells     *chrondbc.SpellsDBC
	spellLRU   *lru.Cache[chrondbc.SpellID, SpellEntry]

	// spellNames is a READONLY map
	spellNames atomic.Pointer[map[string][]int32]

	itemFetcher *itemFetcher
}

func New(ctx context.Context, opts Options) (*WoWDB, error) {
	build := services.ServerBuild
	if dbcdb.SpellBuildOverride != 0 {
		build = dbcdb.SpellBuildOverride
	}
	db := dbc.NewDB(build)
	sf, err := os.Open(opts.SpellsDBCPath)
	if err != nil {
		return nil, err
	}

	v, err := db.Open("Spell", sf)
	if err != nil {
		return nil, err
	}

	// Responses are already cached by the client browser, so not sure how useful
	// this really is.
	// Kara40 has ~800 unique spells.
	c, err := lru.New[chrondbc.SpellID, SpellEntry](1000)
	if err != nil {
		return nil, fmt.Errorf("lru: %w", err)
	}

	spDBC := chrondbc.NewSpells(v)

	wdb := &WoWDB{
		ctx:         ctx,
		spellLRU:    c,
		spellFiles:  sf,
		spells:      spDBC,
		itemFetcher: newItemFetcher(ctx, opts.DB, 400),
	}
	go func() {
		spNames, err := loadSpellName(ctx, spDBC)
		if err != nil {
			return
			//return fmt.Errorf("load spell names: %w", err)
		}

		wdb.spellNames.Store(&spNames)
	}()

	return wdb, nil
}

func (w *WoWDB) TotalSpells() int {
	return w.spells.Len()
}

func (w *WoWDB) SpellByName(name string) ([]int32, error) {
	m := w.spellNames.Load()
	if m == nil {
		return nil, fmt.Errorf("spell names not loaded yet")
	}

	ids, ok := (*m)[name]
	if !ok {
		return nil, fmt.Errorf("spell not found: %s", name)
	}
	return ids, nil
}

func loadSpellName(ctx context.Context, spDBC *chrondbc.SpellsDBC) (map[string][]int32, error) {
	spellNames := make(map[string][]int32, spDBC.Len())
	err := spDBC.Range(func(cursor *chrondbc.Spell) bool {
		spellNames[cursor.Name()] = append(spellNames[cursor.Name()], int32(cursor.ID))
		return true
	})

	//go func() {
	//	spellNameDifferences(ctx, spDBC, spellNames)
	//}()

	return spellNames, err
}

func (w *WoWDB) RangeSpells(f func(*chrondbc.Spell) bool) error {
	return w.spells.Range(func(sp *chrondbc.Spell) bool {
		if sp == nil {
			return true
		}
		return f(sp)
	})
}

func (w *WoWDB) Spell(id chrondbc.SpellID) (*chrondbc.Spell, error) {
	if envSpell, ok := customSpells[id]; ok {
		return &envSpell, nil
	}

	if sp, ok := w.spellLRU.Get(id); ok {
		return sp.Spell, sp.Error
	}
	sp, err := w.spells.ID(int(id))
	if err != nil {
		if strings.Contains(err.Error(), "couldn't find record matching ID") {
			w.spellLRU.Add(id, SpellEntry{Spell: sp, Error: err})
		}
		return nil, err
	}

	w.spellLRU.Add(id, SpellEntry{Spell: sp, Error: err})
	return sp, nil
}

func (w *WoWDB) ResolveGear(gear []combatant.GearItem) {
	w.itemFetcher.ResolveGear(gear)
}

func (w *WoWDB) Close() error {
	_ = w.spellFiles.Close()
	return nil
}
