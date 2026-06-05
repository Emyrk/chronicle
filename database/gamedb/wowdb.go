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
	"github.com/Gophercraft/core/format/dbc"
	"github.com/google/uuid"
)

// GameDB is the read interface for game data during parsing. Both [WoWDB] and
// [ScopedGameDB] implement it.
type GameDB interface {
	SpellFetcher
	GearResolver
	CreatureFetcher
	TalentTreeFetcher
}

// TalentTreeFetcher loads pre-computed talent tree data per dataset.
type TalentTreeFetcher interface {
	TalentTrees(ctx context.Context, datasetID uuid.UUID) (*talents.TalentTreeData, error)
}

// SpellFetcher looks up spells by ID.
type SpellFetcher interface {
	Spell(id chrondbc.SpellID) (*chrondbc.Spell, error)
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
	DatasetID     uuid.UUID              // Default dataset for item/creature lookups.
	Talents       talents.TalentFetcher
	Metrics       *lrucache.Metrics      // nil disables cache instrumentation.
}

// WoWDB holds all game data sources used during parsing and API serving.
// Call [WoWDB.ForDataset] to get a scoped view that routes item/creature
// lookups to a specific dataset while sharing the same underlying caches.
type WoWDB struct {
	ctx       context.Context
	spellFile *os.File
	datasetID uuid.UUID

	spells          *spells.Fetcher
	itemFetcher     *itemFetcher
	creatureFetcher *creatureFetcher
	talents         talents.TalentFetcher
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
	spellFetcher := spells.NewFetcher(ctx, spDBC, customSpells, 1000, opts.Metrics)

	return &WoWDB{
		ctx:             ctx,
		spellFile:       sf,
		datasetID:       opts.DatasetID,
		spells:          spellFetcher,
		itemFetcher:     newItemFetcher(ctx, opts.DB, 400, opts.Metrics),
		creatureFetcher: newCreatureFetcher(ctx, opts.DB, 500, opts.Metrics),
		talents:         opts.Talents,
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

func (w *WoWDB) Spell(id chrondbc.SpellID) (*chrondbc.Spell, error) {
	return w.spells.Spell(id)
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

func (w *WoWDB) TotalSpells() int                          { return w.spells.TotalSpells() }
func (w *WoWDB) SpellByName(name string) ([]int32, error)  { return w.spells.SpellByName(name) }
func (w *WoWDB) RangeSpells(f func(*chrondbc.Spell) bool) error { return w.spells.RangeSpells(f) }

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

func (s *ScopedGameDB) Spell(id chrondbc.SpellID) (*chrondbc.Spell, error) {
	return s.w.spells.Spell(id)
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
