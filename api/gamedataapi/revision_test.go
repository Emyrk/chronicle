package gamedataapi

import (
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicecache"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func revisionTestDataset(t *testing.T, store database.Store, slug string) database.Dataset {
	t.Helper()
	dataset, err := store.InsertDataset(t.Context(), database.InsertDatasetParams{
		Name:          slug,
		Slug:          slug,
		WowVersion:    "1.12.1",
		BuildVersion:  5875,
		DefaultFlavor: []string{},
		IconBaseUrl:   "",
	})
	require.NoError(t, err)
	return dataset
}

func TestMutateDatasetBumpsRevisionAtomically(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	dataset := revisionTestDataset(t, store, "mutate-dataset-revision")
	handler := New(nil, nil, pool, servicecache.New(nil))
	namespaces := []servicecache.Namespace{servicecache.NamespaceSpells}

	require.NoError(t, handler.mutateDataset(ctx, dataset.ID, namespaces, func(tx database.Store) error {
		return tx.UpsertDatasetClassBuffs(ctx, database.UpsertDatasetClassBuffsParams{
			DatasetID: dataset.ID,
			Data:      []byte(`{"committed":true}`),
		})
	}))
	committed, err := store.GetDatasetRevision(ctx, dataset.ID)
	require.NoError(t, err)
	require.Greater(t, committed, dataset.Revision)
	generations, err := store.ListCacheGenerations(ctx)
	require.NoError(t, err)
	require.Len(t, generations, 1)
	committedGeneration := generations[0].Generation

	rollbackErr := errors.New("rollback mutation")
	err = handler.mutateDataset(ctx, dataset.ID, namespaces, func(tx database.Store) error {
		require.NoError(t, tx.UpsertDatasetClassBuffs(ctx, database.UpsertDatasetClassBuffsParams{
			DatasetID: dataset.ID,
			Data:      []byte(`{"committed":false}`),
		}))
		return rollbackErr
	})
	require.ErrorIs(t, err, rollbackErr)
	revision, err := store.GetDatasetRevision(ctx, dataset.ID)
	require.NoError(t, err)
	require.Equal(t, committed, revision)
	generations, err = store.ListCacheGenerations(ctx)
	require.NoError(t, err)
	require.Len(t, generations, 1)
	require.Equal(t, committedGeneration, generations[0].Generation)
	data, err := store.GetDatasetClassBuffs(ctx, dataset.ID)
	require.NoError(t, err)
	require.JSONEq(t, `{"committed":true}`, string(data))
}

func TestMutateDatasetAuthzBumpsRevisionAtomically(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	dataset := revisionTestDataset(t, store, "mutate-dataset-authz-revision")
	handler := New(authz.NewDatabaseOnly(testutil.Logger(t), store), nil, pool, nil)

	require.NoError(t, handler.mutateDatasetAuthz(ctx, dataset.ID, nil, func(tx *authz.AuthzTX) error {
		return tx.UpsertDatasetClassBuffs(ctx, database.UpsertDatasetClassBuffsParams{
			DatasetID: dataset.ID,
			Data:      []byte(`{"committed":true}`),
		})
	}))
	committed, err := store.GetDatasetRevision(ctx, dataset.ID)
	require.NoError(t, err)
	require.Greater(t, committed, dataset.Revision)

	rollbackErr := errors.New("rollback authz mutation")
	err = handler.mutateDatasetAuthz(ctx, dataset.ID, nil, func(tx *authz.AuthzTX) error {
		require.NoError(t, tx.UpsertDatasetClassBuffs(ctx, database.UpsertDatasetClassBuffsParams{
			DatasetID: dataset.ID,
			Data:      []byte(`{"committed":false}`),
		}))
		return rollbackErr
	})
	require.ErrorIs(t, err, rollbackErr)
	revision, err := store.GetDatasetRevision(ctx, dataset.ID)
	require.NoError(t, err)
	require.Equal(t, committed, revision)
}

func TestDerivedDatasetWritesBumpRevision(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	dataset := revisionTestDataset(t, store, "derived-dataset-revision")
	handler := New(authz.NewDatabaseOnly(testutil.Logger(t), store), nil, pool, nil)

	require.NoError(t, handler.deriveClassBuffs(ctx, dataset.ID, nil))
	classBuffRevision, err := store.GetDatasetRevision(ctx, dataset.ID)
	require.NoError(t, err)
	require.Greater(t, classBuffRevision, dataset.Revision)

	require.NoError(t, handler.deriveConsumables(ctx, dataset.ID))
	consumablesRevision, err := store.GetDatasetRevision(ctx, dataset.ID)
	require.NoError(t, err)
	require.Greater(t, consumablesRevision, classBuffRevision)
}
