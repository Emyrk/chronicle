package leaderboardconfig_test

import (
	"context"
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/jackc/pgx/v5/pgxpool"
)

func rubySanctumRows(rows []database.ResolveLeaderboardConfigurationRow) []database.ResolveLeaderboardConfigurationRow {
	var out []database.ResolveLeaderboardConfigurationRow
	for _, row := range rows {
		if row.InstanceName == "Ruby Sanctum" {
			out = append(out, row)
		}
	}
	return out
}

func TestRubySanctumRankingConfiguration(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	rows, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorWrath}, nil)
	require.NoError(t, err)
	rows = rubySanctumRows(rows)

	require.Len(t, selectKind(rows, "instance"), 1)
	require.Len(t, selectKind(rows, "variant"), 2)
	require.Len(t, selectKind(rows, "boss"), 4)
	require.Len(t, selectKind(rows, "set"), 1)
	members := selectKind(rows, "member")
	require.Len(t, members, 4)
	require.Equal(t, []string{
		"Baltharus the Warborn",
		"Saviana Ragefire",
		"General Zarithrian",
		"Halion",
	}, func() []string {
		names := make([]string, len(members))
		for i, member := range members {
			names[i] = member.EncounterName
		}
		return names
	}())

	for _, row := range rows {
		require.False(t, row.HasPoints, row)
	}

	vanillaRows, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorVanilla}, nil)
	require.NoError(t, err)
	require.Empty(t, rubySanctumRows(vanillaRows))
}

func rubySanctumMigration(ctx context.Context, pool *pgxpool.Pool, direction string) error {
	data, err := os.ReadFile("../../database/migrations/000368_leaderboard_ruby_sanctum_rankings." + direction + ".sql")
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, migrationDifficultySQL(data, direction))
	return err
}

func TestRubySanctumRankingMigrationRoundTrip(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	db := database.New(pool)
	before, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorWrath}, nil)
	require.NoError(t, err)
	require.NotEmpty(t, rubySanctumRows(before))

	require.NoError(t, rubySanctumMigration(ctx, pool, "down"))
	withoutRubySanctum, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorWrath}, nil)
	require.NoError(t, err)
	require.Empty(t, rubySanctumRows(withoutRubySanctum))

	require.NoError(t, rubySanctumMigration(ctx, pool, "up"))
	require.NoError(t, normalizeDifficultyMigration(ctx, pool))
	after, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorWrath}, nil)
	require.NoError(t, err)
	require.Equal(t, before, after)
}
