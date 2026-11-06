package database_test

import (
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestLeaderboardFlavors(t *testing.T) {
	t.Parallel()
	want := database.WoWFlavor{database.FlavorNightmareOfUrsol, database.FlavorTBC, database.FlavorVanilla, database.FlavorVanillaPlus, database.FlavorWrath}
	for _, tag := range database.AllFlavorTagValues() {
		require.Equal(t, want.Has(tag), tag.LeaderboardRelevant(), tag)
	}
	input := database.WoWFlavor{database.FlavorWrath, database.FlavorVanilla, database.FlavorWrath, database.FlavorCapybara, "unknown"}
	before := append(database.WoWFlavor(nil), input...)
	require.Equal(t, database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}, input.LeaderboardFlavors())
	require.Equal(t, before, input)
	require.Nil(t, database.WoWFlavor{database.FlavorOctoWoW}.LeaderboardFlavors())
	require.Nil(t, database.WoWFlavor(nil).LeaderboardFlavors())
	require.False(t, database.FlavorTag("future").LeaderboardRelevant())
}

func TestLeaderboardCatalogConstraints(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	require.NoError(t, db.InsertLeaderboardLayers(ctx, database.InsertLeaderboardLayersParams{Key: "test-layer", RequiredFlavors: []string{"fixture"}}))
	require.Error(t, db.InsertLeaderboardLayers(ctx, database.InsertLeaderboardLayersParams{Key: "duplicate", RequiredFlavors: []string{"fixture"}}))
	require.Error(t, db.InsertLeaderboardLayers(ctx, database.InsertLeaderboardLayersParams{Key: "unsorted", RequiredFlavors: []string{"z", "a"}}))
	require.Error(t, db.InsertLeaderboardLayers(ctx, database.InsertLeaderboardLayersParams{Key: "repeated", RequiredFlavors: []string{"a", "a"}}))
	require.NoError(t, db.InsertLeaderboardInstances(ctx, "test-instance"))
	require.Error(t, db.InsertLeaderboardInstances(ctx, "test-instance"))
	require.Error(t, db.InsertLeaderboardInstances(ctx, " "))
	require.NoError(t, db.InsertLeaderboardBosses(ctx, database.InsertLeaderboardBossesParams{InstanceName: "test-instance", EncounterName: "test-boss"}))
	require.Error(t, db.InsertLeaderboardBosses(ctx, database.InsertLeaderboardBossesParams{InstanceName: "missing", EncounterName: "test-boss"}))
	require.NoError(t, db.InsertLeaderboardSets(ctx, database.InsertLeaderboardSetsParams{InstanceName: "test-instance", SetKey: "default", Name: "Default"}))
	require.Error(t, db.InsertLeaderboardSetMembers(ctx, database.InsertLeaderboardSetMembersParams{InstanceName: "test-instance", SetKey: "default", EncounterName: "missing"}))
	require.NoError(t, db.InsertLeaderboardSetMembers(ctx, database.InsertLeaderboardSetMembersParams{InstanceName: "test-instance", SetKey: "default", EncounterName: "test-boss"}))
	require.NoError(t, db.InsertLeaderboardBossRenown(ctx, database.InsertLeaderboardBossRenownParams{LayerKey: "test-layer", InstanceName: "test-instance", EncounterName: "test-boss", Points: 0}))
	require.Error(t, db.InsertLeaderboardVariantRenown(ctx, database.InsertLeaderboardVariantRenownParams{LayerKey: "test-layer", InstanceName: "test-instance", EncounterName: "test-boss", DifficultyName: "Normal", MaxPlayers: 40, Points: 1}))
	require.Error(t, db.InsertLeaderboardInstanceVariants(ctx, database.InsertLeaderboardInstanceVariantsParams{InstanceName: "test-instance", DifficultyName: "Normal", MaxPlayers: 0}))
}
