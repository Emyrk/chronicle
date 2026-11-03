package api

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestSupportedSpeedrunRules(t *testing.T) {
	t.Parallel()
	rules := supportedSpeedrunRules(&rankings.SpeedrunRules{
		Requirements: []rankings.SpeedrunRequirement{
			{Name: "Boss", EntryIDs: []uint32{10}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			{Name: "Trash", EntryIDs: []uint32{20, 21}, Count: 3, Category: rankings.SpeedrunCategoryTrash},
		},
		LevelRange:                  &rankings.LevelRangeRequirement{MinLevel: 60, MaxLevel: 60},
		RankedStartAfterRequirement: "Boss",
	})
	if len(rules.Requirements) != 2 || rules.Requirements[1].Category != "Trash" || rules.Requirements[1].Count != 3 || rules.LevelRange == nil || rules.LevelRange.MinLevel != 60 || rules.RankedStartAfterRequirement != "Boss" {
		t.Fatalf("unexpected supported speedrun rules: %+v", rules)
	}
	if supportedSpeedrunRules(nil) != nil {
		t.Fatal("nil rules should be omitted")
	}
}

func TestSupportedRenownRules(t *testing.T) {
	t.Parallel()
	rows := []database.ListLatestRenownTemplateBossesRow{
		{InstanceName: "Molten Core", EncounterName: "Gehennas", RenownPoints: 1},
		{InstanceName: "Molten Core", EncounterName: "Ragnaros", RenownPoints: 5},
		{InstanceName: "Upper Tower of Karazhan", EncounterName: "Kruul", RenownPoints: 7},
	}

	vanilla := supportedRenownRules(rows, database.WoWFlavor{database.FlavorVanilla})
	require.Equal(t, 1.0, vanilla["Molten Core"][0].Points)
	require.Len(t, vanilla["Molten Core"], 2)
	require.Equal(t, "Kruul", vanilla["Upper Tower of Karazhan"][0].EncounterName)

	turtle := supportedRenownRules(rows, database.WoWFlavor{database.FlavorVanilla, database.FlavorNightmareOfUrsol})
	require.Len(t, turtle["Molten Core"], 1)
	require.Equal(t, "Ragnaros", turtle["Molten Core"][0].EncounterName)
}
