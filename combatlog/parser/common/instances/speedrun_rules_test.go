package instances

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestMoltenCoreDamageTargets(t *testing.T) {
	t.Parallel()
	bossOnly := rankings.DamageTargets{Mode: rankings.DamageTargetsBossOnly}
	entries := func(ids ...uint32) rankings.DamageTargets {
		return rankings.DamageTargets{Mode: rankings.DamageTargetsEntries, EntryIDs: ids}
	}
	common := map[string]rankings.DamageTargets{
		"Lucifron":                 entries(12118, 12119),
		"Magmadar":                 entries(11982),
		"Garr":                     entries(12057, 12099),
		"Shazzrah":                 bossOnly,
		"Baron Geddon":             bossOnly,
		"Sulfuron Harbinger":       entries(12098, 11662, 12143),
		"Golemagg the Incinerator": entries(11988, 11672),
		"Majordomo Executus":       entries(12018, 11663, 11664),
		"Ragnaros":                 entries(11502, 12143),
	}
	for _, tc := range []struct {
		name   string
		flavor database.WoWFlavor
		extra  map[string]rankings.DamageTargets
	}{
		{name: "vanilla", flavor: database.WoWFlavor{database.FlavorVanilla}, extra: map[string]rankings.DamageTargets{
			"Gehennas": entries(12259, 11661),
		}},
		{name: "turtle", flavor: database.WoWFlavor{database.FlavorTurtle}, extra: map[string]rankings.DamageTargets{
			"Incindis":                  bossOnly,
			"Basalthar & Smoldaris":     bossOnly,
			"Sorcerer-Thane Thaurissan": entries(57642, 57643),
		}},
		{name: "nightmare", flavor: database.WoWFlavor{database.FlavorNightmareOfUrsol}, extra: map[string]rankings.DamageTargets{
			"Incindis":                  bossOnly,
			"Basalthar & Smoldaris":     bossOnly,
			"Sorcerer-Thane Thaurissan": entries(57642, 57643),
		}},
		{name: "octowow", flavor: database.WoWFlavor{database.FlavorOctoWoW}, extra: map[string]rankings.DamageTargets{
			"Incindis":                  bossOnly,
			"Basalthar & Smoldaris":     bossOnly,
			"Sorcerer-Thane Thaurissan": entries(57642, 57643),
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			want := make(map[string]rankings.DamageTargets, len(common)+len(tc.extra))
			for name, rule := range common {
				want[name] = rule
			}
			for name, rule := range tc.extra {
				want[name] = rule
			}
			require.Equal(t, want, MoltenCoreFactory.FlavoredRankings(tc.flavor).DamageByEncounter)
		})
	}
}

func TestBlackwingLairDamageTargets(t *testing.T) {
	t.Parallel()

	bossOnly := rankings.DamageTargets{Mode: rankings.DamageTargetsBossOnly}
	entries := func(ids ...uint32) rankings.DamageTargets {
		return rankings.DamageTargets{Mode: rankings.DamageTargetsEntries, EntryIDs: ids}
	}
	common := map[string]rankings.DamageTargets{
		"Razorgore the Untamed": entries(12435, 12416, 12420, 12422, 14456, 50142, 52153),
		"Broodlord Lashlayer":   entries(12017, 14022, 14024, 14025, 14023),
		"Firemaw":               bossOnly,
		"Chromaggus":            bossOnly,
	}
	commonNefarian := []uint32{11583, 14668, 14605, 14261, 14262, 14263, 14264, 14265, 14302}

	for _, tc := range []struct {
		name   string
		flavor database.WoWFlavor
		want   map[string]rankings.DamageTargets
	}{
		{
			name:   "vanilla",
			flavor: database.WoWFlavor{database.FlavorVanilla},
			want: map[string]rankings.DamageTargets{
				"Vaelastrasz the Corrupt": bossOnly,
				"Ebonroc":                 bossOnly,
				"Flamegor":                bossOnly,
				"Nefarian":                entries(commonNefarian...),
			},
		},
		{
			name:   "turtle",
			flavor: database.WoWFlavor{database.FlavorTurtle},
			want: map[string]rankings.DamageTargets{
				"Vaelastrasz the Corrupt": bossOnly,
				"Ebonroc":                 bossOnly,
				"Flamegor":                bossOnly,
				"Nefarian":                entries(commonNefarian...),
				"Ezzel Darkbrewer":        bossOnly,
			},
		},
		{
			name:   "nightmare",
			flavor: database.WoWFlavor{database.FlavorNightmareOfUrsol},
			want: map[string]rankings.DamageTargets{
				"Vaelastrasz the Corrupt": bossOnly,
				"Ebonroc":                 bossOnly,
				"Flamegor":                bossOnly,
				"Nefarian":                entries(commonNefarian...),
				"Ezzel Darkbrewer":        bossOnly,
			},
		},
		{
			name:   "octowow",
			flavor: database.WoWFlavor{database.FlavorOctoWoW},
			want: map[string]rankings.DamageTargets{
				"Vaelastrasz the Corrupt": bossOnly,
				"Ebonroc":                 bossOnly,
				"Flamegor":                bossOnly,
				"Nefarian":                entries(commonNefarian...),
				"Ezzel Darkbrewer":        bossOnly,
			},
		},
		{
			name:   "vanilla plus",
			flavor: database.WoWFlavor{database.FlavorVanillaPlus},
			want: map[string]rankings.DamageTargets{
				"Elementium Decapitator Mk III":  bossOnly,
				"Master Elemental Shaper Krixix": bossOnly,
				"Flamegor & Ebonroc":             entries(11981, 14601),
				"Nefarian":                       entries(11583, 14668, 14605, 14261, 14262, 14263, 14264, 14265, 14302, 25123),
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			want := make(map[string]rankings.DamageTargets, len(common)+len(tc.want))
			for name, rule := range common {
				want[name] = rule
			}
			for name, rule := range tc.want {
				want[name] = rule
			}
			require.Equal(t, want, BlackwingLairFactory.FlavoredRankings(tc.flavor).DamageByEncounter)
		})
	}
}

func TestLevel60Cap(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name   string
		flavor database.WoWFlavor
		capped bool
	}{
		{name: "vanilla", flavor: database.WoWFlavor{database.FlavorVanilla}},
		{name: "tbc", flavor: database.WoWFlavor{database.FlavorTBC}, capped: true},
		{name: "wrath", flavor: database.WoWFlavor{database.FlavorWrath}, capped: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			requirement := Level60Cap(tc.flavor)
			if !tc.capped {
				require.Nil(t, requirement)
				return
			}

			require.NotNil(t, requirement)
			require.Equal(t, int32(0), requirement.MinLevel)
			require.Equal(t, int32(60), requirement.MaxLevel)
		})
	}
}

func TestDeadminesNightmareSpeedrunRequirements(t *testing.T) {
	t.Parallel()

	vanilla := DeadminesFactory.FlavoredRankings(database.WoWFlavor{database.FlavorVanilla})
	require.NotNil(t, vanilla)
	require.NotNil(t, vanilla.Speedrun)
	require.NotContains(t, vanilla.Speedrun.Requirements, rankings.SpeedrunRequirement{
		Name: "Masterpiece Harvester", EntryIDs: []uint32{61963}, Count: 1, Category: rankings.SpeedrunCategoryBosses,
	})

	nightmare := DeadminesFactory.FlavoredRankings(database.WoWFlavor{
		database.FlavorVanilla,
		database.FlavorNightmareOfUrsol,
	})
	require.NotNil(t, nightmare)
	require.NotNil(t, nightmare.Speedrun)
	require.Contains(t, nightmare.Speedrun.Requirements, rankings.SpeedrunRequirement{
		Name: "Masterpiece Harvester", EntryIDs: []uint32{61963}, Count: 1, Category: rankings.SpeedrunCategoryBosses,
	})
}

func TestVanillaPlusScarletMonasterySpeedrunRequirements(t *testing.T) {
	t.Parallel()

	rules := ScarletMonasteryArmoryVPRaid.FlavoredRankings(database.WoWFlavor{database.FlavorVanillaPlus})
	require.NotNil(t, rules)
	require.NotNil(t, rules.Speedrun)
	require.Nil(t, rules.Speedrun.LevelRange)
	require.Equal(t, []rankings.SpeedrunRequirement{
		{Name: "Loksey", EntryIDs: []uint32{25225}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Brother Michael", EntryIDs: []uint32{25221}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Brigitte Abbendis", EntryIDs: []uint32{25229}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Fairbanks", EntryIDs: []uint32{25222}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Doan", EntryIDs: []uint32{25223}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Vishas", EntryIDs: []uint32{25224}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Herod", EntryIDs: []uint32{25226}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Sally Whitemane", EntryIDs: []uint32{25228}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Renault Mograine", EntryIDs: []uint32{25227}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}, rules.Speedrun.Requirements)
}

func TestZulGurubSpeedrunDoesNotRequireHighPriests(t *testing.T) {
	t.Parallel()

	base := []rankings.SpeedrunRequirement{
		{Name: "Bloodlord Mandokir", EntryIDs: []uint32{11382}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Jin'do the Hexxer", EntryIDs: []uint32{11380}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Hakkar", EntryIDs: []uint32{14834}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}
	vanillaPlus := append(append([]rankings.SpeedrunRequirement{}, base...),
		rankings.SpeedrunRequirement{Name: "Azus the Bloodseeker", EntryIDs: []uint32{25031}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		rankings.SpeedrunRequirement{Name: "The Nameless Hermit", EntryIDs: []uint32{25030}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	)
	for _, tc := range []struct {
		name     string
		flavor   database.WoWFlavor
		expected []rankings.SpeedrunRequirement
	}{
		{name: "vanilla", flavor: database.WoWFlavor{database.FlavorVanilla}, expected: base},
		{name: "vanilla plus", flavor: database.WoWFlavor{database.FlavorVanillaPlus}, expected: vanillaPlus},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			rules := ZulGurubFactory.FlavoredRankings(tc.flavor)
			require.NotNil(t, rules)
			require.NotNil(t, rules.Speedrun)
			require.Equal(t, tc.expected, rules.Speedrun.Requirements)
		})
	}
}

func TestEmeraldSanctumRankingsWithoutSpeedrun(t *testing.T) {
	t.Parallel()

	flavor := database.WoWFlavor{database.FlavorVanilla}
	rules := EmeraldSanctumFactory.FlavoredRankings(flavor)
	require.NotNil(t, rules)
	require.Nil(t, rules.Speedrun)
	require.Equal(t, []string{
		"Erennius",
		"Solnius",
		"Solnius (Hard Mode)",
	}, EmeraldSanctumFactory.ProgressionBosses(flavor))
}

func TestVanillaRaidLevel60Caps(t *testing.T) {
	t.Parallel()

	factories := []*CommonFactory{
		MoltenCoreFactory,
		OnyxiaFactory,
		ZulGurubFactory,
		TempleOfAhnQirajFactory,
		RuinsOfAhnQirajFactory,
		BlackwingLairFactory,
		NaxxramasFactory,
	}

	for _, factory := range factories {
		factory := factory
		t.Run(factory.Name, func(t *testing.T) {
			t.Parallel()

			for _, flavor := range []database.FlavorTag{database.FlavorTBC, database.FlavorWrath} {
				rules := factory.FlavoredRankings(database.WoWFlavor{flavor})
				require.NotNil(t, rules)
				require.NotNil(t, rules.Speedrun)
				require.NotNil(t, rules.Speedrun.LevelRange, "flavor %q", flavor)
				require.Equal(t, int32(60), rules.Speedrun.LevelRange.MaxLevel, "flavor %q", flavor)
			}

			vanillaRules := factory.FlavoredRankings(database.WoWFlavor{database.FlavorVanilla})
			require.Nil(t, vanillaRules.Speedrun.LevelRange)
		})
	}
}
