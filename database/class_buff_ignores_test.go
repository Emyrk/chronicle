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

	upsert := func(datasetID uuid.UUID, name string, ignored bool) {
		t.Helper()
		require.NoError(t, store.UpsertClassBuffIgnore(ctx, database.UpsertClassBuffIgnoreParams{
			DatasetID: datasetID, SpellName: name, Ignored: ignored,
		}))
	}
	upsert(servicedataset.DefaultDatasetID, "  Power Word: Fortitude  ", true)
	upsert(dataset.ID, "power word: fortitude", true)
	upsert(dataset.ID, "Arcane Intellect", false)

	defaultPolicies, err := store.ListClassBuffPoliciesForDataset(ctx, servicedataset.DefaultDatasetID)
	require.NoError(t, err)
	require.Equal(t, []database.ListClassBuffPoliciesForDatasetRow{{
		NormalizedName: "power word: fortitude", Ignored: true,
	}}, defaultPolicies)
	datasetPolicies, err := store.ListClassBuffPoliciesForDataset(ctx, dataset.ID)
	require.NoError(t, err)
	require.Equal(t, []database.ListClassBuffPoliciesForDatasetRow{
		{NormalizedName: "arcane intellect", Ignored: false},
		{NormalizedName: "power word: fortitude", Ignored: true},
	}, datasetPolicies)

	policies, err := store.ListClassBuffIgnorePolicies(ctx)
	require.NoError(t, err)
	require.Len(t, policies, 3)

	require.NoError(t, store.DeleteClassBuffIgnore(ctx, database.DeleteClassBuffIgnoreParams{
		DatasetID: dataset.ID, SpellName: "POWER WORD: FORTITUDE",
	}))
	datasetPolicies, err = store.ListClassBuffPoliciesForDataset(ctx, dataset.ID)
	require.NoError(t, err)
	require.Equal(t, []database.ListClassBuffPoliciesForDatasetRow{{
		NormalizedName: "arcane intellect", Ignored: false,
	}}, datasetPolicies)
	defaultPolicies, err = store.ListClassBuffPoliciesForDataset(ctx, servicedataset.DefaultDatasetID)
	require.NoError(t, err)
	require.Equal(t, []database.ListClassBuffPoliciesForDatasetRow{{
		NormalizedName: "power word: fortitude", Ignored: true,
	}}, defaultPolicies)

	require.NoError(t, store.DeleteDataset(ctx, dataset.ID))
	policies, err = store.ListClassBuffIgnorePolicies(ctx)
	require.NoError(t, err)
	require.Len(t, policies, 1)
}
