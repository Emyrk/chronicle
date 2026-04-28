package instances

import "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances/rankings"

// Factory variables expose the *CommonFactory for each instance, allowing
// access to metadata (zone names, hostile entries) without instantiating.
// The corresponding function variables (e.g. Deadmines = DeadminesFactory.New)
// are preserved for backward compatibility.
var (
	WindhornCanyonFactory = &CommonFactory{
		Name:      "Windhorn Canyon",
		ZoneNames: []string{"windhorn canyon"},
		Hostiles:  FromMap(WindhornCanyonHostiles()),
	}

	DeadminesFactory = &CommonFactory{
		Name:      "Deadmines",
		ZoneNames: []string{"the deadmines", "deadmines", "死亡矿井"},
		Hostiles:  FromMap(DeadminesHostiles()),
	}

	WailingCavernsFactory = &CommonFactory{
		Name:      "Wailing Caverns",
		ZoneNames: []string{"wailing caverns", "哀嚎洞穴"},
		Hostiles:  FromMap(WailingCavernsHostiles()),
	}

	RazorfenKraulFactory = &CommonFactory{
		Name:      "Razorfen Kraul",
		ZoneNames: []string{"razorfen kraul", "剃刀沼泽"},
		Hostiles:  FromMap(RazorfenKraulHostiles()),
	}

	ScarletMonasteryCathedralFactory = &CommonFactory{
		Name:      "Scarlet Monastery Cathedral",
		ZoneNames: []string{"scarlet monastery cathedral", "血色修道院-大教堂"},
		Hostiles:  FromMap(CathedralHostiles()),
	}

	ScarletMonasteryLibraryFactory = &CommonFactory{
		Name:      "Scarlet Monastery Library",
		ZoneNames: []string{"scarlet monastery library", "血色修道院-图书馆"},
		Hostiles:  FromMap(SMLibraryHostiles()),
	}

	BlackrockSpireFactory = &CommonFactory{
		Name: "Blackrock Spire",
		ZoneNames: []string{"blackrock spire",
			"黑石塔",   // Blackrock Spire
			"黑石塔下层", // Lower
			"黑石塔上层", // "upper"
		},
		Hostiles: FromMap(BlackrockSpireHostiles()),
	}

	MoltenCoreFactory = &CommonFactory{
		Name:      "Molten Core",
		ZoneNames: []string{"molten core", "熔火之心"},
		MapIDs:    []uint32{409},
		Hostiles:  FromMap(MoltenCoreHostiles()),
		Rankings: &rankings.Rankings{
			Speedrun: &rankings.SpeedrunRules{
				Requirements: MoltenCoreSpeedrunRequirements(),
			},
		},
	}

	TowerOfKarazhanFactory = &CommonFactory{
		Name: "Tower of Karazhan",
		ZoneNames: []string{"tower of karazhan", "the rock of desolation",
			"卡拉赞之塔", // Tower of Karazhan
		},
		Hostiles: FromMap(TowerOfKarazhanHostiles()),
	}

	OnyxiaFactory = &CommonFactory{
		Name:      "Onyxia's Lair",
		ZoneNames: []string{"onyxia's lair", "奥妮克希亚的巢穴"},
		MapIDs:    []uint32{249},
		Hostiles:  FromMap(OnyxiaHostiles()),
		Rankings: &rankings.Rankings{
			Speedrun: &rankings.SpeedrunRules{
				Requirements: OnyxiasLairSpeedrunRequirements(),
			},
		},
	}

	RagefireChasmFactory = &CommonFactory{
		Name:      "Ragefire Chasm",
		ZoneNames: []string{"ragefire chasm", "怒焰裂谷"},
		Hostiles:  FromMap(RagefireChasmHostiles()),
	}

	ZulGurubFactory = &CommonFactory{
		Name:      "Zul'Gurub",
		ZoneNames: []string{"zul'gurub", "祖尔格拉布"},
		MapIDs:    []uint32{309},
		Hostiles:  FromMap(ZulGurubHostiles()),
		Rankings: &rankings.Rankings{
			Speedrun: &rankings.SpeedrunRules{
				Requirements: ZulGurubSpeedrunRequirements(),
			},
		},
	}

	EmeraldSanctumFactory = &CommonFactory{
		Name:      "Emerald Sanctum",
		ZoneNames: []string{"emerald sanctum", "翡翠圣殿"},
		Hostiles:  FromMap(EmeraldSanctumHostiles()),
	}

	BlackrockDepthsFactory = &CommonFactory{
		Name:      "Blackrock Depths",
		ZoneNames: []string{"blackrock depths", "黑石深渊"},
		MapIDs:    []uint32{230},
		Hostiles:  FromMap(BlackrockDepthsHostiles()),
	}

	ScholomanceFactory = &CommonFactory{
		Name:      "Scholomance",
		ZoneNames: []string{"scholomance", "通灵学院"},
		Hostiles:  FromMap(ScholomanceHostiles()),
	}

	TempleOfAhnQirajFactory = &CommonFactory{
		Name:      "Temple of Ahn'Qiraj",
		ZoneNames: []string{"ahn'qiraj", "安其拉神庙"},
		MapIDs:    []uint32{531},
		Hostiles:  FromMap(TempleOfAhnQirajHostiles()),
		Rankings: &rankings.Rankings{
			Speedrun: &rankings.SpeedrunRules{
				Requirements: TempleOfAhnQirajSpeedrunRequirements(),
			},
		},
	}

	RuinsOfAhnQirajFactory = &CommonFactory{
		Name:      "Ruins of Ahn'Qiraj",
		ZoneNames: []string{"ruins of ahn'qiraj", "安其拉废墟"},
		MapIDs:    []uint32{509},
		Hostiles:  FromMap(RuinsOfAhnQirajHostiles()),
		Rankings: &rankings.Rankings{
			Speedrun: &rankings.SpeedrunRules{
				Requirements: RuinsOfAhnQirajSpeedrunRequirements(),
			},
		},
	}

	BlackwingLairFactory = &CommonFactory{
		Name:      "Blackwing Lair",
		ZoneNames: []string{"blackwing lair", "黑翼之巢"},
		MapIDs:    []uint32{469},
		Hostiles:  FromMap(BlackwingLairHostiles()),
		Rankings: &rankings.Rankings{
			Speedrun: &rankings.SpeedrunRules{
				Requirements: BlackwingLairSpeedrunRequirements(),
			},
		},
	}

	NaxxramasFactory = &CommonFactory{
		Name: "Naxxramas",
		ZoneNames: []string{"naxxramas", "the upper necropolis",
			"纳克萨玛斯", // Naxxramas
		},
		MapIDs:   []uint32{533},
		Hostiles: FromMap(NaxxramasHostiles()),
		Rankings: &rankings.Rankings{
			Speedrun: &rankings.SpeedrunRules{
				Requirements: NaxxramasSpeedrunRequirements(),
			},
		},
	}

	StratholmeFactory = &CommonFactory{
		Name:      "Stratholme",
		ZoneNames: []string{"stratholme", "斯坦索姆"},
		Hostiles:  FromMap(StratholmeHostiles()),
	}

	BlackMorassFactory = &CommonFactory{
		Name:      "Black Morass",
		ZoneNames: []string{"the black morass", "黑色沼泽"},
		MapIDs:    []uint32{269},
		Hostiles:  FromMap(TheBlackMorassHostiles()),
	}

	DireMaulFactory = &CommonFactory{
		Name:      "Dire Maul",
		ZoneNames: []string{"dire maul", "厄运之槌"},
		Hostiles:  FromMap(DireMaulHostiles()),
	}

	StormwindVaultFactory = &CommonFactory{
		Name:      "Stormwind Vault",
		ZoneNames: []string{"stormwind vault", "暴风城地牢"},
		Hostiles:  FromMap(StormwindVaultHostiles()),
	}

	StockadesFactory = &CommonFactory{
		Name:      "Stormwind Stockade",
		ZoneNames: []string{"the stockade", "监狱"},
		Hostiles:  FromMap(StockadeHostiles()),
	}

	SunkenTempleFactory = &CommonFactory{
		Name:      "Sunken Temple",
		ZoneNames: []string{"the temple of atal'hakkar", "阿塔哈卡神庙"},
		Hostiles:  FromMap(SunkenTempleHostiles()),
	}

	TimbermawHoldFactory = &CommonFactory{
		Name:      "Timbermaw Hold",
		ZoneNames: []string{"timbermaw hold"},
		Hostiles:  FromMap(TimbermawHoldHostiles()),
		Rankings: &rankings.Rankings{
			Speedrun: &rankings.SpeedrunRules{
				Requirements: TimbermawHoldSpeedrunRequirements(),
			},
		},
	}

	FrostmaneHollowFactory = &CommonFactory{
		Name:      "Frostmane Hollow",
		ZoneNames: []string{"frostmane hollow"},
		Hostiles:  FromMap(FrostmaneHollowHostiles()),
	}
)

//["Ahn'Qiraj"] = "安其拉",
//["Blackfathom Deeps"] = "黑暗深渊",
//["The Crescent Grove"] = "新月林地", -- TurtleWOW
//["Dire Maul (East)"] = "厄运之槌（东）",
//["Dire Maul (West)"] = "厄运之槌（西）",
//["Dire Maul (North)"] = "厄运之槌（北）",
//["Gilneas City"] = "吉尔尼斯城", --TurtleWOW
//["Gnomeregan"] = "诺莫瑞根",
//["Hateforge Quarry"] = "仇恨熔炉采石场", -- TurtleWOW
//["Karazhan Crypt"] = "卡拉赞墓穴", -- TurtleWOW
//["Lower Karazhan Halls"] = "卡拉赞下层大厅", -- TurtleWOW
//["Maraudon"] = "玛拉顿",
//["Razorfen Downs"] = "剃刀高地",
//["Scarlet Monastery Graveyard"] = "血色修道院-墓地", -- TurtleWOW
//["Scarlet Monastery Armory"] = "血色修道院-军械库", -- TurtleWOW
//["Uldaman"] = "奥达曼",
//["Winterspring"] = "冬泉谷",
//["Zul'Farrak"] = "祖尔法拉克",
//["Shadowfang Keep"] = "影牙城堡",
