package leaderboardconfig_test

import (
	"context"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"log/slog"
	"os"
	"slices"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// Explicit calibration expectations, including every ordinary encounter. No
// production SQL or multiplier is used to calculate the expected awards.
func wrathAwards() map[string]map[string][2]float64 {
	return map[string]map[string][2]float64{
		"Naxxramas": {
			"Anub'Rekhan": {1, 1.5}, "Grand Widow Faerlina": {1, 1.5}, "Maexxna": {1, 1.5},
			"Noth the Plaguebringer": {1, 1.5}, "Heigan the Unclean": {1, 1.5}, "Loatheb": {1, 1.5},
			"Instructor Razuvious": {1, 1.5}, "Gothik the Harvester": {1, 1.5}, "Four Horsemen": {1, 1.5},
			"Patchwerk": {1, 1.5}, "Grobbulus": {1, 1.5}, "Gluth": {1, 1.5}, "Thaddius": {1, 1.5},
			"Sapphiron": {2, 3}, "Kel'Thuzad": {5, 7.5},
		},
		"Onyxia's Lair": {"Onyxia": {3, 4.5}},
		"Ulduar": {
			"Flame Leviathan": {2, 3}, "Ignis the Furnace Master": {2, 3}, "Razorscale": {2, 3},
			"XT-002 Deconstructor": {2, 3}, "Assembly of Iron": {2, 3}, "Kologarn": {2, 3}, "Auriaya": {2, 3},
			"Hodir": {2, 3}, "Thorim": {2, 3}, "Freya": {2, 3}, "Mimiron": {2, 3}, "General Vezax": {2, 3},
			"Yogg-Saron": {6, 9}, "Algalon the Observer": {8, 12},
		},
		"Obsidian Sanctum":  {"Sartharion": {1, 2}, "Sartharion (1 Drake)": {1, 2}, "Sartharion (2 Drakes)": {2, 3}, "Sartharion (3 Drakes)": {3, 4}},
		"Eye of Eternity":   {"Malygos": {2, 4}},
		"Vault of Archavon": {"Archavon the Stone Watcher": {1, 2}, "Emalon the Storm Watcher": {1, 2}, "Koralon the Flame Watcher": {1, 2}, "Toravon the Ice Watcher": {1, 2}},
	}
}

func TestWrathRenown(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	for _, flavor := range []database.WoWFlavor{
		{database.FlavorWrath},
		{database.FlavorVanilla, database.FlavorWrath},
		{database.FlavorVanilla, database.FlavorWrath, database.FlavorNightmareOfUrsol, database.FlavorOctoWoW},
		{database.FlavorVanilla, database.FlavorWrath, database.FlavorVanillaPlus},
	} {
		rows, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
		require.NoError(t, err)
		awards := wrathAwards()
		var seen int
		totals := map[string][2]float64{}
		allTotals := map[string][2]float64{}
		members := map[string]map[string]bool{}
		for _, r := range rows {
			if r.Kind == "member" && r.SetKey == "default" {
				if members[r.InstanceName] == nil {
					members[r.InstanceName] = map[string]bool{}
				}
				members[r.InstanceName][r.EncounterName] = true
			}
		}
		for _, r := range rows {
			if r.Kind != "boss_variant" {
				continue
			}
			want, ok := awards[r.InstanceName][r.EncounterName]
			if !ok {
				// Custom bosses (e.g. Ursol Axelus) retain their independent inherited
				// awards. Totals below cover only the reviewed Wrath calibration.
				require.True(t, flavor.Has(database.FlavorNightmareOfUrsol), r)
				require.Equal(t, "Broodcommander Axelus", r.EncounterName)
				require.True(t, r.HasPoints)
				require.Equal(t, float64(1), r.Points)
				continue
			}
			index := 0
			switch r.DifficultyName {
			case "10 Player":
				require.Equal(t, int16(10), r.MaxPlayers)
			case "25 Player":
				index = 1
				require.Equal(t, int16(25), r.MaxPlayers)
			default:
				t.Fatalf("unexpected difficulty tuple: %+v", r)
			}
			require.True(t, r.HasPoints, r)
			require.Equal(t, want[index], r.Points, r)
			seen++
			all := allTotals[r.InstanceName]
			all[index] += r.Points
			allTotals[r.InstanceName] = all
			if members[r.InstanceName][r.EncounterName] {
				total := totals[r.InstanceName]
				total[index] += r.Points
				totals[r.InstanceName] = total
			}
		}
		require.Equal(t, 78, seen)
		require.Equal(t, [2]float64{20, 30}, totals["Naxxramas"])
		require.Equal(t, [2]float64{3, 4.5}, totals["Onyxia's Lair"])
		require.Equal(t, [2]float64{36, 54}, totals["Ulduar"])
		require.Equal(t, [2]float64{38, 57}, allTotals["Ulduar"])
		require.Equal(t, [2]float64{1, 2}, totals["Obsidian Sanctum"])
		require.Equal(t, [2]float64{2, 4}, totals["Eye of Eternity"])
		require.Equal(t, [2]float64{}, totals["Vault of Archavon"])
		require.Equal(t, [2]float64{4, 8}, allTotals["Vault of Archavon"])
		var vaultSet bool
		var vaultBosses int
		for _, r := range rows {
			if r.InstanceName != "Vault of Archavon" {
				continue
			}
			switch r.Kind {
			case "set":
				require.Equal(t, "default", r.SetKey)
				vaultSet = true
			case "member":
				t.Fatal("Vault default must be enabled but empty")
			case "boss":
				vaultBosses++
			}
		}
		require.True(t, vaultSet)
		require.Equal(t, 4, vaultBosses)
	}
}

// Executing a migration as a whole is intentionally not a sqlc application query.
func wrathMigration(ctx context.Context, pool *pgxpool.Pool, direction string) error {
	data, err := os.ReadFile("../../database/migrations/000344_leaderboard_wrath_renown." + direction + ".sql")
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

func TestWrathMigrationRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	db := database.New(pool)
	flavors := []database.WoWFlavor{{database.FlavorVanilla}, {database.FlavorVanilla, database.FlavorNightmareOfUrsol, database.FlavorTurtle}, {database.FlavorVanilla, database.FlavorVanillaPlus}, {database.FlavorWrath}}
	before := make([][]database.ResolveLeaderboardConfigurationRow, len(flavors))
	for i, flavor := range flavors {
		rows, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
		require.NoError(t, err)
		before[i] = rows
	}
	// This test rolls back seed 344 in isolation. Remove later career seed
	// references first; production rollback drops migration 355 before 344.
	// Fixture setup is not an application query.
	fixture, err := os.ReadFile("testdata/career_rollback_fixture.sql")
	require.NoError(t, err)
	_, err = pool.Exec(ctx, string(fixture))
	require.NoError(t, err)
	require.NoError(t, wrathMigration(ctx, pool, "down"))
	for i, flavor := range flavors[:3] {
		rows, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
		require.NoError(t, err)
		require.Equal(t, before[i], rows, "Vanilla/Turtle/VanillaPlus must be byte-for-byte unchanged")
	}
	rows, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorWrath}, nil)
	require.NoError(t, err)
	require.Len(t, selectKind(rows, "variant"), 4)
	for _, r := range rows {
		require.False(t, r.HasPoints)
		require.NotEqual(t, "Eye of Eternity", r.InstanceName)
		require.NotEqual(t, "Vault of Archavon", r.InstanceName)
	}
	require.NoError(t, wrathMigration(ctx, pool, "up"))
	for i, flavor := range flavors {
		rows, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
		require.NoError(t, err)
		require.Equal(t, before[i], rows)
	}
}

func TestWrathRollbackProtectsLaterConfiguration(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	db := database.New(pool)
	require.NoError(t, db.InsertLeaderboardLayers(ctx, database.InsertLeaderboardLayersParams{Key: "rollback-fixture", RequiredFlavors: []string{"rollback-fixture"}}))
	require.NoError(t, db.InsertLeaderboardBossRenown(ctx, database.InsertLeaderboardBossRenownParams{LayerKey: "rollback-fixture", InstanceName: "Eye of Eternity", EncounterName: "Malygos", Points: 99}))
	before, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorWrath}, nil)
	require.NoError(t, err)
	require.Error(t, wrathMigration(ctx, pool, "down"), "later foreign-key references must block destructive rollback")
	after, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorWrath}, nil)
	require.NoError(t, err)
	require.Equal(t, before, after, "failed rollback must roll back all earlier deletes")
}

func TestWrathAwardCanonicalNames(t *testing.T) {
	t.Parallel()
	reg := registry.RegistryForFlavor(slog.Default(), database.WoWFlavor{database.FlavorWrath})
	for instance, bosses := range wrathAwards() {
		entry := reg.EntryByName(instance)
		require.NotNil(t, entry, instance)
		for boss := range bosses {
			found := slices.Contains(entry.ProgressionBosses, boss)
			for _, identity := range entry.HostileEntries {
				if identity.Boss && (identity.EncounterName == boss || (identity.EncounterName == "" && identity.Name == boss)) {
					found = true
				}
			}
			require.True(t, found, instance+"/"+boss)
		}
	}
}
