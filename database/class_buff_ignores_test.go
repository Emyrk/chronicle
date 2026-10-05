package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestClassBuffIgnores(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)

	dataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{
		Name: "Buff Ignore Dataset", Slug: "buff-ignore-dataset", WowVersion: "1.12.1",
		BuildVersion: 5875, DefaultFlavor: []string{},
	})
	require.NoError(t, err)

	upsert := func(datasetID uuid.UUID, name string) {
		t.Helper()
		require.NoError(t, store.UpsertClassBuffIgnore(ctx, database.UpsertClassBuffIgnoreParams{
			DatasetID: datasetID, SpellName: name,
		}))
	}
	upsert(servicedataset.DefaultDatasetID, "  Power Word: Fortitude  ")
	upsert(dataset.ID, "power word: fortitude")
	upsert(dataset.ID, "Arcane Intellect")

	defaultNames, err := store.ListClassBuffIgnoresForDataset(ctx, servicedataset.DefaultDatasetID)
	require.NoError(t, err)
	require.Equal(t, []string{"power word: fortitude"}, defaultNames)
	datasetNames, err := store.ListClassBuffIgnoresForDataset(ctx, dataset.ID)
	require.NoError(t, err)
	require.Equal(t, []string{"arcane intellect", "power word: fortitude"}, datasetNames)

	policies, err := store.ListClassBuffIgnorePolicies(ctx)
	require.NoError(t, err)
	require.Len(t, policies, 3)

	require.NoError(t, store.DeleteClassBuffIgnore(ctx, database.DeleteClassBuffIgnoreParams{
		DatasetID: dataset.ID, SpellName: "POWER WORD: FORTITUDE",
	}))
	datasetNames, err = store.ListClassBuffIgnoresForDataset(ctx, dataset.ID)
	require.NoError(t, err)
	require.Equal(t, []string{"arcane intellect"}, datasetNames)
	defaultNames, err = store.ListClassBuffIgnoresForDataset(ctx, servicedataset.DefaultDatasetID)
	require.NoError(t, err)
	require.Equal(t, []string{"power word: fortitude"}, defaultNames)

	require.NoError(t, store.DeleteDataset(ctx, dataset.ID))
	policies, err = store.ListClassBuffIgnorePolicies(ctx)
	require.NoError(t, err)
	require.Len(t, policies, 1)
}
