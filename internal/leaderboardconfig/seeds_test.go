package leaderboardconfig_test

import (
	"encoding/json"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"log/slog"
	"os"
	"slices"
	"testing"

	common "github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	wrath "github.com/Emyrk/chronicle/combatlog/parser/wotlk/instances"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

type seedFixture struct {
	Layers map[string][]string
	Sets   []struct {
		Layer, Instance, Key, Name string
		Bosses                     []string
	}
	Awards []struct {
		Layer, Instance, Boss string
		Points                float64
	}
}

func TestInitialSeeds(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	data, err := os.ReadFile("testdata/initial_config.json")
	require.NoError(t, err)
	var expected seedFixture
	require.NoError(t, json.Unmarshal(data, &expected))
	layers, err := db.ListLeaderboardLayers(ctx)
	require.NoError(t, err)
	require.Len(t, layers, 5)
	effective := map[string][]database.ResolveLeaderboardConfigurationRow{}
	for _, layer := range layers {
		require.Equal(t, expected.Layers[layer.Key], layer.RequiredFlavors)
		for _, tag := range layer.RequiredFlavors {
			require.True(t, database.FlavorTag(tag).LeaderboardRelevant(), tag)
		}
		rows, err := leaderboardconfig.Resolve(ctx, db, database.FlavorFromStrings(layer.RequiredFlavors), nil)
		require.NoError(t, err)
		effective[layer.Key] = rows
	}
	for _, set := range expected.Sets {
		var names []string
		for _, r := range effective[set.Layer] {
			if r.Kind == "member" && r.InstanceName == set.Instance && r.SetKey == set.Key {
				names = append(names, r.EncounterName)
			}
		}
		require.Equal(t, set.Bosses, names, set.Layer+"/"+set.Instance+"/"+set.Key)
	}
	// 104 legacy calibrations plus three reviewed VanillaPlus additions.
	require.Len(t, expected.Awards, 107)
	for _, award := range expected.Awards {
		found := false
		for _, r := range effective[award.Layer] {
			if r.Kind == "boss" && r.InstanceName == award.Instance && r.EncounterName == award.Boss {
				found = true
				require.True(t, r.HasPoints)
				require.Equal(t, award.Points, r.Points, award)
			}
		}
		require.True(t, found, award)
	}
	for _, r := range effective["nightmare-of-ursol"] {
		require.False(t, r.InstanceName == "Molten Core" && r.EncounterName == "Gehennas")
		require.False(t, r.InstanceName == "Emerald Sanctum" && r.SetKey == "hard")
	}
	// The three servers share identical relevant flavors, with no server-specific layer.
	var first []database.ResolveLeaderboardConfigurationRow
	for _, server := range []database.FlavorTag{database.FlavorOctoWoW, database.FlavorCapybara, database.FlavorRavencraft} {
		rows, err := leaderboardconfig.Resolve(ctx, db, database.WoWFlavor{database.FlavorVanilla}, database.WoWFlavor{database.FlavorNightmareOfUrsol, server})
		require.NoError(t, err)
		if first == nil {
			first = rows
		} else {
			require.Equal(t, first, rows)
		}
	}
	// Later Wrath variant calibration must not rewrite these initial boss defaults.
	for _, r := range effective["tbc"] {
		require.False(t, r.HasPoints, r)
	}
	require.Empty(t, selectKind(effective["vanilla"], "variant"))
	// Check exact sets against the live canonical registry factories, not just the snapshot.
	for _, factory := range []*common.CommonFactory{wrath.UlduarFactory, wrath.ObsidianSanctumFactory} {
		for _, set := range factory.RankingEncounterSets(database.WoWFlavor{database.FlavorWrath}) {
			key := set.ID
			if key == "" {
				key = "default"
			}
			var names []string
			for _, r := range effective["wrath"] {
				if r.Kind == "member" && r.InstanceName == factory.Name && r.SetKey == key {
					names = append(names, r.EncounterName)
				}
			}
			require.Equal(t, set.Encounters, names)
		}
	}
}

// The calibration reference must still name real canonical parser encounters.
func TestSeedAwardNamesMatchRegistry(t *testing.T) {
	t.Parallel()
	data, err := os.ReadFile("testdata/initial_config.json")
	require.NoError(t, err)
	var expected seedFixture
	require.NoError(t, json.Unmarshal(data, &expected))
	for _, award := range expected.Awards {
		reg := registry.RegistryForFlavor(slog.Default(), database.FlavorFromStrings(expected.Layers[award.Layer]))
		found := false
		for _, entry := range reg.Entries() {
			if entry.Name == award.Instance {
				for _, identity := range entry.HostileEntries {
					if identity.Boss && (identity.EncounterName == award.Boss || (identity.EncounterName == "" && identity.Name == award.Boss)) {
						found = true
					}
				}
				if slices.Contains(entry.ProgressionBosses, award.Boss) {
					found = true
				}
				for _, set := range entry.RankingEncounterSets {
					if slices.Contains(set.Encounters, award.Boss) {
						found = true
					}
				}
			}
			if rules := entry.DerivedSpeedrunRules[award.Instance]; rules != nil {
				for _, requirement := range rules.Requirements {
					if requirement.Name == award.Boss {
						found = true
					}
				}
			}
		}
		require.True(t, found, award)
	}
}
