package instances

import "github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"

func GruulsLairSpeedrunRequirements() *rankings.Rankings {
	return &rankings.Rankings{
		Speedrun: &rankings.SpeedrunRules{
			Requirements: []rankings.SpeedrunRequirement{
				{Name: "High King Maulgar", EntryIDs: []uint32{18831}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Krosh Firehand", EntryIDs: []uint32{18832}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Olm the Summoner", EntryIDs: []uint32{18834}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Kiggler the Crazed", EntryIDs: []uint32{18835}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Blindeye the Seer", EntryIDs: []uint32{18836}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Gruul the Dragonkiller", EntryIDs: []uint32{19044}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			},
		},
	}
}

func SerpentshrineCavernSpeedrunRequirements() *rankings.Rankings {
	return &rankings.Rankings{
		Speedrun: &rankings.SpeedrunRules{
			Requirements: []rankings.SpeedrunRequirement{
				{Name: "Hydross the Unstable", EntryIDs: []uint32{21216}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "The Lurker Below", EntryIDs: []uint32{21217}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Leotheras the Blind", EntryIDs: []uint32{21215}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Fathom-Lord Karathress", EntryIDs: []uint32{21214}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Morogrim Tidewalker", EntryIDs: []uint32{21213}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Lady Vashj", EntryIDs: []uint32{21212}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			},
		},
	}
}

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
