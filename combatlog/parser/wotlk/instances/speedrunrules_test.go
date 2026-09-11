package instances

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/database"
)

func TestUlduarSpeedrunRequirements(t *testing.T) {
	t.Parallel()

	rules := UlduarFactory.FlavoredRankings(database.WoWFlavor{database.FlavorWrath})
	require.NotNil(t, rules)
	require.NotNil(t, rules.Speedrun)
	require.Equal(t, "Flame Leviathan", rules.Speedrun.RankedStartAfterRequirement)
	require.Equal(t, []rankings.SpeedrunRequirement{
		{Name: "Flame Leviathan", EntryIDs: []uint32{33113, 34003}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Ignis the Furnace Master", EntryIDs: []uint32{33118, 33190}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Razorscale", EntryIDs: []uint32{33186, 33724}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "XT-002 Deconstructor", EntryIDs: []uint32{33293, 33885}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Assembly of Iron", EntryIDs: []uint32{32857, 32867, 32927, 33692, 33693, 33694}, Count: 3, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Kologarn", EntryIDs: []uint32{32930, 33909}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Auriaya", EntryIDs: []uint32{33515, 34175}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Hodir", EntryIDs: []uint32{32845, 32846}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Thorim", EntryIDs: []uint32{32865, 33147}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Freya", EntryIDs: []uint32{32906, 33360}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Mimiron", EntryIDs: []uint32{33432, 34106, 33651, 33670}, Count: 3, Category: rankings.SpeedrunCategoryBosses},
		{Name: "General Vezax", EntryIDs: []uint32{33271, 33449}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Yogg-Saron", EntryIDs: []uint32{33288}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Algalon the Observer", EntryIDs: []uint32{32871}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}, rules.Speedrun.Requirements)
}

func TestUlduarOptionalEldersAreNotBossEncounters(t *testing.T) {
	t.Parallel()

	hostiles := UlduarHostiles()
	for _, entry := range []uint32{32913, 32914, 32915, 33391, 33392, 33393} {
		require.Contains(t, hostiles, entry)
		require.False(t, hostiles[entry].Boss)
	}
}

func TestSerpentshrineCavernSpeedrunRequirements(t *testing.T) {
	t.Parallel()

	tbcRules := SerpentshrineCavernFactory.FlavoredRankings(database.WoWFlavor{database.FlavorTBC})
	require.NotNil(t, tbcRules)
	require.NotNil(t, tbcRules.Speedrun)
	require.Nil(t, tbcRules.Speedrun.LevelRange)
	require.Equal(t, []rankings.SpeedrunRequirement{
		{Name: "Hydross the Unstable", EntryIDs: []uint32{21216}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "The Lurker Below", EntryIDs: []uint32{21217}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Leotheras the Blind", EntryIDs: []uint32{21215}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Fathom-Lord Karathress", EntryIDs: []uint32{21214}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Morogrim Tidewalker", EntryIDs: []uint32{21213}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Lady Vashj", EntryIDs: []uint32{21212}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}, tbcRules.Speedrun.Requirements)

	wrathRules := SerpentshrineCavernFactory.FlavoredRankings(database.WoWFlavor{database.FlavorWrath})
	require.Equal(t, &rankings.LevelRangeRequirement{
		MinLevel: 0,
		MaxLevel: 70,
	}, wrathRules.Speedrun.LevelRange)
}

func TestGruulsLairSpeedrunRequirements(t *testing.T) {
	t.Parallel()

	tbcRules := GruulsLairFactory.FlavoredRankings(database.WoWFlavor{database.FlavorTBC})
	require.NotNil(t, tbcRules)
	require.NotNil(t, tbcRules.Speedrun)
	require.Nil(t, tbcRules.Speedrun.LevelRange)
	require.Equal(t, []rankings.SpeedrunRequirement{
		{Name: "High King Maulgar", EntryIDs: []uint32{18831}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Krosh Firehand", EntryIDs: []uint32{18832}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Olm the Summoner", EntryIDs: []uint32{18834}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Kiggler the Crazed", EntryIDs: []uint32{18835}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Blindeye the Seer", EntryIDs: []uint32{18836}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Gruul the Dragonkiller", EntryIDs: []uint32{19044}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}, tbcRules.Speedrun.Requirements)

	wrathRules := GruulsLairFactory.FlavoredRankings(database.WoWFlavor{database.FlavorWrath})
	require.Equal(t, &rankings.LevelRangeRequirement{
		MinLevel: 0,
		MaxLevel: 70,
	}, wrathRules.Speedrun.LevelRange)
}
