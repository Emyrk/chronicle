package gamedb

import (
	"context"

	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/lrucache"
	"github.com/google/uuid"
)

// ItemMetadataQuerier is the subset of database.Store needed for item resolution.
type ItemMetadataQuerier interface {
	GetItemTemplateMetadataBatch(ctx context.Context, arg database.GetItemTemplateMetadataBatchParams) ([]database.GetItemTemplateMetadataBatchRow, error)
}

// Composite cache keys — the dataset naturally partitions the shared LRU so
// hot datasets stay warm and cold ones get evicted.
type itemIDKey struct {
	DatasetID uuid.UUID
	ItemID    int
}

type itemNameKey struct {
	DatasetID uuid.UUID
	Name      string
}

// itemFetcher resolves custom/transmog item IDs to real item template entries.
// Two LRU caches with composite keys (dataset + id/name):
//   - idCache:   (dataset, itemID) → resolved itemID (0 = not found)
//   - nameCache: (dataset, itemName) → resolved itemID (0 = not found)
type itemFetcher struct {
	db  ItemMetadataQuerier
	ctx context.Context

	idCache   *lrucache.Cache[itemIDKey, int]
	nameCache *lrucache.Cache[itemNameKey, int]
}

func newItemFetcher(ctx context.Context, db ItemMetadataQuerier, cacheSize int, metrics *lrucache.Metrics) *itemFetcher {
	idC, _ := lrucache.New(lrucache.Opts[itemIDKey, int]{
		Name:      "items_id",
		Capacity:  cacheSize,
		Metrics:   metrics,
		DatasetOf: func(k itemIDKey) string { return k.DatasetID.String() },
	})
	nameC, _ := lrucache.New(lrucache.Opts[itemNameKey, int]{
		Name:      "items_name",
		Capacity:  cacheSize,
		Metrics:   metrics,
		DatasetOf: func(k itemNameKey) string { return k.DatasetID.String() },
	})
	return &itemFetcher{
		db:        db,
		ctx:       ctx,
		idCache:   idC,
		nameCache: nameC,
	}
}

// ResolveGear fixes item IDs in a gear slice in-place for the given dataset.
// Items whose ID is already cached (or found by ID in DB) are left as-is.
// Items whose ID is unknown are resolved by name if unique.
func (f *itemFetcher) ResolveGear(datasetID uuid.UUID, gear []combatant.GearItem) {
	if f == nil || len(gear) == 0 || f.db == nil {
		return
	}

	type pending struct {
		idx  int
		id   int32
		name string
	}
	var toResolve []pending

	for i := range gear {
		if gear[i].ItemID == 0 {
			continue
		}

		// Cache hit on item ID
		if resolved, ok := f.idCache.Get(itemIDKey{datasetID, gear[i].ItemID}); ok {
			if resolved != 0 {
				gear[i].ItemID = resolved
			}
			continue
		}

		// Cache hit on item name
		if gear[i].Name != "" {
			if resolved, ok := f.nameCache.Get(itemNameKey{datasetID, gear[i].Name}); ok {
				if resolved != 0 {
					gear[i].ItemID = resolved
				}
				continue
			}
		}

		// Cache miss — queue for resolution
		toResolve = append(toResolve, pending{idx: i, id: int32(gear[i].ItemID), name: gear[i].Name})
	}

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
		DatasetID: datasetID,
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

	for _, p := range toResolve {
		// If the pending ID is in the result, its ID is valid and maps to itself.
		// AKA — No transmog
		if _, ok := byID[p.id]; ok {
			f.idCache.Add(itemIDKey{datasetID, int(p.id)}, int(p.id))
			continue
		}

		// ID doesn't exist — try name resolution
		if p.name != "" {
			if resolved, ok := byName[p.name]; ok {
				gear[p.idx].ItemID = int(resolved)
				f.idCache.Add(itemIDKey{datasetID, int(p.id)}, int(resolved))
				f.nameCache.Add(itemNameKey{datasetID, p.name}, int(resolved))
			} else {
				// Negative cache both
				f.idCache.Add(itemIDKey{datasetID, int(p.id)}, 0)
				f.nameCache.Add(itemNameKey{datasetID, p.name}, 0)
			}
		} else {
			// No name, can't resolve — negative cache ID
			f.idCache.Add(itemIDKey{datasetID, int(p.id)}, 0)
		}
	}
}
