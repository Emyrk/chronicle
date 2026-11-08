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
		script, err := os.ReadFile("migrations/000345_leaderboard_raw_evidence." + direction + ".sql")
		require.NoError(t, err)
		_, err = conn.Exec(ctx, string(script))
		require.NoError(t, err)
	}
	// Restore subsequent additive migrations before exercising the current
	// generated queries: the D1 row now includes ownership/retry columns.
	for _, migration := range []string{
		"000346_leaderboard_player_read_index",
		"000347_leaderboard_peak_provenance",
		"000348_leaderboard_evidence_benchmarks",
		"000349_leaderboard_d2_claims",
		"000350_leaderboard_d1_claims",
		"000351_leaderboard_source_identity_indexes",
	} {
		script, err := os.ReadFile("migrations/" + migration + ".up.sql")
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
