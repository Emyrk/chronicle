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

func icecrownRows(rows []database.ResolveLeaderboardConfigurationRow) []database.ResolveLeaderboardConfigurationRow {
	var out []database.ResolveLeaderboardConfigurationRow
	for _, row := range rows {
		if row.InstanceName == "Icecrown Citadel" {
			out = append(out, row)
		}
	}
	return out
}

func TestIcecrownCitadelRankingConfiguration(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	rows, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorWrath}, nil)
	require.NoError(t, err)
	rows = icecrownRows(rows)

	require.Len(t, selectKind(rows, "instance"), 1)
	require.Len(t, selectKind(rows, "variant"), 5)
	require.Len(t, selectKind(rows, "boss"), 12)
	require.Len(t, selectKind(rows, "set"), 1)
	members := selectKind(rows, "member")
	require.Len(t, members, 12)
	require.Equal(t, []string{
		"Lord Marrowgar",
		"Lady Deathwhisper",
		"Gunship Battle",
		"Deathbringer Saurfang",
		"Festergut",
		"Rotface",
		"Professor Putricide",
		"Blood Council",
		"Blood-Queen Lana'thel",
		"Valithria Dreamwalker",
		"Sindragosa",
		"The Lich King",
	}, func() []string {
		names := make([]string, len(members))
		for i, member := range members {
			names[i] = member.EncounterName
		}
		return names
	}())

	variants := selectKind(rows, "variant")
	require.ElementsMatch(t, []struct {
		name string
		size int16
	}{
		{name: "10 Player", size: 10},
		{name: "25 Player", size: 25},
		{name: "10 Player (Heroic)", size: 10},
		{name: "25 Player (Heroic)", size: 25},
		{name: "10 игроков", size: 10},
	}, func() []struct {
		name string
		size int16
	} {
		got := make([]struct {
			name string
			size int16
		}, len(variants))
		for i, variant := range variants {
			got[i] = struct {
				name string
				size int16
			}{name: variant.DifficultyName, size: variant.MaxPlayers}
		}
		return got
	}())

	for _, row := range rows {
		require.False(t, row.HasPoints, row)
	}

	vanillaRows, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorVanilla}, nil)
	require.NoError(t, err)
	require.Empty(t, icecrownRows(vanillaRows))
}

func icecrownMigration(ctx context.Context, pool *pgxpool.Pool, direction string) error {
	if direction == "down" {
		_, err := pool.Exec(ctx, `
DELETE FROM leaderboard_variant_overrides
WHERE layer_key = 'wrath' AND instance_name = 'Icecrown Citadel'
  AND difficulty_name IN ('10 Player (Heroic)', '25 Player (Heroic)');
DELETE FROM leaderboard_instance_variants
WHERE instance_name = 'Icecrown Citadel'
  AND difficulty_name IN ('10 Player (Heroic)', '25 Player (Heroic)');`)
		if err != nil {
			return err
		}
	}
	data, err := os.ReadFile("../../database/migrations/000365_leaderboard_icecrown_citadel_rankings." + direction + ".sql")
	if err != nil {
		return err
	}
	if _, err = pool.Exec(ctx, string(data)); err != nil {
		return err
	}
	if direction == "up" {
		_, err = pool.Exec(ctx, `
INSERT INTO leaderboard_instance_variants (instance_name, difficulty_name, max_players) VALUES
  ('Icecrown Citadel', '10 Player (Heroic)', 10),
  ('Icecrown Citadel', '25 Player (Heroic)', 25);
INSERT INTO leaderboard_variant_overrides (layer_key, instance_name, difficulty_name, max_players, enabled) VALUES
  ('wrath', 'Icecrown Citadel', '10 Player (Heroic)', 10, true),
  ('wrath', 'Icecrown Citadel', '25 Player (Heroic)', 25, true);`)
	}
	return err
}

func TestIcecrownCitadelRankingMigrationRoundTrip(t *testing.T) {
	t.Parallel()

	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	db := database.New(pool)
	before, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorWrath}, nil)
	require.NoError(t, err)
	require.NotEmpty(t, icecrownRows(before))

	require.NoError(t, icecrownMigration(ctx, pool, "down"))
	withoutICC, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorWrath}, nil)
	require.NoError(t, err)
	require.Empty(t, icecrownRows(withoutICC))

	require.NoError(t, icecrownMigration(ctx, pool, "up"))
	after, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorWrath}, nil)
	require.NoError(t, err)
	require.Equal(t, before, after)
}
