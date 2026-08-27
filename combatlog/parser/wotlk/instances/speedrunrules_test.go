package instances

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/database"
)

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
