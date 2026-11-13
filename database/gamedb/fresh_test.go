package gamedb

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func TestFreshForDatasetDoesNotShareCaches(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	// Pool construction is lazy: this test performs no database/network queries.
	pool, err := pgxpool.New(ctx, "postgres://postgres@127.0.0.1:1/unused?sslmode=disable")
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	datasetID := uuid.New()
	store := database.New(pool)
	shared, err := New(ctx, Options{Pool: pool, DB: store, DatasetID: datasetID, Talents: talents.NewFetcher(store, nil, 1)})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, shared.Close()) })
	shared.itemFetcher.idCache.Add(itemIDKey{datasetID, 1}, 42)
	shared.itemFetcher.nameCache.Add(itemNameKey{datasetID, "stale"}, 42)
	shared.creatureFetcher.cache.Add(creatureKey{datasetID, 1}, &database.WorldCreatureTemplate{})
	shared.extraAttacks.Add(datasetID, map[int32]chrondbc.ExtraAttackSpell{1: {}})
	shared.durationMods.Add(datasetID, &chrondbc.DurationModifierSet{})
	shared.periodicSpells.Add(datasetID, map[int32]chrondbc.PeriodicSpell{1: {}})

	first, err := shared.FreshForDataset(ctx, datasetID)
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, first.Close()) })
	second, err := shared.FreshForDataset(ctx, datasetID)
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, second.Close()) })
	for _, fresh := range []*WoWDB{first, second} {
		require.Equal(t, datasetID, fresh.datasetID)
		require.Same(t, pool, fresh.pool)
		require.NotSame(t, shared.spells, fresh.spells)
		require.NotSame(t, shared.talents, fresh.talents)
		require.Zero(t, fresh.itemFetcher.idCache.Len())
		require.Zero(t, fresh.itemFetcher.nameCache.Len())
		require.Zero(t, fresh.creatureFetcher.cache.Len())
		require.Zero(t, fresh.extraAttacks.Len())
		require.Zero(t, fresh.durationMods.Len())
		require.Zero(t, fresh.periodicSpells.Len())
	}
	require.NotSame(t, first.spells, second.spells)
	require.NotSame(t, first.talents, second.talents)
	first.itemFetcher.idCache.Add(itemIDKey{datasetID, 1}, 99)
	_, exists := second.itemFetcher.idCache.Get(itemIDKey{datasetID, 1})
	require.False(t, exists)
	cached, exists := shared.itemFetcher.idCache.Get(itemIDKey{datasetID, 1})
	require.True(t, exists)
	require.Equal(t, 42, cached)
}

func TestFreshForDatasetRejectsNonDatabaseSource(t *testing.T) {
	t.Parallel()
	_, err := (&WoWDB{}).FreshForDataset(t.Context(), uuid.New())
	require.ErrorContains(t, err, "PostgreSQL-backed")
}
