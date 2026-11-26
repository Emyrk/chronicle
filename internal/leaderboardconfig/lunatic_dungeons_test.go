package leaderboardconfig_test

import (
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

var lunaticDungeons = map[string]struct {
	final           string
	bosses, members int
	weight          float64
}{
	"Deadmines":       {"Edwin VanCleef", 10, 8, 3},
	"Ragefire Chasm":  {"Bazzalan", 4, 4, 1},
	"Wailing Caverns": {"Mutanus the Devourer", 11, 10, 3},
	"Shadowfang Keep": {"Archmage Arugal", 8, 8, 3},
}

func lunaticDungeonRows(rows []database.ResolveLeaderboardConfigurationRow) []database.ResolveLeaderboardConfigurationRow {
	return slices.DeleteFunc(slices.Clone(rows), func(row database.ResolveLeaderboardConfigurationRow) bool {
		_, ok := lunaticDungeons[row.InstanceName]
		return !ok
	})
}

func TestLunaticDungeonConfiguration(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	flavors := database.WoWFlavor{database.FlavorVanilla, database.FlavorNightmareOfUrsol, database.FlavorLunatic}
	rows, err := leaderboardconfig.Resolve(ctx, db, flavors, nil)
	require.NoError(t, err)
	reg := registry.RegistryForFlavor(nil, flavors)
	for name, want := range lunaticDungeons {
		t.Run(name, func(t *testing.T) {
			var current []database.ResolveLeaderboardConfigurationRow
			for _, row := range rows {
				if row.InstanceName == name {
					current = append(current, row)
				}
			}
			require.Len(t, selectKind(current, "instance"), 1)
			require.Empty(t, selectKind(current, "variant")) // exact implicit ''/0, not invented Normal/5
			bosses := selectKind(current, "boss")
			require.Len(t, bosses, want.bosses)
			entry := reg.EntryByName(name)
			require.NotNil(t, entry)
			// Check canonical parser encounter names, not speedrun requirement labels
			// (Sneed's Shredder and Sneed are one ranked encounter).
			known := make(map[string]bool)
			for _, boss := range entry.HostileEntries {
				if !boss.Boss {
					continue
				}
				name := boss.EncounterName
				if name == "" {
					name = boss.Name
				}
				known[name] = true
			}
			for _, boss := range bosses {
				require.True(t, known[boss.EncounterName], boss.EncounterName)
				require.True(t, boss.HasPoints)
				points := 1.0
				if boss.EncounterName == want.final {
					points = 2
				}
				require.Equal(t, points, boss.Points, boss.EncounterName)
			}
			members := selectKind(current, "member")
			require.Len(t, members, want.members)
			for i, member := range members {
				require.Equal(t, "default", member.SetKey)
				require.EqualValues(t, i+1, member.Position)
			}
		})
	}
	// Ursol and other Vanilla tenants must not inherit the challenge policy.
	for _, flavor := range []database.WoWFlavor{
		{database.FlavorVanilla},
		{database.FlavorVanilla, database.FlavorNightmareOfUrsol},
		{database.FlavorVanilla, database.FlavorVanillaPlus},
		{database.FlavorWrath},
		{database.FlavorLunatic}, // layer also requires Vanilla
	} {
		other, err := leaderboardconfig.Resolve(ctx, db, flavor, nil)
		require.NoError(t, err)
		require.Empty(t, lunaticDungeonRows(other), flavor)
	}
}

func TestLunaticDungeonCareerConfiguration(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pg, _ := dbtestutil.NewPGXPool(t)
	tx, err := pg.Begin(ctx)
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(ctx) }()
	_, err = tx.Exec(ctx, "SET LOCAL app.tenant_bypass = 'true'")
	require.NoError(t, err)
	db := database.NewQueries(tx)
	tenant := uuid.New()
	flavors := database.WoWFlavor{database.FlavorVanilla, database.FlavorNightmareOfUrsol, database.FlavorLunatic}
	pool, err := leaderboardconfig.ResolveCareer(ctx, db, tenant, flavors, nil)
	require.NoError(t, err)
	for name, want := range lunaticDungeons {
		v := careerVariant(t, pool, name, "", 0)
		require.True(t, v.IncludeAverage)
		require.True(t, v.IncludeRenown)
		require.NotNil(t, v.Weight)
		require.Equal(t, want.weight, *v.Weight)
		require.Len(t, v.AverageBosses, want.members)
		require.Len(t, v.RenownBosses, want.bosses)
		require.False(t, v.Active) // config alone never invents eligible evidence
	}
	// Level-one no-talent characters retain metric-independent Unknown-spec
	// Renown and activate the configured career pool without fabricated ratings.
	for name, want := range lunaticDungeons {
		db.ReplaceLeaderboardPlayerRenownFact(ctx, []database.ReplaceLeaderboardPlayerRenownFactParams{{
			TenantID: tenant, RealmID: uuid.New(), InstanceName: name,
			EncounterName: want.final, RunID: uuid.New(), SourceInstanceID: uuid.New(),
			SourceEncounterID: uuid.New(), PlayerGuid: "level-one-player",
		}}).Exec(func(_ int, err error) { require.NoError(t, err) })
	}
	active, err := leaderboardconfig.ResolveCareer(ctx, db, tenant, flavors, nil)
	require.NoError(t, err)
	require.True(t, active.AveragesReady())
	for name := range lunaticDungeons {
		require.True(t, careerVariant(t, active, name, "", 0).Active)
	}
	other, err := leaderboardconfig.ResolveCareer(ctx, db, uuid.New(), database.WoWFlavor{database.FlavorVanilla, database.FlavorNightmareOfUrsol}, nil)
	require.NoError(t, err)
	for _, v := range other.Variants {
		_, dungeon := lunaticDungeons[v.Instance]
		require.False(t, dungeon)
	}
}

func TestLunaticDungeonMigrationRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	db := database.New(pool)
	flavors := database.WoWFlavor{database.FlavorVanilla, database.FlavorNightmareOfUrsol, database.FlavorLunatic}
	before, err := leaderboardconfig.Resolve(ctx, db, flavors, nil)
	require.NoError(t, err)
	careerBefore, err := db.ListLeaderboardCareerVariants(ctx, flavors.LeaderboardFlavors().Strings())
	require.NoError(t, err)
	for _, direction := range []string{"down", "up"} {
		data, err := os.ReadFile("../../database/migrations/000400_lunatic_dungeon_ratings." + direction + ".sql")
		require.NoError(t, err)
		// Isolate the migration under the caller's connection, as other round-trip tests do.
		sql := strings.ReplaceAll(strings.ReplaceAll(string(data), "BEGIN;", ""), "COMMIT;", "")
		_, err = pool.Exec(ctx, sql)
		require.NoError(t, err)
		if direction == "down" {
			rows, err := leaderboardconfig.Resolve(ctx, db, flavors, nil)
			require.NoError(t, err)
			require.Empty(t, lunaticDungeonRows(rows))
		}
	}
	after, err := leaderboardconfig.Resolve(ctx, db, flavors, nil)
	require.NoError(t, err)
	require.Equal(t, before, after)
	careerAfter, err := db.ListLeaderboardCareerVariants(ctx, flavors.LeaderboardFlavors().Strings())
	require.NoError(t, err)
	require.Equal(t, careerBefore, careerAfter)
}

func TestLunaticDungeonRollbackPreservesEdits(t *testing.T) {
	for _, tc := range []struct{ name, sql string }{
		{"award", "UPDATE leaderboard_boss_renown SET points = 9 WHERE layer_key = 'lunatic' AND instance_name = 'Deadmines' AND encounter_name = 'Cookie'"},
		{"weight", "UPDATE leaderboard_career_variants SET weight = 9 WHERE instance_name = 'Deadmines' AND difficulty_name = '' AND max_players = 0"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			ctx := testutil.Context(t, testutil.WaitLong)
			pool, _ := dbtestutil.NewPGXPool(t)
			// Test-only operator customization, not application SQL.
			_, err := pool.Exec(ctx, tc.sql)
			require.NoError(t, err)
			db := database.New(pool)
			flavors := database.WoWFlavor{database.FlavorLunatic, database.FlavorVanilla}
			before, err := leaderboardconfig.Resolve(ctx, db, flavors, nil)
			require.NoError(t, err)
			careerBefore, err := db.ListLeaderboardCareerVariants(ctx, flavors.Strings())
			require.NoError(t, err)
			data, err := os.ReadFile("../../database/migrations/000400_lunatic_dungeon_ratings.down.sql")
			require.NoError(t, err)
			sql := strings.ReplaceAll(strings.ReplaceAll(string(data), "BEGIN;", ""), "COMMIT;", "")
			_, err = pool.Exec(ctx, sql)
			require.Error(t, err, "foreign keys must prevent deleting operator-edited configuration")
			after, err := leaderboardconfig.Resolve(ctx, db, flavors, nil)
			require.NoError(t, err)
			require.Equal(t, before, after)
			careerAfter, err := db.ListLeaderboardCareerVariants(ctx, flavors.Strings())
			require.NoError(t, err)
			require.Equal(t, careerBefore, careerAfter)
		})
	}
}
