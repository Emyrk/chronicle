package leaderboardconfig_test

import (
	"os"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestCareerApprovedWeightSeeds(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	db := database.New(pool)
	flavors := []string{"vanilla", "nightmare-of-ursol", "vanillaplus", "tbc", "wrath"}
	expected := map[leaderboardconfig.CareerKey]float64{
		{Instance: "Onyxia's Lair"}: 1, {Instance: "Zul'Gurub"}: 2, {Instance: "Ruins of Ahn'Qiraj"}: 2,
		{Instance: "Molten Core"}: 3, {Instance: "Blackwing Lair"}: 4, {Instance: "Temple of Ahn'Qiraj"}: 5, {Instance: "Naxxramas"}: 6,
		{Instance: "Emerald Sanctum"}: 1, {Instance: "Lower Tower of Karazhan"}: 1, {Instance: "Timbermaw Hold"}: 3,
		{Instance: "Upper Tower of Karazhan"}: 6, {Instance: "Scarlet Monastery"}: 2,
		{Instance: "Gruul's Lair"}: 1, {Instance: "Serpentshrine Cavern"}: 4, {Instance: "Tempest Keep"}: 3,
		{Instance: "Onyxia's Lair", Difficulty: "10 Player", MaxPlayers: 10}: 1,
		{Instance: "Onyxia's Lair", Difficulty: "25 Player", MaxPlayers: 25}: 1.5,
		{Instance: "Naxxramas", Difficulty: "10 Player", MaxPlayers: 10}:     4,
		{Instance: "Naxxramas", Difficulty: "25 Player", MaxPlayers: 25}:     6,
		{Instance: "Ulduar", Difficulty: "10 Player", MaxPlayers: 10}:        6,
		{Instance: "Ulduar", Difficulty: "25 Player", MaxPlayers: 25}:        9,
	}
	before, err := db.ListLeaderboardCareerVariants(ctx, flavors)
	require.NoError(t, err)
	require.Len(t, before, 33)
	renownOnly := []string{
		"Black Temple", "Eye of Eternity", "Hyjal Summit", "Karazhan", "Magtheridon's Lair",
		"Obsidian Sanctum", "Sunwell Plateau", "Vault of Archavon", "Zul'Aman",
	}
	for _, r := range before {
		key := leaderboardconfig.CareerKey{Instance: r.InstanceName, Difficulty: r.DifficultyName, MaxPlayers: r.MaxPlayers}
		require.True(t, r.IncludeRenown)
		if w, ok := expected[key]; ok {
			require.True(t, r.IncludeAverage)
			require.Equal(t, pgtype.Float8{Float64: w, Valid: true}, r.Weight)
		} else {
			require.Contains(t, renownOnly, r.InstanceName)
			require.False(t, r.IncludeAverage)
			require.False(t, r.Weight.Valid)
		}
	}
	// Noncareer resolver configuration must survive down/up byte-for-byte.
	config, err := db.ResolveLeaderboardConfiguration(ctx, flavors)
	require.NoError(t, err)
	migrate := func(name, direction string) {
		data, err := os.ReadFile("../../database/migrations/" + name + "." + direction + ".sql")
		require.NoError(t, err)
		// Whole-migration execution in isolated test DB, not application SQL.
		_, err = pool.Exec(ctx, string(data))
		require.NoError(t, err)
	}
	migrate("000358_leaderboard_career_weights", "down")
	old, err := db.ListLeaderboardCareerVariants(ctx, flavors)
	require.NoError(t, err)
	require.Len(t, old, len(before))
	for i, r := range old {
		want := before[i]
		want.Weight = pgtype.Float8{}
		if want.InstanceName == "Vault of Archavon" {
			want.IncludeAverage = true
		}
		require.Equal(t, want, r)
	}
	migrate("000358_leaderboard_career_weights", "up")
	after, err := db.ListLeaderboardCareerVariants(ctx, flavors)
	require.NoError(t, err)
	require.Equal(t, before, after)
	afterConfig, err := db.ResolveLeaderboardConfiguration(ctx, flavors)
	require.NoError(t, err)
	require.Equal(t, config, afterConfig)
	// The follow-up policy migration is reversible without changing Renown eligibility.
	migrate("000363_exclude_eye_of_eternity_career_averages", "down")
	restoredEye, err := db.ListLeaderboardCareerVariants(ctx, flavors)
	require.NoError(t, err)
	eyeVariants := 0
	for _, r := range restoredEye {
		if r.InstanceName != "Eye of Eternity" {
			continue
		}
		eyeVariants++
		require.True(t, r.IncludeAverage)
		require.True(t, r.IncludeRenown)
		if r.MaxPlayers == 10 {
			require.Equal(t, pgtype.Float8{Float64: 1, Valid: true}, r.Weight)
		} else {
			require.Equal(t, pgtype.Float8{Float64: 1.5, Valid: true}, r.Weight)
		}
	}
	require.Equal(t, 2, eyeVariants)
	migrate("000363_exclude_eye_of_eternity_career_averages", "up")
	excludedEye, err := db.ListLeaderboardCareerVariants(ctx, flavors)
	require.NoError(t, err)
	require.Equal(t, before, excludedEye)

	// Reapplying and rolling back never overwrites a later operator weight edit.
	edit := database.UpsertLeaderboardCareerVariantParams{InstanceName: "Molten Core", RequiredFlavors: []string{"vanilla"}, IncludeAverage: true, IncludeRenown: true, Weight: pgtype.Float8{Float64: 12, Valid: true}}
	require.NoError(t, db.UpsertLeaderboardCareerVariant(ctx, edit))
	migrate("000358_leaderboard_career_weights", "up")
	migrate("000358_leaderboard_career_weights", "down")
	edited, err := db.ListLeaderboardCareerVariants(ctx, flavors)
	require.NoError(t, err)
	for _, r := range edited {
		if r.InstanceName == "Molten Core" {
			require.Equal(t, edit.Weight, r.Weight)
		}
	}
}
