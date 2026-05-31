package gamedb

import (
	"context"
	"sync"

	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	lru "github.com/hashicorp/golang-lru/v2"
)

// ItemMetadataQuerier is the subset of database.Store needed for item resolution.
type ItemMetadataQuerier interface {
	GetItemTemplateMetadataBatch(ctx context.Context, arg database.GetItemTemplateMetadataBatchParams) ([]database.GetItemTemplateMetadataBatchRow, error)
}

// ItemFetcher resolves custom/transmog item IDs to real item template entries.
// Two LRU caches:
//   - idCache:   itemID → itemID (correct IDs map to themselves, unknown IDs map to 0)
//   - nameCache: itemName → itemID (for name-based fallback resolution)
type itemFetcher struct {
	db        ItemMetadataQuerier
	ctx       context.Context
	datasetID uuid.UUID

	mu        sync.Mutex
	idCache   *lru.Cache[int, int]    // itemID → resolved itemID (0 = not found)
	nameCache *lru.Cache[string, int] // itemName → resolved itemID (0 = not found)
}

func newItemFetcher(ctx context.Context, db ItemMetadataQuerier, datasetID uuid.UUID, cacheSize int) *itemFetcher {
	idC, _ := lru.New[int, int](cacheSize)
	nameC, _ := lru.New[string, int](cacheSize)
	return &itemFetcher{
		db:        db,
		ctx:       ctx,
		datasetID: datasetID,
		idCache:   idC,
		nameCache: nameC,
	}
}

// ResolveGear fixes item IDs in a gear slice in-place.
// Items whose ID is already cached (or found by ID in DB) are left as-is.
// Items whose ID is unknown are resolved by name if unique.
func (f *itemFetcher) ResolveGear(gear []combatant.GearItem) {
	if f == nil || len(gear) == 0 || f.db == nil {
		return
	}

	type pending struct {
		idx  int
		id   int32
		name string
	}
	var toResolve []pending

	f.mu.Lock()
	for i := range gear {
		if gear[i].ItemID == 0 {
			continue
		}

		// Cache hit on item ID
		if resolved, ok := f.idCache.Get(gear[i].ItemID); ok {
			if resolved != 0 {
				gear[i].ItemID = resolved
			}
			continue
		}

		// Cache hit on item name
		if gear[i].Name != "" {
			if resolved, ok := f.nameCache.Get(gear[i].Name); ok {
				if resolved != 0 {
					gear[i].ItemID = resolved
				}
				continue
			}
		}

		// Cache miss — queue for resolution
		toResolve = append(toResolve, pending{idx: i, id: int32(gear[i].ItemID), name: gear[i].Name})
	}
	f.mu.Unlock()

	if len(toResolve) == 0 {
		return
	}

	// Batch query
	ids := make([]int32, len(toResolve))
	names := make([]string, len(toResolve))
	for i, p := range toResolve {
		ids[i] = p.id
		names[i] = p.name
	}

	rows, err := f.db.GetItemTemplateMetadataBatch(f.ctx, database.GetItemTemplateMetadataBatchParams{
		DatasetID: f.datasetID,
		ItemIds:   ids,
		ItemNames: names,
	})
	if err != nil {
		return // silently skip on DB error
	}

	byID := make(map[int32]int32, len(rows))
	byName := make(map[string]int32, len(rows))
	for _, row := range rows {
		byID[row.Entry] = row.Entry
		byName[row.Name] = row.Entry
	}

	f.mu.Lock()
	defer f.mu.Unlock()

	for _, p := range toResolve {
		// Add to the caches

		// If the pending ID is in the result, it's ID is valid and maps to itself.
		// AKA -- No transmog
		if _, ok := byID[p.id]; ok {
			// ID exists in DB — cache it mapping to itself
			// No change is required the original gear.
			f.idCache.Add(int(p.id), int(p.id))
			continue
		}

		// ID doesn't exist — try name resolution
		if p.name != "" {
			if resolved, ok := byName[p.name]; ok {
				gear[p.idx].ItemID = int(resolved)
				f.idCache.Add(int(p.id), int(resolved))
				f.nameCache.Add(p.name, int(resolved))
			} else {
				// Negative cache both
				f.idCache.Add(int(p.id), 0)
				f.nameCache.Add(p.name, 0)
			}
		} else {
			// No name, can't resolve — negative cache ID
			f.idCache.Add(int(p.id), 0)
		}
	}
}
