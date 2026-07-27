package instances

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/database"
)

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
