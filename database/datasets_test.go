package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestListDatasetImportCounts(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)

	first, err := store.InsertDataset(ctx, database.InsertDatasetParams{
		Name:          "Import Counts One",
		Slug:          "import-counts-one",
		WowVersion:    "1.12.1",
		BuildVersion:  5875,
		DefaultFlavor: []string{},
		IconBaseUrl:   "",
	})
	require.NoError(t, err)
	second, err := store.InsertDataset(ctx, database.InsertDatasetParams{
		Name:          "Import Counts Two",
		Slug:          "import-counts-two",
		WowVersion:    "1.12.1",
		BuildVersion:  5875,
		DefaultFlavor: []string{},
		IconBaseUrl:   "",
	})
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `
		INSERT INTO dbc_cooldown_spells (dataset_id, spell_id, name, recovery_time_ms, spell_class_set)
		VALUES ($1, 1, 'One', 1000, 1), ($1, 2, 'Two', 2000, 1), ($2, 3, 'Three', 3000, 1)
	`, first.ID, second.ID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO dataset_talent_trees (dataset_id, data) VALUES ($1, '{}')`, second.ID)
	require.NoError(t, err)

	rows, err := store.ListDatasetImportCounts(ctx)
	require.NoError(t, err)

	counts := make(map[string]int32)
	for _, row := range rows {
		if row.DatasetID == first.ID || row.DatasetID == second.ID {
			counts[row.DatasetID.String()+"/"+row.DataType] = row.DataCount
		}
	}
	require.Equal(t, map[string]int32{
		first.ID.String() + "/cooldowns_count":  2,
		second.ID.String() + "/cooldowns_count": 1,
		second.ID.String() + "/has_talents":     1,
	}, counts)
}
