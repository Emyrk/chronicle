package gamedb

import (
	"context"
	"fmt"
	"os"

	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
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

// TODO: Any remaining frontend technical pages backed by compiled-in constants
// should become dataset-aware API endpoints so non-default datasets show the
// correct generated game data.

// GameDB is the read interface for game data during parsing. Both [WoWDB] and
// [ScopedGameDB] implement it.
type GameDB interface {
	SpellFetcher
	GearResolver
	CreatureFetcher
	TalentTreeFetcher
	ExtraAttackSpell(ctx context.Context, spellID int32) (chrondbc.ExtraAttackSpell, bool)
	DurationModifiers(ctx context.Context) (*chrondbc.DurationModifierSet, error)
	PeriodicSpells(ctx context.Context) (map[int32]chrondbc.PeriodicSpell, error)
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
	// SpellsDBCPath explicitly selects a Spell.dbc-backed source for tests and
	// offline CLI tools. Production callers provide Pool and use PostgreSQL.
	SpellsDBCPath string
	DB            WorldQuerier
	Pool          *pgxpool.Pool
	DatasetID     uuid.UUID // Default dataset for item/creature lookups.
	Talents       talents.TalentFetcher
	CacheSvc      *servicecache.Service // Centralized cache service; all caches register here.
}

// spellSource is implemented by the database-backed runtime fetcher and the
// explicit DBC source used by tests and offline CLI tools.
type spellSource interface {
	Spell(context.Context, uuid.UUID, chrondbc.SpellID) (*chrondbc.Spell, error)
	SpellsByName(context.Context, uuid.UUID, string) ([]*chrondbc.Spell, error)
	RangeSpells(context.Context, uuid.UUID, func(*chrondbc.Spell) bool) error
	TotalSpells(context.Context, uuid.UUID) (int, error)
	InvalidateDataset(uuid.UUID)
	InvalidateAll()
}

// WoWDB holds all game data sources used during parsing and API serving.
// Call [WoWDB.ForDataset] to get a scoped view that routes item/creature
// lookups to a specific dataset while sharing the same underlying caches.
type WoWDB struct {
	ctx       context.Context
	spellFile *os.File // Non-nil only for explicit DBC-backed offline use.
	datasetID uuid.UUID
	pool      *pgxpool.Pool // For DB-backed derived data queries.
	store     database.Store

	spells          spellSource
	itemFetcher     *itemFetcher
	creatureFetcher *creatureFetcher
	talents         talents.TalentFetcher

	// Per-dataset caches for derived spell data.
	extraAttacks   *lrucache.Cache[uuid.UUID, map[int32]chrondbc.ExtraAttackSpell]
	durationMods   *lrucache.Cache[uuid.UUID, *chrondbc.DurationModifierSet]
	periodicSpells *lrucache.Cache[uuid.UUID, map[int32]chrondbc.PeriodicSpell]
}

// New creates a WoWDB. When Pool is configured, spell lookups are strictly
// database-backed. SpellsDBCPath is only used when Pool is nil, for tests and
// offline CLI tools; call [WoWDB.Close] to release that file.
func New(ctx context.Context, opts Options) (*WoWDB, error) {
	eaCache, _ := servicecache.NewCache(opts.CacheSvc, lrucache.Opts[uuid.UUID, map[int32]chrondbc.ExtraAttackSpell]{
		Capacity: 64, Name: "extra_attacks", TTL: servicecache.TTLExtraAttacks,
	})
	dmCache, _ := servicecache.NewCache(opts.CacheSvc, lrucache.Opts[uuid.UUID, *chrondbc.DurationModifierSet]{
		Capacity: 64, Name: "duration_mods", TTL: servicecache.TTLDurationMods,
	})
	psCache, _ := servicecache.NewCache(opts.CacheSvc, lrucache.Opts[uuid.UUID, map[int32]chrondbc.PeriodicSpell]{
		Capacity: 64, Name: "periodic_spells", TTL: servicecache.TTLPeriodicSpells,
	})

	var store database.Store
	if opts.Pool != nil {
		store = database.New(opts.Pool)
	}

	var spellFetcher spellSource
	var sf *os.File

	if opts.Pool != nil {
		spellFetcher = spells.NewFetcher(opts.Pool, customSpells, opts.CacheSvc, 1000)
	} else {
		if opts.SpellsDBCPath == "" {
			return nil, fmt.Errorf("either Pool or SpellsDBCPath must be configured")
		}
		build := services.ServerBuild
		if dbcdb.SpellBuildOverride != 0 {
			build = dbcdb.SpellBuildOverride
		}
		dbInst := dbc.NewDB(build)
		var err error
		sf, err = os.Open(opts.SpellsDBCPath)
		if err != nil {
			return nil, err
		}

		v, err := dbInst.Open("Spell", sf)
		if err != nil {
			_ = sf.Close()
			return nil, err
		}

		spellFetcher = spells.NewDBCFetcher(chrondbc.NewSpells(v), customSpells)
	}

	w := &WoWDB{
		ctx:             ctx,
		spellFile:       sf, // nil in DB-only mode
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
	}
	if err := w.registerInvalidators(opts.CacheSvc); err != nil {
		_ = w.Close()
		return nil, err
	}
	return w, nil
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

// --- Delegated spell helpers (used by HTTP API and CLI tooling) ---

func (w *WoWDB) TotalSpells() (int, error) {
	return w.spells.TotalSpells(w.ctx, w.datasetID)
}
func (w *WoWDB) SpellsByName(ctx context.Context, name string) ([]*chrondbc.Spell, error) {
	return w.spells.SpellsByName(ctx, w.datasetID, name)
}
func (w *WoWDB) RangeSpells(f func(*chrondbc.Spell) bool) error {
	return w.spells.RangeSpells(w.ctx, w.datasetID, f)
}

// --- Derived spell data resolvers (default dataset) ---

func (w *WoWDB) ExtraAttackSpell(ctx context.Context, spellID int32) (chrondbc.ExtraAttackSpell, bool) {
	return w.extraAttackSpell(ctx, w.datasetID, spellID)
}

// ExtraAttackSpells returns the full extra-attack spell map for a dataset.
func (w *WoWDB) ExtraAttackSpells(ctx context.Context, datasetID uuid.UUID) map[int32]chrondbc.ExtraAttackSpell {
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

func (w *WoWDB) PeriodicSpells(ctx context.Context) (map[int32]chrondbc.PeriodicSpell, error) {
	return w.periodicSpells_(ctx, w.datasetID)
}

// Internal methods parameterised by datasetID so ScopedGameDB can reuse them.

func (w *WoWDB) extraAttackSpell(ctx context.Context, datasetID uuid.UUID, spellID int32) (chrondbc.ExtraAttackSpell, bool) {
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
	ms, err := w.loadDurationModifiers(ctx, datasetID)
	if err != nil {
		return nil, err
	}
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
	itemNamesByID := make(map[int32]string)
	itemsBySpell := make(map[chrondbc.SpellID][]int32)
	itemsByDirectSpell := make(map[chrondbc.SpellID][]int32)
	for _, row := range rows {
		if _, seen := itemSet[row.ItemID]; !seen {
			// Rows repeat per buff spell; record the direct use spells once.
			for _, spellID := range row.ItemSpellIds {
				sid := chrondbc.SpellID(spellID)
				itemsByDirectSpell[sid] = append(itemsByDirectSpell[sid], row.ItemID)
			}
		}
		itemSet[row.ItemID] = struct{}{}
		itemNamesByID[row.ItemID] = row.ItemName
		if row.BuffSpellID.Valid {
			spellID := chrondbc.SpellID(row.BuffSpellID.Int32)
			itemsBySpell[spellID] = append(itemsBySpell[spellID], row.ItemID)
		}
	}

	itemIDs := make([]int32, 0, len(itemSet))
	for itemID := range itemSet {
		itemIDs = append(itemIDs, itemID)
	}
	return chrondbc.NewConsumableCatalogWithItemNames(itemIDs, itemNamesByID, itemsBySpell, itemsByDirectSpell), nil
}

func (w *WoWDB) periodicSpells_(ctx context.Context, datasetID uuid.UUID) (map[int32]chrondbc.PeriodicSpell, error) {
	if m, ok := w.periodicSpells.Get(datasetID); ok {
		return m, nil
	}
	m, err := w.loadPeriodicSpells(ctx, datasetID)
	if err != nil {
		return nil, err
	}
	w.periodicSpells.Add(datasetID, m)
	return m, nil
}

// --- Database-backed derived spell data ---

func (w *WoWDB) loadExtraAttacks(ctx context.Context, datasetID uuid.UUID) map[int32]chrondbc.ExtraAttackSpell {
	m := make(map[int32]chrondbc.ExtraAttackSpell)
	if w.pool == nil {
		return m
	}
	rows, err := w.pool.Query(ctx,
		`SELECT spell_id, name, num_extra_attacks FROM dbc_extra_attack_spells WHERE dataset_id = $1`, datasetID)
	if err != nil {
		return m
	}
	defer rows.Close()
	for rows.Next() {
		var id, num int32
		var name string
		if err := rows.Scan(&id, &name, &num); err != nil {
			return make(map[int32]chrondbc.ExtraAttackSpell)
		}
		m[id] = chrondbc.ExtraAttackSpell{Name: name, NumExtraAttacks: num}
	}
	return m
}

func (w *WoWDB) loadDurationModifiers(ctx context.Context, datasetID uuid.UUID) (*chrondbc.DurationModifierSet, error) {
	ms := &chrondbc.DurationModifierSet{
		ByID:       make(map[int32]chrondbc.DurationModifier),
		ByClassBit: make(map[int32]map[uint64][]int32),
	}
	if w.pool == nil {
		return ms, nil
	}
	rows, err := w.pool.Query(ctx,
		`SELECT spell_id, name, percent, flat, deprecated, spell_class_set, spell_class_mask FROM dbc_duration_modifiers WHERE dataset_id = $1`, datasetID)
	if err != nil {
		return nil, fmt.Errorf("query duration modifiers: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var mod chrondbc.DurationModifier
		var classSet int32
		var classMask int64
		if err := rows.Scan(&mod.SpellID, &mod.Name, &mod.Percent, &mod.Flat, &mod.Deprecated, &classSet, &classMask); err != nil {
			return nil, fmt.Errorf("scan duration modifier: %w", err)
		}
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
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate duration modifiers: %w", err)
	}
	return ms, nil
}

func (w *WoWDB) loadPeriodicSpells(ctx context.Context, datasetID uuid.UUID) (map[int32]chrondbc.PeriodicSpell, error) {
	m := make(map[int32]chrondbc.PeriodicSpell)
	if w.pool == nil {
		return m, nil
	}
	rows, err := w.pool.Query(ctx,
		`SELECT spell_id, name, has_direct FROM dbc_periodic_spells WHERE dataset_id = $1`, datasetID)
	if err != nil {
		return nil, fmt.Errorf("query periodic spells: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id int32
		var name string
		var hasDirect bool
		if err := rows.Scan(&id, &name, &hasDirect); err != nil {
			return nil, fmt.Errorf("scan periodic spell: %w", err)
		}
		m[id] = chrondbc.PeriodicSpell{Name: name, HasDirect: hasDirect}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate periodic spells: %w", err)
	}
	return m, nil
}

// --- Invalidation ---

func (w *WoWDB) registerInvalidators(cacheSvc *servicecache.Service) error {
	if cacheSvc == nil {
		return nil
	}
	type registration struct {
		namespace      servicecache.Namespace
		name           string
		datasetHandler servicecache.InvalidationHandler
		globalHandler  servicecache.InvalidationHandler
	}
	registrations := []registration{
		{servicecache.NamespaceSpells, "wowdb_spells", func(_ context.Context, req servicecache.Invalidation) error {
			w.spells.InvalidateDataset(req.DatasetID)
			return nil
		}, func(context.Context, servicecache.Invalidation) error {
			w.spells.InvalidateAll()
			return nil
		}},
		{servicecache.NamespaceItems, "wowdb_items", func(_ context.Context, req servicecache.Invalidation) error {
			w.itemFetcher.invalidateDataset(req.DatasetID)
			return nil
		}, func(context.Context, servicecache.Invalidation) error {
			w.itemFetcher.invalidateAll()
			return nil
		}},
		{servicecache.NamespaceCreatures, "wowdb_creatures", func(_ context.Context, req servicecache.Invalidation) error {
			w.creatureFetcher.invalidateDataset(req.DatasetID)
			return nil
		}, func(context.Context, servicecache.Invalidation) error {
			w.creatureFetcher.invalidateAll()
			return nil
		}},
		{servicecache.NamespaceExtraAttacks, "wowdb_extra_attacks", func(_ context.Context, req servicecache.Invalidation) error {
			w.extraAttacks.Remove(req.DatasetID)
			return nil
		}, func(context.Context, servicecache.Invalidation) error {
			w.extraAttacks.Purge()
			return nil
		}},
		{servicecache.NamespaceDurationMods, "wowdb_duration_modifiers", func(_ context.Context, req servicecache.Invalidation) error {
			w.durationMods.Remove(req.DatasetID)
			return nil
		}, func(context.Context, servicecache.Invalidation) error {
			w.durationMods.Purge()
			return nil
		}},
		{servicecache.NamespacePeriodicSpells, "wowdb_periodic_spells", func(_ context.Context, req servicecache.Invalidation) error {
			w.periodicSpells.Remove(req.DatasetID)
			return nil
		}, func(context.Context, servicecache.Invalidation) error {
			w.periodicSpells.Purge()
			return nil
		}},
	}
	if w.talents != nil {
		registrations = append(registrations, registration{servicecache.NamespaceTalents, "wowdb_talents", func(_ context.Context, req servicecache.Invalidation) error {
			w.talents.InvalidateDataset(req.DatasetID)
			return nil
		}, func(context.Context, servicecache.Invalidation) error {
			w.talents.InvalidateAll()
			return nil
		}})
	}
	for _, registration := range registrations {
		if err := cacheSvc.RegisterInvalidator(registration.namespace, servicecache.ScopeDataset, registration.name+"_dataset", registration.datasetHandler); err != nil {
			return fmt.Errorf("register %s dataset cache invalidator: %w", registration.namespace, err)
		}
		if err := cacheSvc.RegisterInvalidator(registration.namespace, servicecache.ScopeGlobal, registration.name+"_global", registration.globalHandler); err != nil {
			return fmt.Errorf("register %s global cache invalidator: %w", registration.namespace, err)
		}
	}
	return nil
}

func (w *WoWDB) Close() error {
	if w.spellFile != nil {
		_ = w.spellFile.Close()
	}
	return nil
}

// DatasetHasDBSpells reports whether the given dataset has imported spells in
// the dbc_spells table. Used by resync to validate that DB-only spell mode
// will work before deleting parsed data.
func (w *WoWDB) DatasetHasDBSpells(ctx context.Context, datasetID uuid.UUID) (bool, error) {
	if w.pool == nil {
		return false, fmt.Errorf("no database pool configured")
	}
	var has bool
	err := w.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM dbc_spells WHERE dataset_id = $1)`,
		datasetID,
	).Scan(&has)
	if err != nil {
		return false, fmt.Errorf("check dataset spells: %w", err)
	}
	return has, nil
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

func (s *ScopedGameDB) ExtraAttackSpell(ctx context.Context, spellID int32) (chrondbc.ExtraAttackSpell, bool) {
	return s.w.extraAttackSpell(ctx, s.datasetID, spellID)
}

func (s *ScopedGameDB) DurationModifiers(ctx context.Context) (*chrondbc.DurationModifierSet, error) {
	return s.w.durationModifiers(ctx, s.datasetID)
}

func (s *ScopedGameDB) Consumables(ctx context.Context) (*chrondbc.ConsumableCatalog, error) {
	return s.w.consumables(ctx, s.datasetID)
}

func (s *ScopedGameDB) PeriodicSpells(ctx context.Context) (map[int32]chrondbc.PeriodicSpell, error) {
	return s.w.periodicSpells_(ctx, s.datasetID)
}
