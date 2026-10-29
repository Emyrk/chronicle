package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestDisableJITForTransactionIsLocal(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	store, _ := dbtestutil.NewDB(t)

	var defaultSetting string
	require.NoError(t, store.QueryRow(ctx, "SHOW jit").Scan(&defaultSetting))

	err := store.InTx(ctx, func(tx database.Store) error {
		_, err := tx.Exec(ctx, "SET LOCAL jit = on")
		if err != nil {
			return err
		}
		if err := tx.DisableJITForTransaction(ctx); err != nil {
			return err
		}

		var setting string
		if err := tx.QueryRow(ctx, "SHOW jit").Scan(&setting); err != nil {
			return err
		}
		require.Equal(t, "off", setting)
		return nil
	}, nil)
	require.NoError(t, err)

	var restoredSetting string
	require.NoError(t, store.QueryRow(ctx, "SHOW jit").Scan(&restoredSetting))
	require.Equal(t, defaultSetting, restoredSetting)
}
