package instances

import "github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"

func UlduarSpeedrunRequirements() *rankings.Rankings {
	return &rankings.Rankings{
		Damage: rankings.DamageRuleAssemblyOfIron,
		Speedrun: &rankings.SpeedrunRules{
			Requirements: []rankings.SpeedrunRequirement{
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
			},
			RankedStartAfterRequirement: "Flame Leviathan",
		},
	}
}

func IcecrownCitadelSpeedrunRequirements() *rankings.Rankings {
	return &rankings.Rankings{
		Speedrun: &rankings.SpeedrunRules{
			Requirements: []rankings.SpeedrunRequirement{
				{Name: "Lord Marrowgar", EntryIDs: []uint32{36612}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Lady Deathwhisper", EntryIDs: []uint32{36855}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Gunship Battle", EntryIDs: []uint32{37215, 37540}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Deathbringer Saurfang", EntryIDs: []uint32{37813}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Festergut", EntryIDs: []uint32{36626}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Rotface", EntryIDs: []uint32{36627}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Professor Putricide", EntryIDs: []uint32{36678}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Blood Council", EntryIDs: []uint32{37970, 37972, 37973}, Count: 3, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Blood-Queen Lana'thel", EntryIDs: []uint32{37955}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Valithria Dreamwalker", EntryIDs: []uint32{36789}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Sindragosa", EntryIDs: []uint32{36853}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "The Lich King", EntryIDs: []uint32{36597}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			},
		},
	}
}

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

func TempestKeepSpeedrunRequirements() *rankings.Rankings {
	return &rankings.Rankings{
		Speedrun: &rankings.SpeedrunRules{
			Requirements: []rankings.SpeedrunRequirement{
				{Name: "Al'ar", EntryIDs: []uint32{19514}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Void Reaver", EntryIDs: []uint32{19516}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "High Astromancer Solarian", EntryIDs: []uint32{18805}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Kael'thas Sunstrider", EntryIDs: []uint32{19622}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			},
		},
	}
}

func HyjalSummitSpeedrunRequirements() *rankings.Rankings {
	return &rankings.Rankings{
		Speedrun: &rankings.SpeedrunRules{
			Requirements: []rankings.SpeedrunRequirement{
				{Name: "Rage Winterchill", EntryIDs: []uint32{17767}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Anetheron", EntryIDs: []uint32{17808}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Kaz'rogal", EntryIDs: []uint32{17888}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Azgalor", EntryIDs: []uint32{17842}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Archimonde", EntryIDs: []uint32{17968}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			},
		},
	}
}

func ZulAmanSpeedrunRequirements() *rankings.Rankings {
	return &rankings.Rankings{
		Speedrun: &rankings.SpeedrunRules{
			Requirements: []rankings.SpeedrunRequirement{
				{Name: "Akil'zon", EntryIDs: []uint32{23574}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Nalorakk", EntryIDs: []uint32{23576}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Jan'alai", EntryIDs: []uint32{23578}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Halazzi", EntryIDs: []uint32{23577}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Hex Lord Malacrass", EntryIDs: []uint32{24239}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Zul'jin", EntryIDs: []uint32{23863}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
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
