package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestDisableParallelQueryForTransactionIsLocal(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()

	// Pin one connection so restoration cannot accidentally be checked on a
	// different pool connection. Exercise both commit and rollback.
	_, err = conn.Exec(ctx, "SET max_parallel_workers_per_gather = 2")
	require.NoError(t, err)
	for _, commit := range []bool{true, false} {
		tx, err := conn.Begin(ctx)
		require.NoError(t, err)
		defer func() { _ = tx.Rollback(ctx) }()
		require.NoError(t, database.NewQueries(tx).DisableParallelQueryForTransaction(ctx))

		var setting string
		require.NoError(t, tx.QueryRow(ctx, "SHOW max_parallel_workers_per_gather").Scan(&setting))
		require.Equal(t, "0", setting)
		if commit {
			require.NoError(t, tx.Commit(ctx))
		} else {
			require.NoError(t, tx.Rollback(ctx))
		}
		require.NoError(t, conn.QueryRow(ctx, "SHOW max_parallel_workers_per_gather").Scan(&setting))
		require.Equal(t, "2", setting)
	}
}

func TestRankingsLeaderboardDisablesParallelQuery(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	store, _ := dbtestutil.NewDB(t)

	err := store.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.Exec(ctx, "SET LOCAL max_parallel_workers_per_gather = 2"); err != nil {
			return err
		}
		// InTx reuses the enclosing transaction, letting us inspect the actual
		// settings applied by the production leaderboard wrapper.
		_, err := tx.RankingsLeaderboardNoJIT(ctx, database.RankingsLeaderboardParams{
			InstanceNames: []string{"nonexistent-instance"},
			Metric:        "dps",
			QueryLimit:    50,
		})
		if err != nil {
			return err
		}
		var parallelSetting, jitSetting string
		if err := tx.QueryRow(ctx, "SHOW max_parallel_workers_per_gather").Scan(&parallelSetting); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, "SHOW jit").Scan(&jitSetting); err != nil {
			return err
		}
		require.Equal(t, "0", parallelSetting)
		require.Equal(t, "off", jitSetting)
		return nil
	}, nil)
	require.NoError(t, err)
}
