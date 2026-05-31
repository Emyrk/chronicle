package gamedb

import (
	"context"
	"sync"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	lru "github.com/hashicorp/golang-lru/v2"
)

// CreatureQuerier is the subset of database.Store needed for creature lookups.
type CreatureQuerier interface {
	GetCreatureTemplatesByEntries(ctx context.Context, arg database.GetCreatureTemplatesByEntriesParams) ([]database.WorldCreatureTemplate, error)
}

// CreatureFetcher resolves creature entry IDs to their template data.
type CreatureFetcher interface {
	Creature(entry int32) (*database.WorldCreatureTemplate, bool)
}

type creatureFetcher struct {
	db        CreatureQuerier
	ctx       context.Context
	datasetID uuid.UUID

	mu    sync.Mutex
	cache *lru.Cache[int32, *database.WorldCreatureTemplate] // nil value = negative cache
}

func newCreatureFetcher(ctx context.Context, db CreatureQuerier, datasetID uuid.UUID, cacheSize int) *creatureFetcher {
	c, _ := lru.New[int32, *database.WorldCreatureTemplate](cacheSize)
	return &creatureFetcher{
		db:        db,
		ctx:       ctx,
		datasetID: datasetID,
		cache:     c,
	}
}

// Creature returns the creature template for the given entry ID.
// Returns (nil, false) if the creature is not found or the DB is unavailable.
func (f *creatureFetcher) Creature(entry int32) (*database.WorldCreatureTemplate, bool) {
	if f == nil || f.db == nil || entry == 0 {
		return nil, false
	}

	f.mu.Lock()
	if c, ok := f.cache.Get(entry); ok {
		f.mu.Unlock()
		return c, c != nil
	}
	f.mu.Unlock()

	rows, err := f.db.GetCreatureTemplatesByEntries(f.ctx, database.GetCreatureTemplatesByEntriesParams{
		DatasetID: f.datasetID,
		Entries:   []int32{entry},
	})
	if err != nil || len(rows) == 0 {
		f.mu.Lock()
		f.cache.Add(entry, nil) // negative cache
		f.mu.Unlock()
		return nil, false
	}

	result := &rows[0]
	f.mu.Lock()
	f.cache.Add(entry, result)
	f.mu.Unlock()
	return result, true
}
