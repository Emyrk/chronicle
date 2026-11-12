package leaderboardconfig_test

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// Old seed rollback tests operate on the current catalog. Adapt their deletion
// predicates, not the immutable migration files, to its canonical identities.
func migrationDifficultySQL(data []byte, direction string) string {
	if direction != "down" {
		return string(data)
	}
	return strings.NewReplacer("'10 Player'", "''", "'25 Player'", "''", "'10 игроков'", "''").Replace(string(data))
}

func normalizeDifficultyMigration(ctx context.Context, pool *pgxpool.Pool) error {
	data, err := os.ReadFile("../../database/migrations/000371_normalize_leaderboard_difficulty.up.sql")
	if err != nil {
		return err
	}
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	_, err = conn.Exec(ctx, string(data))
	if err != nil {
		_, _ = conn.Exec(ctx, "ROLLBACK")
	}
	return err
}

func TestDifficultyMigrationPreservesConfiguration(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	db := database.New(pool)
	vanilla, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorVanilla}, nil)
	require.NoError(t, err)
	wrath, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorWrath}, nil)
	require.NoError(t, err)
	// A duplicate locale alias has the same policy and should collapse harmlessly.
	require.NoError(t, db.InsertLeaderboardInstanceVariants(ctx, database.InsertLeaderboardInstanceVariantsParams{InstanceName: "Icecrown Citadel", DifficultyName: "10 игроков", MaxPlayers: 10}))
	require.NoError(t, db.InsertLeaderboardVariantOverrides(ctx, database.InsertLeaderboardVariantOverridesParams{LayerKey: "wrath", InstanceName: "Icecrown Citadel", DifficultyName: "10 игроков", MaxPlayers: 10, Enabled: true}))
	// Unknown future keys are not mistaken for normal difficulty.
	require.NoError(t, db.InsertLeaderboardInstanceVariants(ctx, database.InsertLeaderboardInstanceVariantsParams{InstanceName: "Ulduar", DifficultyName: "future-variant", MaxPlayers: 10}))
	require.NoError(t, db.InsertLeaderboardVariantOverrides(ctx, database.InsertLeaderboardVariantOverridesParams{LayerKey: "wrath", InstanceName: "Ulduar", DifficultyName: "future-variant", MaxPlayers: 10, Enabled: true}))
	require.NoError(t, normalizeDifficultyMigration(ctx, pool))
	got, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorVanilla}, nil)
	require.NoError(t, err)
	require.Equal(t, vanilla, got)
	got, err = leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorWrath}, nil)
	require.NoError(t, err)
	found := false
	for _, row := range got {
		if row.Kind == "variant" && row.DifficultyName == "future-variant" {
			found = true
		}
	}
	require.True(t, found)
	filtered := got[:0]
	for _, row := range got {
		if row.DifficultyName != "future-variant" {
			filtered = append(filtered, row)
		}
	}
	require.Equal(t, wrath, filtered)
}

func TestDifficultyMigrationRejectsConflicts(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"enabled", "points", "weight", "eligibility"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			ctx := testutil.Context(t, testutil.WaitLong)
			pool, _ := dbtestutil.NewPGXPool(t)
			db := database.New(pool)
			require.NoError(t, db.InsertLeaderboardInstanceVariants(ctx, database.InsertLeaderboardInstanceVariantsParams{InstanceName: "Naxxramas", DifficultyName: "10 Player", MaxPlayers: 10}))
			switch kind {
			case "enabled":
				require.NoError(t, db.InsertLeaderboardVariantOverrides(ctx, database.InsertLeaderboardVariantOverridesParams{LayerKey: "wrath", InstanceName: "Naxxramas", DifficultyName: "10 Player", MaxPlayers: 10, Enabled: false}))
			case "points":
				require.NoError(t, db.InsertLeaderboardVariantRenown(ctx, database.InsertLeaderboardVariantRenownParams{LayerKey: "wrath", InstanceName: "Naxxramas", EncounterName: "Anub'Rekhan", DifficultyName: "10 Player", MaxPlayers: 10, Points: 99}))
			default:
				weight := pgtype.Float8{}
				if kind == "eligibility" {
					weight = pgtype.Float8{Float64: 4, Valid: true}
				}
				require.NoError(t, db.UpsertLeaderboardCareerVariant(ctx, database.UpsertLeaderboardCareerVariantParams{InstanceName: "Naxxramas", DifficultyName: "10 Player", MaxPlayers: 10, RequiredFlavors: []string{"wrath"}, IncludeAverage: kind != "eligibility", IncludeRenown: true, Weight: weight}))
			}
			before, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorWrath}, nil)
			require.NoError(t, err)
			require.ErrorContains(t, normalizeDifficultyMigration(ctx, pool), "conflicting legacy difficulty aliases")
			after, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorWrath}, nil)
			require.NoError(t, err)
			require.Equal(t, before, after, "failure must not change configuration")
		})
	}
}
