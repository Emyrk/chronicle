package database_test

import (
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

func insertRevisionDataset(t *testing.T, store database.Store, slug string) database.Dataset {
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

func TestDatasetRevisionCommitAndRollback(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	defaultRevision, err := store.GetDatasetRevision(ctx, uuid.MustParse("00000000-0000-0000-0000-000000000001"))
	require.NoError(t, err)
	require.EqualValues(t, 1, defaultRevision)

	dataset := insertRevisionDataset(t, store, "revision-commit-rollback")
	initial := dataset.Revision
	require.Positive(t, initial)

	var committed int64
	require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
		var err error
		committed, err = tx.BumpDatasetRevision(ctx, dataset.ID)
		return err
	}, nil))
	require.Greater(t, committed, initial)
	revision, err := store.GetDatasetRevision(ctx, dataset.ID)
	require.NoError(t, err)
	require.Equal(t, committed, revision)

	rollbackErr := errors.New("rollback revision")
	err = store.InTx(ctx, func(tx database.Store) error {
		bumped, err := tx.BumpDatasetRevision(ctx, dataset.ID)
		require.NoError(t, err)
		require.Greater(t, bumped, committed)
		return rollbackErr
	}, nil)
	require.ErrorIs(t, err, rollbackErr)
	revision, err = store.GetDatasetRevision(ctx, dataset.ID)
	require.NoError(t, err)
	require.Equal(t, committed, revision)
}

func TestDatasetRevisionDeleteRecreateDoesNotReuseRevision(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	datasetID := uuid.New()

	insert := func(slug string) int64 {
		_, err := pool.Exec(ctx, `
			INSERT INTO datasets (id, name, slug, wow_version, build_version, default_flavor, icon_base_url)
			VALUES ($1, $2, $2, '1.12.1', 5875, '{}', '')
		`, datasetID, slug)
		require.NoError(t, err)
		revision, err := store.GetDatasetRevision(ctx, datasetID)
		require.NoError(t, err)
		return revision
	}

	first := insert("revision-recreate-first")
	require.NoError(t, store.DeleteDataset(ctx, datasetID))
	second := insert("revision-recreate-second")
	require.Greater(t, second, first)
}

func TestLockDatasetRevisionFencesMutation(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	dataset := insertRevisionDataset(t, store, "revision-lock-fence")

	lockTx, err := pool.Begin(ctx)
	require.NoError(t, err)
	t.Cleanup(func() { _ = lockTx.Rollback(ctx) })
	locked, err := database.NewQueries(lockTx).LockDatasetRevision(ctx, dataset.ID)
	require.NoError(t, err)
	require.Equal(t, dataset.Revision, locked)

	mutationTx, err := pool.Begin(ctx)
	require.NoError(t, err)
	t.Cleanup(func() { _ = mutationTx.Rollback(ctx) })
	_, err = mutationTx.Exec(ctx, `SET LOCAL lock_timeout = '100ms'`)
	require.NoError(t, err)
	_, err = database.NewQueries(mutationTx).BumpDatasetRevision(ctx, dataset.ID)
	var pgErr *pgconn.PgError
	require.ErrorAs(t, err, &pgErr)
	require.Equal(t, "55P03", pgErr.Code)
	require.NoError(t, mutationTx.Rollback(ctx))

	require.NoError(t, lockTx.Commit(ctx))
	bumped, err := store.BumpDatasetRevision(ctx, dataset.ID)
	require.NoError(t, err)
	require.Greater(t, bumped, locked)
}
