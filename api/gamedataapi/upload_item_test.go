package gamedataapi

import (
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestApplyItemImportDeletesSyntheticTransmog(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	dataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{
		Name: "Transmog cleanup", Slug: "transmog-cleanup", WowVersion: "1.12.1", BuildVersion: 5875,
		DefaultFlavor: []string{string(database.FlavorNightmareOfUrsol)}, IconBaseUrl: "",
	})
	require.NoError(t, err)

	base := database.WorldItemTemplate{Entry: 3346, Name: "Monster - Item, Shovel"}
	synthetic := base
	synthetic.Entry = 103346
	require.NoError(t, upsertItems(ctx, store, dataset.ID, []database.WorldItemTemplate{base, synthetic}))

	require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
		return applyItemImport(ctx, tx, dataset.ID, nil, []int32{synthetic.Entry})
	}, nil))

	_, err = store.GetItemTemplateByEntry(ctx, database.GetItemTemplateByEntryParams{
		DatasetID: dataset.ID,
		Entry:     synthetic.Entry,
	})
	require.True(t, errors.Is(err, pgx.ErrNoRows))

	storedBase, err := store.GetItemTemplateByEntry(ctx, database.GetItemTemplateByEntryParams{
		DatasetID: dataset.ID,
		Entry:     base.Entry,
	})
	require.NoError(t, err)
	require.Equal(t, base.Name, storedBase.Name)
}
