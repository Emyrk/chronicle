package leaderboardconfig_test

import (
	"context"
	"log/slog"
	"os"
	"slices"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/leaderboardread"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func tbcAwards() map[string]map[string]float64 {
	return map[string]map[string]float64{
		"Black Temple": {
			"High Warlord Naj'entus": 3, "Supremus": 3, "Shade of Akama": 3,
			"Teron Gorefiend": 3, "Gurtogg Bloodboil": 3, "Reliquary of Souls": 3,
			"Mother Shahraz": 3, "The Illidari Council": 3, "Illidan Stormrage": 8,
		},
		"Gruul's Lair": {
			"High King Maulgar": 1, "Gruul the Dragonkiller": 3,
		},
		"Hyjal Summit": {
			"Rage Winterchill": 3, "Anetheron": 3, "Kaz'rogal": 3,
			"Azgalor": 3, "Archimonde": 7,
		},
		"Karazhan": {
			"Attumen the Huntsman": 1, "Moroes": 1, "Maiden of Virtue": 1,
			"The Curator": 1, "Shade of Aran": 1, "Terestian Illhoof": 1,
			"Netherspite": 1, "Echo of Medivh": 1, "Nightbane": 3, "Prince Malchezaar": 3,
		},
		"Magtheridon's Lair": {"Magtheridon": 3},
		"Serpentshrine Cavern": {
			"Hydross the Unstable": 2, "The Lurker Below": 2, "Leotheras the Blind": 2,
			"Fathom-Lord Karathress": 2, "Morogrim Tidewalker": 2, "Lady Vashj": 6,
		},
		"Sunwell Plateau": {
			"Kalecgos": 8, "Brutallus": 8, "Felmyst": 8, "M'uru": 12,
		},
		"Tempest Keep": {
			"Al'ar": 2, "Void Reaver": 2, "High Astromancer Solarian": 2,
			"Kael'thas Sunstrider": 6,
		},
		"Zul'Aman": {
			"Akil'zon": 1, "Nalorakk": 1, "Halazzi": 1, "Jan'alai": 1,
			"Hex Lord Malacrass": 1, "Zul'jin": 3,
		},
	}
}

func tbcTotals() map[string]float64 {
	return map[string]float64{
		"Black Temple": 32, "Gruul's Lair": 4, "Hyjal Summit": 19,
		"Karazhan": 14, "Magtheridon's Lair": 3, "Serpentshrine Cavern": 16,
		"Sunwell Plateau": 36, "Tempest Keep": 12, "Zul'Aman": 8,
	}
}

func TestTBCRenown(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)

	for _, flavor := range []database.WoWFlavor{
		{database.FlavorTBC},
		{database.FlavorVanilla, database.FlavorTBC},
	} {
		rows, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
		require.NoError(t, err)

		awards := tbcAwards()
		totals := map[string]float64{}
		seen := 0
		configuredAwards := 0
		for _, row := range rows {
			if row.Kind != "boss" {
				continue
			}
			instanceAwards, configuredInstance := awards[row.InstanceName]
			if configuredInstance && row.HasPoints {
				configuredAwards++
			}
			want, ok := instanceAwards[row.EncounterName]
			if !ok {
				continue
			}
			require.True(t, row.HasPoints, row)
			require.Equal(t, want, row.Points, row)
			totals[row.InstanceName] += row.Points
			seen++
		}
		require.Equal(t, 47, configuredAwards)
		require.Equal(t, 47, seen)
		require.Equal(t, tbcTotals(), totals)
		for instance, total := range totals {
			if instance != "Sunwell Plateau" {
				require.Greater(t, totals["Sunwell Plateau"], total, instance)
			}
		}
	}
}

func TestTBCRemainingUnrankedRaidsAreRenownOnly(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	rows, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorTBC}, nil)
	require.NoError(t, err)

	unranked := map[string]bool{
		"Black Temple": true, "Sunwell Plateau": true,
	}
	instances := map[string]bool{}
	for _, row := range rows {
		if !unranked[row.InstanceName] {
			continue
		}
		switch row.Kind {
		case "instance":
			instances[row.InstanceName] = true
		case "boss":
			require.True(t, row.HasPoints, row)
		case "set", "member", "variant", "boss_variant":
			t.Fatalf("unranked TBC raid has ranked configuration: %+v", row)
		}
	}
	require.Len(t, instances, len(unranked))

	variants, err := db.ListLeaderboardCareerVariants(ctx, []string{string(database.FlavorTBC)})
	require.NoError(t, err)
	seen := map[string]bool{}
	for _, variant := range variants {
		if !unranked[variant.InstanceName] {
			continue
		}
		require.Empty(t, variant.DifficultyName)
		require.Zero(t, variant.MaxPlayers)
		require.False(t, variant.IncludeAverage)
		require.True(t, variant.IncludeRenown)
		require.False(t, variant.Weight.Valid)
		seen[variant.InstanceName] = true
	}
	require.Len(t, seen, len(unranked))
}

func TestTBCRankedSets(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	rows, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorTBC}, nil)
	require.NoError(t, err)

	expected := map[string][]string{
		"Hyjal Summit": {"Rage Winterchill", "Anetheron", "Kaz'rogal", "Azgalor", "Archimonde"},
		"Karazhan": {
			"Attumen the Huntsman", "Moroes", "Maiden of Virtue", "Nightbane", "The Curator",
			"Terestian Illhoof", "Shade of Aran", "Netherspite", "Prince Malchezaar",
		},
		"Magtheridon's Lair": {"Magtheridon"},
		"Zul'Aman":           {"Akil'zon", "Nalorakk", "Jan'alai", "Halazzi", "Hex Lord Malacrass", "Zul'jin"},
	}
	maxPlayers := map[string]int16{
		"Karazhan":           10,
		"Magtheridon's Lair": 25,
	}
	for instance, want := range expected {
		var set bool
		var members []string
		for _, row := range rows {
			if row.InstanceName != instance {
				continue
			}
			if row.Kind == "set" && row.SetKey == "default" {
				set = true
			}
			if row.Kind == "member" && row.SetKey == "default" {
				members = append(members, row.EncounterName)
			}
		}
		require.True(t, set, instance)
		require.Equal(t, want, members, instance)

		selection, err := leaderboardread.Select(rows, leaderboardread.Request{
			Instance: instance, MaxPlayers: maxPlayers[instance], Subject: "player", Kind: "boss", Score: "peak",
			Class: "MAGE", Spec: "Frost", Metric: "dps", Set: "default",
		})
		require.NoError(t, err)
		require.ElementsMatch(t, want, selection.Bosses)
		require.EqualValues(t, len(want), selection.Denominator)
	}

	require.NotContains(t,
		registry.RegistryForFlavor(slog.Default(), database.WoWFlavor{database.FlavorTBC}).SpeedrunRules(),
		"Magtheridon's Lair",
	)

	variants, err := db.ListLeaderboardCareerVariants(ctx, []string{string(database.FlavorTBC)})
	require.NoError(t, err)
	for _, variant := range variants {
		if _, ok := expected[variant.InstanceName]; !ok {
			continue
		}
		require.False(t, variant.IncludeAverage, variant)
		require.True(t, variant.IncludeRenown, variant)
		require.False(t, variant.Weight.Valid, variant)
		delete(expected, variant.InstanceName)
	}
	require.Empty(t, expected)
}

// Executing a migration as a whole is intentionally not a sqlc application query.
func tbcMigration(ctx context.Context, pool *pgxpool.Pool, direction string) error {
	data, err := os.ReadFile("../../database/migrations/000359_leaderboard_tbc_renown." + direction + ".sql")
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

func tbcRankedSetsMigration(ctx context.Context, pool *pgxpool.Pool, direction string) error {
	data, err := os.ReadFile("../../database/migrations/000360_leaderboard_tbc_hyjal_za_sets." + direction + ".sql")
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

func tbcKarazhanRankedSetMigration(ctx context.Context, pool *pgxpool.Pool, direction string) error {
	data, err := os.ReadFile("../../database/migrations/000376_leaderboard_tbc_karazhan_rankings." + direction + ".sql")
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

func magtheridonRankingsMigration(ctx context.Context, pool *pgxpool.Pool, direction string) error {
	data, err := os.ReadFile("../../database/migrations/000377_leaderboard_magtheridons_lair_rankings." + direction + ".sql")
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

func tbcKarazhanMagtheridonVariantsMigration(ctx context.Context, pool *pgxpool.Pool, direction string) error {
	data, err := os.ReadFile("../../database/migrations/000378_leaderboard_tbc_karazhan_magtheridon_variants." + direction + ".sql")
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

func tbcGruulsLairVariantMigration(ctx context.Context, pool *pgxpool.Pool, direction string) error {
	data, err := os.ReadFile("../../database/migrations/000379_leaderboard_tbc_gruuls_lair_variant." + direction + ".sql")
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

func TestTBCGruulsLairVariantMigrationRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	db := database.New(pool)
	flavor := database.WoWFlavor{database.FlavorTBC}
	before, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
	require.NoError(t, err)
	require.Contains(t, before, database.ResolveLeaderboardConfigurationRow{
		Kind:           "variant",
		InstanceName:   "Gruul's Lair",
		DifficultyName: "",
		MaxPlayers:     25,
	})

	require.NoError(t, tbcGruulsLairVariantMigration(ctx, pool, "down"))
	withoutVariant, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
	require.NoError(t, err)
	for _, row := range withoutVariant {
		if row.InstanceName == "Gruul's Lair" {
			require.NotEqual(t, "variant", row.Kind, row)
		}
	}

	require.NoError(t, tbcGruulsLairVariantMigration(ctx, pool, "up"))
	after, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
	require.NoError(t, err)
	require.Equal(t, before, after)
}

func TestTBCKarazhanMagtheridonVariantsMigrationRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	db := database.New(pool)
	flavor := database.WoWFlavor{database.FlavorTBC}
	before, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
	require.NoError(t, err)

	expected := map[string]int16{
		"Karazhan":           10,
		"Magtheridon's Lair": 25,
	}
	for instance, maxPlayers := range expected {
		require.Contains(t, before, database.ResolveLeaderboardConfigurationRow{
			Kind:           "variant",
			InstanceName:   instance,
			DifficultyName: "",
			MaxPlayers:     maxPlayers,
		})
	}

	require.NoError(t, tbcKarazhanMagtheridonVariantsMigration(ctx, pool, "down"))
	withoutVariants, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
	require.NoError(t, err)
	for _, row := range withoutVariants {
		if _, ok := expected[row.InstanceName]; ok {
			require.NotEqual(t, "variant", row.Kind, row)
		}
	}

	require.NoError(t, tbcKarazhanMagtheridonVariantsMigration(ctx, pool, "up"))
	after, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
	require.NoError(t, err)
	require.Equal(t, before, after)
}

func TestTBCRankedSetsMigrationRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	db := database.New(pool)
	flavor := database.WoWFlavor{database.FlavorTBC}
	before, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
	require.NoError(t, err)

	require.NoError(t, tbcKarazhanRankedSetMigration(ctx, pool, "down"))
	require.NoError(t, tbcRankedSetsMigration(ctx, pool, "down"))
	withoutSets, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
	require.NoError(t, err)
	for _, row := range withoutSets {
		if row.InstanceName == "Hyjal Summit" || row.InstanceName == "Karazhan" || row.InstanceName == "Zul'Aman" {
			require.NotContains(t, []string{"set", "member"}, row.Kind, row)
		}
	}

	require.NoError(t, tbcRankedSetsMigration(ctx, pool, "up"))
	require.NoError(t, tbcKarazhanRankedSetMigration(ctx, pool, "up"))
	after, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
	require.NoError(t, err)
	require.Equal(t, before, after)
}

func TestMagtheridonRankingsMigrationRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	db := database.New(pool)
	flavor := database.WoWFlavor{database.FlavorTBC}
	before, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
	require.NoError(t, err)

	require.NoError(t, magtheridonRankingsMigration(ctx, pool, "down"))
	withoutSet, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
	require.NoError(t, err)
	for _, row := range withoutSet {
		if row.InstanceName == "Magtheridon's Lair" {
			require.NotContains(t, []string{"set", "member"}, row.Kind, row)
		}
	}

	require.NoError(t, magtheridonRankingsMigration(ctx, pool, "up"))
	after, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
	require.NoError(t, err)
	require.Equal(t, before, after)
}

func TestTBCMigrationRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	db := database.New(pool)
	flavors := []database.WoWFlavor{
		{database.FlavorVanilla},
		{database.FlavorTBC},
		{database.FlavorVanilla, database.FlavorTBC},
		{database.FlavorWrath},
	}
	before := make([][]database.ResolveLeaderboardConfigurationRow, len(flavors))
	for i, flavor := range flavors {
		rows, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
		require.NoError(t, err)
		before[i] = rows
	}
	careerBefore, err := db.ListLeaderboardCareerVariants(ctx, []string{string(database.FlavorTBC)})
	require.NoError(t, err)

	require.NoError(t, tbcGruulsLairVariantMigration(ctx, pool, "down"))
	require.NoError(t, tbcKarazhanMagtheridonVariantsMigration(ctx, pool, "down"))
	require.NoError(t, magtheridonRankingsMigration(ctx, pool, "down"))
	require.NoError(t, tbcKarazhanRankedSetMigration(ctx, pool, "down"))
	require.NoError(t, tbcRankedSetsMigration(ctx, pool, "down"))
	require.NoError(t, tbcMigration(ctx, pool, "down"))
	for _, i := range []int{0, 3} {
		rows, err := leaderboardconfig.Resolve(ctx, db, flavors[i], nil)
		require.NoError(t, err)
		require.Equal(t, before[i], rows)
	}
	for _, i := range []int{1, 2} {
		rows, err := leaderboardconfig.Resolve(ctx, db, flavors[i], nil)
		require.NoError(t, err)
		for _, row := range rows {
			if _, ok := tbcAwards()[row.InstanceName][row.EncounterName]; ok && row.Kind == "boss" {
				require.False(t, row.HasPoints, row)
			}
		}
	}

	careerAfterDown, err := db.ListLeaderboardCareerVariants(ctx, []string{string(database.FlavorTBC)})
	require.NoError(t, err)
	for _, variant := range careerAfterDown {
		require.False(t, map[string]bool{
			"Black Temple": true, "Hyjal Summit": true, "Karazhan": true,
			"Magtheridon's Lair": true, "Sunwell Plateau": true, "Zul'Aman": true,
		}[variant.InstanceName], variant)
	}

	require.NoError(t, tbcMigration(ctx, pool, "up"))
	require.NoError(t, tbcRankedSetsMigration(ctx, pool, "up"))
	require.NoError(t, tbcKarazhanRankedSetMigration(ctx, pool, "up"))
	require.NoError(t, magtheridonRankingsMigration(ctx, pool, "up"))
	require.NoError(t, tbcKarazhanMagtheridonVariantsMigration(ctx, pool, "up"))
	require.NoError(t, tbcGruulsLairVariantMigration(ctx, pool, "up"))
	for i, flavor := range flavors {
		rows, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
		require.NoError(t, err)
		require.Equal(t, before[i], rows)
	}
	careerAfterUp, err := db.ListLeaderboardCareerVariants(ctx, []string{string(database.FlavorTBC)})
	require.NoError(t, err)
	require.Equal(t, careerBefore, careerAfterUp)
}

func TestTBCRollbackPreservesEditedAward(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)

	_, err := pool.Exec(ctx, `UPDATE leaderboard_boss_renown SET points=99 WHERE layer_key='tbc' AND instance_name='Gruul''s Lair' AND encounter_name='Gruul the Dragonkiller'`)
	require.NoError(t, err)
	require.NoError(t, tbcGruulsLairVariantMigration(ctx, pool, "down"))
	require.NoError(t, tbcKarazhanMagtheridonVariantsMigration(ctx, pool, "down"))
	require.NoError(t, magtheridonRankingsMigration(ctx, pool, "down"))
	require.NoError(t, tbcKarazhanRankedSetMigration(ctx, pool, "down"))
	require.NoError(t, tbcRankedSetsMigration(ctx, pool, "down"))
	require.NoError(t, tbcMigration(ctx, pool, "down"))

	var points float64
	err = pool.QueryRow(ctx, `SELECT points FROM leaderboard_boss_renown WHERE layer_key='tbc' AND instance_name='Gruul''s Lair' AND encounter_name='Gruul the Dragonkiller'`).Scan(&points)
	require.NoError(t, err)
	require.Equal(t, float64(99), points)
}

func TestTBCRollbackProtectsEditedNewCatalogAward(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)

	_, err := pool.Exec(ctx, `UPDATE leaderboard_boss_renown SET points=99 WHERE layer_key='tbc' AND instance_name='Black Temple' AND encounter_name='Illidan Stormrage'`)
	require.NoError(t, err)
	require.NoError(t, tbcGruulsLairVariantMigration(ctx, pool, "down"))
	require.NoError(t, tbcKarazhanMagtheridonVariantsMigration(ctx, pool, "down"))
	require.NoError(t, magtheridonRankingsMigration(ctx, pool, "down"))
	require.NoError(t, tbcKarazhanRankedSetMigration(ctx, pool, "down"))
	require.NoError(t, tbcRankedSetsMigration(ctx, pool, "down"))
	require.Error(t, tbcMigration(ctx, pool, "down"))

	var points float64
	err = pool.QueryRow(ctx, `SELECT points FROM leaderboard_boss_renown WHERE layer_key='tbc' AND instance_name='Black Temple' AND encounter_name='Illidan Stormrage'`).Scan(&points)
	require.NoError(t, err)
	require.Equal(t, float64(99), points)
}

func TestTBCAwardCanonicalNames(t *testing.T) {
	t.Parallel()
	reg := registry.RegistryForFlavor(slog.Default(), database.WoWFlavor{database.FlavorTBC})
	for instance, bosses := range tbcAwards() {
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
