package database_test

import (
	"os"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestLeaderboardRawSchemaContract(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	// DDL and test fixture SQL are executed verbatim, not application queries.
	script, err := os.ReadFile("testdata/leaderboard_raw_contract.sql")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "BEGIN")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, string(script))
	require.NoError(t, err)
	store := database.NewQueries(conn)
	tenant := uuid.MustParse("00000000-0000-0000-0001-000000000001")
	observations, err := store.ListLeaderboardPlayerObservations(ctx, tenant)
	require.NoError(t, err)
	require.Len(t, observations, 5)
	subjects, err := store.ListLeaderboardPlayerBossSubjects(ctx, tenant)
	require.NoError(t, err)
	require.Len(t, subjects, 8)
	dirty, err := store.ListLeaderboardDirtyRuns(ctx, tenant)
	require.NoError(t, err)
	require.Len(t, dirty, 1)
	require.Equal(t, int64(1), dirty[0].Revision)
	_, err = conn.Exec(ctx, "ROLLBACK")
	require.NoError(t, err)
}

func TestLeaderboardRawMigrationRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	// Pool connections assume the chronicle RLS role. DDL uses the original
	// migration owner, only within this test's isolated database.
	_, err = conn.Exec(ctx, "RESET ROLE")
	require.NoError(t, err)
	for _, direction := range []string{"down", "up"} {
		script, err := os.ReadFile("migrations/000344_leaderboard_raw_evidence." + direction + ".sql")
		require.NoError(t, err)
		_, err = conn.Exec(ctx, string(script))
		require.NoError(t, err)
	}
	_, err = conn.Exec(ctx, "SET ROLE chronicle")
	require.NoError(t, err)
	store := database.NewQueries(conn)
	rows, err := store.ListLeaderboardDirtyRuns(ctx, uuid.New())
	require.NoError(t, err)
	require.Empty(t, rows)
}
