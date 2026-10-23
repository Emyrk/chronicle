package gamedb

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/lrucache"
	"github.com/Emyrk/chronicle/internal/services/servicecache"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestItemAndCreatureDatasetInvalidation(t *testing.T) {
	t.Parallel()

	cacheSvc := servicecache.New(nil)
	idCache, err := servicecache.NewCache(nil, lrucache.Opts[itemIDKey, int]{Name: "test_items_id", Capacity: 10})
	require.NoError(t, err)
	nameCache, err := servicecache.NewCache(nil, lrucache.Opts[itemNameKey, int]{Name: "test_items_name", Capacity: 10})
	require.NoError(t, err)
	creatureCache, err := servicecache.NewCache(nil, lrucache.Opts[creatureKey, *database.WorldCreatureTemplate]{Name: "test_creatures", Capacity: 10})
	require.NoError(t, err)

	targetDataset := uuid.New()
	otherDataset := uuid.New()
	items := &itemFetcher{idCache: idCache, nameCache: nameCache}
	creatures := &creatureFetcher{cache: creatureCache}
	wowDB := &WoWDB{itemFetcher: items, creatureFetcher: creatures}
	require.NoError(t, wowDB.registerInvalidators(cacheSvc))

	targetIDKey := itemIDKey{DatasetID: targetDataset, ItemID: 100}
	targetNameKey := itemNameKey{DatasetID: targetDataset, Name: "missing item"}
	otherIDKey := itemIDKey{DatasetID: otherDataset, ItemID: 100}
	targetCreatureKey := creatureKey{DatasetID: targetDataset, Entry: 200}
	otherCreatureKey := creatureKey{DatasetID: otherDataset, Entry: 200}

	idCache.Add(targetIDKey, 0)
	nameCache.Add(targetNameKey, 0)
	idCache.Add(otherIDKey, 0)
	creatureCache.Add(targetCreatureKey, nil)
	creatureCache.Add(otherCreatureKey, nil)

	require.NoError(t, cacheSvc.Invalidate(context.Background(), servicecache.DatasetInvalidation(servicecache.NamespaceItems, targetDataset)))
	_, ok := idCache.Get(targetIDKey)
	require.False(t, ok)
	_, ok = nameCache.Get(targetNameKey)
	require.False(t, ok)
	_, ok = idCache.Get(otherIDKey)
	require.True(t, ok)

	require.NoError(t, cacheSvc.Invalidate(context.Background(), servicecache.DatasetInvalidation(servicecache.NamespaceCreatures, targetDataset)))
	_, ok = creatureCache.Get(targetCreatureKey)
	require.False(t, ok)
	_, ok = creatureCache.Get(otherCreatureKey)
	require.True(t, ok)
}
