package api

import (
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
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
