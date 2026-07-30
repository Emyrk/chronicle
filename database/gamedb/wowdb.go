package gamedb

import (
	"context"
	"fmt"
	"os"

	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"
	"github.com/Emyrk/chronicle/database/gamedb/spells"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/Emyrk/chronicle/internal/lrucache"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicecache"
	"github.com/Gophercraft/core/format/dbc"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TODO: The frontend "Technical" pages (ExtraAttackSpellsPage, VulnerabilitySpellsPage,
// AuraDurationModifiersPage) read from compiled-in TS constants generated per build tag
// (frontend/chronicle/src/constants/dbmem/{server}/*.ts, aliased via tsconfig). These
// should become dataset-aware API endpoints so the correct data is shown for non-default
// datasets. The constants are consumed via @/constants/dbmem/ExtraAttack, etc.

// GameDB is the read interface for game data during parsing. Both [WoWDB] and
// [ScopedGameDB] implement it.
type GameDB interface {
	SpellFetcher
	GearResolver
	CreatureFetcher
	TalentTreeFetcher
	ExtraAttackSpell(ctx context.Context, spellID int32) (dbcmem.ExtraAttackSpell, bool)
	DurationModifiers(ctx context.Context) (*chrondbc.DurationModifierSet, error)
	PeriodicSpells(ctx context.Context) (map[int32]dbcmem.PeriodicSpell, error)
}

// TalentTreeFetcher loads pre-computed talent tree data per dataset.
type TalentTreeFetcher interface {
	TalentTrees(ctx context.Context, datasetID uuid.UUID) (*talents.TalentTreeData, error)
}

// SpellFetcher looks up spells, scoped to a dataset.
type SpellFetcher interface {
	Spell(ctx context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error)
	SpellsByName(ctx context.Context, name string) ([]*chrondbc.Spell, error)
}

// GearResolver resolves item IDs/names in a gear slice in-place.
type GearResolver interface {
	ResolveGear(gear []combatant.GearItem)
}

// CreatureFetcher resolves creature entry IDs to their template data.
type CreatureFetcher interface {
	Creature(entry int32) (*database.WorldCreatureTemplate, bool)
}

// WorldQuerier combines all database query interfaces needed by GameDB.
type WorldQuerier interface {
	ItemMetadataQuerier
	CreatureQuerier
}

// Options configures a new [WoWDB].
type Options struct {
	SpellsDBCPath string
	DB            WorldQuerier
	Pool          *pgxpool.Pool // For DB-backed spell lookups; nil = DBC-only.
	DatasetID     uuid.UUID     // Default dataset for item/creature lookups.
	Talents       talents.TalentFetcher
	CacheSvc      *servicecache.Service // Centralized cache service; all caches register here.
}

// WoWDB holds all game data sources used during parsing and API serving.
// Call [WoWDB.ForDataset] to get a scoped view that routes item/creature
// lookups to a specific dataset while sharing the same underlying caches.
type WoWDB struct {
	ctx       context.Context
	spellFile *os.File
	datasetID uuid.UUID
	pool      *pgxpool.Pool // For DB-backed derived data queries; nil = fallback to compiled-in globals.
	store     database.Store

	spells          *spells.Fetcher
	itemFetcher     *itemFetcher
	creatureFetcher *creatureFetcher
	talents         talents.TalentFetcher

	// Per-dataset caches for derived spell data.
	extraAttacks   *lrucache.Cache[uuid.UUID, map[int32]dbcmem.ExtraAttackSpell]
	durationMods   *lrucache.Cache[uuid.UUID, *chrondbc.DurationModifierSet]
	periodicSpells *lrucache.Cache[uuid.UUID, map[int32]dbcmem.PeriodicSpell]
}

// New creates a WoWDB. The spell DBC file is opened and held for the lifetime
// of the returned value; call [WoWDB.Close] to release it.
func New(ctx context.Context, opts Options) (*WoWDB, error) {
	build := services.ServerBuild
	if dbcdb.SpellBuildOverride != 0 {
		build = dbcdb.SpellBuildOverride
	}
	dbInst := dbc.NewDB(build)
	sf, err := os.Open(opts.SpellsDBCPath)
	if err != nil {
		return nil, err
	}

	v, err := dbInst.Open("Spell", sf)
	if err != nil {
		return nil, err
	}

	spDBC := chrondbc.NewSpells(v)
	spellFetcher := spells.NewFetcher(ctx, opts.Pool, spDBC, customSpells, opts.CacheSvc, 1000)

	eaCache, _ := servicecache.NewCache(opts.CacheSvc, lrucache.Opts[uuid.UUID, map[int32]dbcmem.ExtraAttackSpell]{
		Capacity: 64, Name: "extra_attacks", TTL: servicecache.TTLExtraAttacks,
	})
	dmCache, _ := servicecache.NewCache(opts.CacheSvc, lrucache.Opts[uuid.UUID, *chrondbc.DurationModifierSet]{
		Capacity: 64, Name: "duration_mods", TTL: servicecache.TTLDurationMods,
	})
	psCache, _ := servicecache.NewCache(opts.CacheSvc, lrucache.Opts[uuid.UUID, map[int32]dbcmem.PeriodicSpell]{
		Capacity: 64, Name: "periodic_spells", TTL: servicecache.TTLPeriodicSpells,
	})

	var store database.Store
	if opts.Pool != nil {
		store = database.New(opts.Pool)
	}

	return &WoWDB{
		ctx:             ctx,
		spellFile:       sf,
		datasetID:       opts.DatasetID,
		pool:            opts.Pool,
		store:           store,
		spells:          spellFetcher,
		itemFetcher:     newItemFetcher(ctx, opts.DB, opts.CacheSvc, 400),
		creatureFetcher: newCreatureFetcher(ctx, opts.DB, opts.CacheSvc, 500),
		talents:         opts.Talents,
		extraAttacks:    eaCache,
		durationMods:    dmCache,
		periodicSpells:  psCache,
	}, nil
}

// ForDataset returns a [GameDB] scoped to the given dataset. Item and creature
// lookups use the provided dataset ID while sharing the same underlying LRU
// caches (composite keys naturally partition entries). When datasetID equals
// the WoWDB's default, the receiver itself is returned — zero overhead.
func (w *WoWDB) ForDataset(datasetID uuid.UUID) GameDB {
	if datasetID == w.datasetID {
		return w
	}
	return &ScopedGameDB{w: w, datasetID: datasetID}
}

// --- GameDB interface (default dataset) ---

func (w *WoWDB) Spell(ctx context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	return w.spells.Spell(ctx, w.datasetID, id)
}

func (w *WoWDB) ResolveGear(gear []combatant.GearItem) {
	w.itemFetcher.ResolveGear(w.datasetID, gear)
}

func (w *WoWDB) Creature(entry int32) (*database.WorldCreatureTemplate, bool) {
	return w.creatureFetcher.Creature(w.datasetID, entry)
}

func (w *WoWDB) TalentTrees(ctx context.Context, datasetID uuid.UUID) (*talents.TalentTreeData, error) {
	if w.talents == nil {
		return nil, fmt.Errorf("talent fetcher not configured")
	}
	return w.talents.TalentTrees(ctx, datasetID)
}

// --- Delegated spell helpers (used by HTTP API) ---

func (w *WoWDB) TotalSpells() int { return w.spells.TotalSpells() }
func (w *WoWDB) SpellsByName(ctx context.Context, name string) ([]*chrondbc.Spell, error) {
	return w.spells.SpellsByName(ctx, w.datasetID, name)
}
func (w *WoWDB) RangeSpells(f func(*chrondbc.Spell) bool) error { return w.spells.RangeSpells(f) }

// --- Derived spell data resolvers (default dataset) ---

func (w *WoWDB) ExtraAttackSpell(ctx context.Context, spellID int32) (dbcmem.ExtraAttackSpell, bool) {
	return w.extraAttackSpell(ctx, w.datasetID, spellID)
}

// ExtraAttackSpells returns the full extra-attack spell map for a dataset.
func (w *WoWDB) ExtraAttackSpells(ctx context.Context, datasetID uuid.UUID) map[int32]dbcmem.ExtraAttackSpell {
	m, ok := w.extraAttacks.Get(datasetID)
	if !ok {
		m = w.loadExtraAttacks(ctx, datasetID)
		w.extraAttacks.Add(datasetID, m)
	}
	return m
}

func (w *WoWDB) DurationModifiers(ctx context.Context) (*chrondbc.DurationModifierSet, error) {
	return w.durationModifiers(ctx, w.datasetID)
}

func (w *WoWDB) Consumables(ctx context.Context) (*chrondbc.ConsumableCatalog, error) {
	return w.consumables(ctx, w.datasetID)
}

func (w *WoWDB) PeriodicSpells(ctx context.Context) (map[int32]dbcmem.PeriodicSpell, error) {
	return w.periodicSpells_(ctx, w.datasetID)
}

// Internal methods parameterised by datasetID so ScopedGameDB can reuse them.

func (w *WoWDB) extraAttackSpell(ctx context.Context, datasetID uuid.UUID, spellID int32) (dbcmem.ExtraAttackSpell, bool) {
	m, ok := w.extraAttacks.Get(datasetID)
	if !ok {
		m = w.loadExtraAttacks(ctx, datasetID)
		w.extraAttacks.Add(datasetID, m)
	}
	ea, found := m[spellID]
	return ea, found
}

func (w *WoWDB) durationModifiers(ctx context.Context, datasetID uuid.UUID) (*chrondbc.DurationModifierSet, error) {
	if ms, ok := w.durationMods.Get(datasetID); ok {
		return ms, nil
	}
	ms := w.loadDurationModifiers(ctx, datasetID)
	w.durationMods.Add(datasetID, ms)
	return ms, nil
}

func (w *WoWDB) consumables(ctx context.Context, datasetID uuid.UUID) (*chrondbc.ConsumableCatalog, error) {
	if w.store == nil {
		return nil, nil
	}

	rows, err := w.store.ListConsumablesByDataset(ctx, datasetID)
	if err != nil {
		return nil, fmt.Errorf("list consumable catalog: %w", err)
	}

	itemSet := make(map[int32]struct{})
	itemsBySpell := make(map[chrondbc.SpellID][]int32)
	for _, row := range rows {
		itemSet[row.ItemID] = struct{}{}
		if row.BuffSpellID.Valid {
			spellID := chrondbc.SpellID(row.BuffSpellID.Int32)
			itemsBySpell[spellID] = append(itemsBySpell[spellID], row.ItemID)
		}
	}

	itemIDs := make([]int32, 0, len(itemSet))
	for itemID := range itemSet {
		itemIDs = append(itemIDs, itemID)
	}
	return chrondbc.NewConsumableCatalog(itemIDs, itemsBySpell), nil
}

func (w *WoWDB) periodicSpells_(ctx context.Context, datasetID uuid.UUID) (map[int32]dbcmem.PeriodicSpell, error) {
	if m, ok := w.periodicSpells.Get(datasetID); ok {
		return m, nil
	}
	m := w.loadPeriodicSpells(ctx, datasetID)
	w.periodicSpells.Add(datasetID, m)
	return m, nil
}

// --- Load functions (DB with compiled-in fallback) ---

func (w *WoWDB) loadExtraAttacks(ctx context.Context, datasetID uuid.UUID) map[int32]dbcmem.ExtraAttackSpell {
	if w.pool != nil {
		rows, err := w.pool.Query(ctx,
			`SELECT spell_id, name, num_extra_attacks FROM dbc_extra_attack_spells WHERE dataset_id = $1`, datasetID)
		if err == nil {
			defer rows.Close()
			m := make(map[int32]dbcmem.ExtraAttackSpell)
			for rows.Next() {
				var id, num int32
				var name string
				if err := rows.Scan(&id, &name, &num); err == nil {
					m[id] = dbcmem.ExtraAttackSpell{Name: name, NumExtraAttacks: num}
				}
			}
			if len(m) > 0 {
				return m
			}
		}
	}
	// Fallback to compiled-in globals.
	return dbcmem.ExtraAttackSpells
}

func (w *WoWDB) loadDurationModifiers(ctx context.Context, datasetID uuid.UUID) *chrondbc.DurationModifierSet {
	if w.pool != nil {
		rows, err := w.pool.Query(ctx,
			`SELECT spell_id, name, percent, flat, deprecated, spell_class_set, spell_class_mask FROM dbc_duration_modifiers WHERE dataset_id = $1`, datasetID)
		if err == nil {
			defer rows.Close()
			ms := &chrondbc.DurationModifierSet{
				ByID:       make(map[int32]dbcmem.DurationModifier),
				ByClassBit: make(map[int32]map[uint64][]int32),
			}
			for rows.Next() {
				var mod dbcmem.DurationModifier
				var classSet int32
				var classMask int64
				if err := rows.Scan(&mod.SpellID, &mod.Name, &mod.Percent, &mod.Flat, &mod.Deprecated, &classSet, &classMask); err == nil {
					ms.ByID[mod.SpellID] = mod
					mask := uint64(classMask)
					if _, ok := ms.ByClassBit[classSet]; !ok {
						ms.ByClassBit[classSet] = make(map[uint64][]int32)
					}
					for bit := uint64(0); bit < 64; bit++ {
						b := uint64(1) << bit
						if mask&b != 0 {
							ms.ByClassBit[classSet][b] = append(ms.ByClassBit[classSet][b], mod.SpellID)
						}
					}
				}
			}
			if len(ms.ByID) > 0 {
				return ms
			}
		}
	}
	// Fallback to compiled-in globals.
	return &chrondbc.DurationModifierSet{
		ByID:       dbcmem.DurationModifiers,
		ByClassBit: dbcmem.DurationModifiersByClassBit,
	}
}

func (w *WoWDB) loadPeriodicSpells(ctx context.Context, datasetID uuid.UUID) map[int32]dbcmem.PeriodicSpell {
	if w.pool != nil {
		rows, err := w.pool.Query(ctx,
			`SELECT spell_id, name, has_direct FROM dbc_periodic_spells WHERE dataset_id = $1`, datasetID)
		if err == nil {
			defer rows.Close()
			m := make(map[int32]dbcmem.PeriodicSpell)
			for rows.Next() {
				var id int32
				var name string
				var hasDirect bool
				if err := rows.Scan(&id, &name, &hasDirect); err == nil {
					m[id] = dbcmem.PeriodicSpell{Name: name, HasDirect: hasDirect}
				}
			}
			if len(m) > 0 {
				return m
			}
		}
	}
	// Fallback to compiled-in globals.
	return dbcmem.PeriodicSpells
}

// --- Invalidation ---

// InvalidateSpellCache evicts all cached spells for a dataset. Call after
// importing new spell data so subsequent lookups hit the database.
func (w *WoWDB) InvalidateSpellCache(datasetID uuid.UUID) {
	w.spells.InvalidateDataset(datasetID)
}

// InvalidateExtraAttacks evicts cached extra-attack data for a dataset.
func (w *WoWDB) InvalidateExtraAttacks(datasetID uuid.UUID) {
	w.extraAttacks.Remove(datasetID)
}

// InvalidateDurationModifiers evicts cached duration modifier data for a dataset.
func (w *WoWDB) InvalidateDurationModifiers(datasetID uuid.UUID) {
	w.durationMods.Remove(datasetID)
}

// InvalidatePeriodicSpells evicts cached periodic spell data for a dataset.
func (w *WoWDB) InvalidatePeriodicSpells(datasetID uuid.UUID) {
	w.periodicSpells.Remove(datasetID)
}

func (w *WoWDB) Close() error {
	_ = w.spellFile.Close()
	return nil
}

// ScopedGameDB routes item/creature lookups to a specific dataset while sharing
// the parent WoWDB's caches. Created via [WoWDB.ForDataset].
type ScopedGameDB struct {
	w         *WoWDB
	datasetID uuid.UUID
}

func (s *ScopedGameDB) Spell(ctx context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	return s.w.spells.Spell(ctx, s.datasetID, id)
}

func (s *ScopedGameDB) SpellsByName(ctx context.Context, name string) ([]*chrondbc.Spell, error) {
	return s.w.spells.SpellsByName(ctx, s.datasetID, name)
}

func (s *ScopedGameDB) ResolveGear(gear []combatant.GearItem) {
	s.w.itemFetcher.ResolveGear(s.datasetID, gear)
}

func (s *ScopedGameDB) Creature(entry int32) (*database.WorldCreatureTemplate, bool) {
	return s.w.creatureFetcher.Creature(s.datasetID, entry)
}

func (s *ScopedGameDB) TalentTrees(ctx context.Context, datasetID uuid.UUID) (*talents.TalentTreeData, error) {
	return s.w.TalentTrees(ctx, datasetID)
}

func (s *ScopedGameDB) ExtraAttackSpell(ctx context.Context, spellID int32) (dbcmem.ExtraAttackSpell, bool) {
	return s.w.extraAttackSpell(ctx, s.datasetID, spellID)
}

func (s *ScopedGameDB) DurationModifiers(ctx context.Context) (*chrondbc.DurationModifierSet, error) {
	return s.w.durationModifiers(ctx, s.datasetID)
}

func (s *ScopedGameDB) Consumables(ctx context.Context) (*chrondbc.ConsumableCatalog, error) {
	return s.w.consumables(ctx, s.datasetID)
}

func (s *ScopedGameDB) PeriodicSpells(ctx context.Context) (map[int32]dbcmem.PeriodicSpell, error) {
	return s.w.periodicSpells_(ctx, s.datasetID)
}
