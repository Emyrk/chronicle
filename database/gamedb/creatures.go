package gamedb

import (
	"context"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/lrucache"
	"github.com/google/uuid"
)

// CreatureQuerier is the subset of database.Store needed for creature lookups.
type CreatureQuerier interface {
	GetCreatureTemplatesByEntries(ctx context.Context, arg database.GetCreatureTemplatesByEntriesParams) ([]database.WorldCreatureTemplate, error)
}

type creatureKey struct {
	DatasetID uuid.UUID
	Entry     int32
}

type creatureFetcher struct {
	db  CreatureQuerier
	ctx context.Context

	cache *lrucache.Cache[creatureKey, *database.WorldCreatureTemplate] // nil value = negative cache
}

func newCreatureFetcher(ctx context.Context, db CreatureQuerier, cacheSize int, metrics *lrucache.Metrics) *creatureFetcher {
	c, _ := lrucache.New(lrucache.Opts[creatureKey, *database.WorldCreatureTemplate]{
		Name:      "creatures",
		Capacity:  cacheSize,
		Metrics:   metrics,
		DatasetOf: func(k creatureKey) string { return k.DatasetID.String() },
	})
	return &creatureFetcher{
		db:    db,
		ctx:   ctx,
		cache: c,
	}
}

// Creature returns the creature template for the given entry ID and dataset.
// Returns (nil, false) if the creature is not found or the DB is unavailable.
func (f *creatureFetcher) Creature(datasetID uuid.UUID, entry int32) (*database.WorldCreatureTemplate, bool) {
	if f == nil || f.db == nil || entry == 0 {
		return nil, false
	}

	key := creatureKey{datasetID, entry}
	if c, ok := f.cache.Get(key); ok {
		return c, c != nil
	}

	rows, err := f.db.GetCreatureTemplatesByEntries(f.ctx, database.GetCreatureTemplatesByEntriesParams{
		DatasetID: datasetID,
		Entries:   []int32{entry},
	})
	if err != nil || len(rows) == 0 {
		f.cache.Add(key, nil) // negative cache
		return nil, false
	}

	result := &rows[0]
	f.cache.Add(key, result)
	return result, true
}
