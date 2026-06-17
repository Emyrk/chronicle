package instances

import "github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"

func UtgardeKeepSpeedrunRequirements() *rankings.Rankings {
	return &rankings.Rankings{
		Speedrun: &rankings.SpeedrunRules{
			Requirements: []rankings.SpeedrunRequirement{
				{Name: "Prince Keleseth", EntryIDs: []uint32{23953}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Ingvar the Plunderer", EntryIDs: []uint32{23954}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Skarvald the Constructor", EntryIDs: []uint32{24200}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Dalronn the Controller", EntryIDs: []uint32{24201}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			},
			LevelRange: nil,
		},
	}
}

func UtgardePinnacleSpeedrunRequirements() *rankings.Rankings {
	return &rankings.Rankings{
		Speedrun: &rankings.SpeedrunRules{
			Requirements: []rankings.SpeedrunRequirement{
				{Name: "Skadi the Ruthless", EntryIDs: []uint32{26693}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Gortok Palehoof", EntryIDs: []uint32{26687}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "King Ymiron", EntryIDs: []uint32{26861}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Svala", EntryIDs: []uint32{29281}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			},
			LevelRange: nil,
		},
	}
}
