package instances

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/database"
)

// NexusHostiles returns creature entry IDs for The Nexus dungeon (map 576).
// Bosses: Grand Magus Telestra, Anomalus, Ormorok the Tree-Shaper, Keristrasza.
// Optional boss: Commander Kolurg (Alliance) / Commander Stoutbeard (Horde).
func NexusHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		// Trash mobs
		26746: "Crazed Mana-Wraith",
		26716: "Azure Warder",
		26722: "Azure Magus",
		26727: "Mage Hunter Ascendant",
		26728: "Mage Hunter Initiate",
		26729: "Steward",
		26730: "Mage Slayer",
		26734: "Azure Enforcer",
		26735: "Azure Scale-Binder",
		26736: "Azure Skyrazor",
		26737: "Crazed Mana-Surge",
		26761: "Crazed Mana-Wyrm",
		26782: "Crystalline Keeper",
		26792: "Crystalline Protector",
		26793: "Crystalline Frayer",
		26800: "Alliance Berserker",
		26802: "Alliance Ranger",
		26805: "Alliance Cleric",
		26918: "Chaotic Rift",
		27048: "Breath Caster",
		27949: "Alliance Commander",
		28231: "Crystalline Tender",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		26731: "Grand Magus Telestra",
		26763: "Anomalus",
		26794: "Ormorok the Tree-Shaper",
		26723: "Keristrasza",
		26798: "Commander Kolurg",
		26796: "Commander Stoutbeard",
	})
	return hostile
}

var NexusFactory = &instances.CommonFactory{
	Name:      "The Nexus",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"the nexus"},
	MapIDs:    []uint32{576},
	Hostiles:  instances.FromMap(NexusHostiles()),
}

// OculusHostiles returns creature entry IDs for The Oculus dungeon (map 578).
// Hostiles are sourced from the live AzerothCore map spawns for the instance.
func OculusHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		27638: "Azure Ring Guardian",
		27636: "Azure Ley-Whelp",
		27641: "Centrifuge Construct",
		27639: "Ring-Lord Sorceress",
		27633: "Azure Inquisitor",
		28183: "Centrifuge Core",
		27635: "Azure Spellbinder",
		27640: "Ring-Lord Conjurer",
		27642: "Phantasmal Mammoth",
		27644: "Phantasmal Wolf",
		27645: "Phantasmal Cloudscraper",
		27647: "Phantasmal Ogre",
		27648: "Phantasmal Naga",
		27649: "Phantasmal Murloc",
		27650: "Phantasmal Air",
		27651: "Phantasmal Fire",
		27653: "Phantasmal Water",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		27447: "Varos Cloudstrider",
		27654: "Drakos the Interrogator",
		27655: "Mage-Lord Urom",
		27656: "Ley-Guardian Eregos",
	})
	return hostile
}

var OculusFactory = &instances.CommonFactory{
	ZoneNames: []string{"the oculus", "oculus"},
	Name:      "The Oculus",
	Category:  instances.InstanceCategoryDungeon,
	MapIDs:    []uint32{578},
	Hostiles:  instances.FromMap(OculusHostiles()),
}

// ForgeOfSoulsHostiles returns creature entry IDs for Forge of Souls (map 632).
// Hostiles are sourced from the live AzerothCore map spawns for the instance.
func ForgeOfSoulsHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		36478: "Soulguard Watchman",
		36516: "Soulguard Animator",
		36499: "Soulguard Reaper",
		36551: "Spiteful Apparition",
		36564: "Soulguard Bonecaster",
		36620: "Soulguard Adept",
		36522: "Soul Horror",
		36666: "Spectral Warden",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		36497: "Bronjahm",
		36502: "Devourer of Souls",
		37596: "Lady Sylvanas Windrunner",
	})
	return hostile
}

var ForgeOfSoulsFactory = &instances.CommonFactory{
	Name:      "Forge of Souls",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"forge of souls"},
	MapIDs:    []uint32{632},
	Hostiles:  instances.FromMap(ForgeOfSoulsHostiles()),
}

// HallsOfReflectionHostiles returns creature entry IDs for Halls of Reflection (map 668).
// Hostiles are sourced from the live AzerothCore map spawns for the instance.
func HallsOfReflectionHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		38173: "Spectral Footman",
		38172: "Phantom Mage",
		38175: "Ghostly Priest",
		38176: "Tortured Rifleman",
		38177: "Shadowy Mercenary",
		37068: "Spiritual Reflection",
		37225: "Uther the Lightbringer",
		37554: "Lady Sylvanas Windrunner",
		37779: "Dark Ranger Loralen",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		36723: "Frostsworn General",
		38112: "Falric",
		38113: "Marwyn",
		36954: "The Lich King",
		37226: "The Lich King",
		37223: "Lady Sylvanas Windrunner",
	})
	return hostile
}

var HallsOfReflectionFactory = &instances.CommonFactory{
	Name:      "Halls of Reflection",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"halls of reflection"},
	MapIDs:    []uint32{668},
	Hostiles:  instances.FromMap(HallsOfReflectionHostiles()),
}

// UtgardeKeepHostiles returns creature entry IDs for Utgarde Keep (map 574).
func UtgardeKeepHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		23956: "Dragonflayer Strategist",
		23960: "Dragonflayer Runecaster",
		23961: "Dragonflayer Ironhelm",
		24069: "Dragonflayer Bonecrusher",
		24071: "Dragonflayer Heartsplitter",
		24078: "Dragonflayer Metalworker",
		24079: "Dragonflayer Forge Master",
		24080: "Dragonflayer Weaponsmith",
		24082: "Proto-Drake Handler",
		24083: "Enslaved Proto-Drake",
		24084: "Tunneling Ghoul",
		24085: "Dragonflayer Overseer",
		24137: "Dark Ranger Marrah",
		24849: "Proto-Drake Rider",
		24864: "Dragonflayer Worker",
		28410: "Dragonflayer Spiritualist",
		28419: "Frenzied Geist",
		29735: "Savage Worg",
		30531: "Elder Jarten",
		26690: "Ymirjar Warrior",
		26692: "Ymirjar Harpooner",
		26691: "Ymirjar Witch Doctor",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		23953: "Prince Keleseth",
		23954: "Ingvar the Plunderer",
		24200: "Skarvald the Constructor",
		24201: "Dalronn the Controller",
	})
	return hostile
}

var UtgardeKeepFactory = &instances.CommonFactory{
	Name:      "Utgarde Keep",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"utgarde keep"},
	MapIDs:    []uint32{574},
	Hostiles:  instances.FromMap(UtgardeKeepHostiles()),
	FlavoredRankings: func(database.WoWFlavor) *rankings.Rankings {
		return UtgardeKeepSpeedrunRequirements()
	},
}

// UtgardePinnacleHostiles returns creature entry IDs for Utgarde Pinnacle (map 575).
func UtgardePinnacleHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		26536: "Mindless Servant",
		26550: "Dragonflayer Deathseeker",
		26553: "Dragonflayer Fanatic",
		26554: "Dragonflayer Seer",
		26555: "Scourge Hulk",
		26667: "Dragonflayer Spectator",
		26669: "Ymirjar Savage",
		26670: "Ymirjar Flesh Hunter",
		26672: "Bloodthirsty Tundra Wolf",
		26683: "Frenzied Worgen",
		26684: "Ravenous Furbolg",
		26685: "Massive Jormungar",
		26686: "Ferocious Rhino",
		26694: "Ymirjar Dusk Shaman",
		26696: "Ymirjar Berserker",
		27327: "Ritual Target",
		28368: "Ymirjar Necromancer",
		30538: "Elder Chogan'gada",
		30871: "Brigg Smallshanks",
		26690: "Ymirjar Warrior",
		26692: "Ymirjar Harpooner",
		26691: "Ymirjar Witch Doctor",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		26687: "Gortok Palehoof",
		26693: "Skadi the Ruthless",
		26861: "King Ymiron",
		29281: "Svala",
	})
	return hostile
}

var UtgardePinnacleFactory = &instances.CommonFactory{
	Name:        "Utgarde Pinnacle",
	Category:    instances.InstanceCategoryDungeon,
	MultiZone:   false,
	DerivedName: nil,
	ZoneNames:   []string{"utgarde pinnacle"},
	MapIDs:      []uint32{575},
	Hostiles:    instances.FromMap(UtgardePinnacleHostiles()),
	FlavoredRankings: func(database.WoWFlavor) *rankings.Rankings {
		return UtgardePinnacleSpeedrunRequirements()
	},
}

// CullingOfStratholmeHostiles returns creature entry IDs for Culling of Stratholme (map 595).
func CullingOfStratholmeHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		26499: "Arthas",
		26527: "Chromie",
		27729: "Enraging Ghoul",
		27731: "Acolyte",
		27734: "Crypt Fiend",
		27736: "Patchwork Construct",
		27737: "Risen Zombie",
		27745: "Lordaeron Footman",
		27746: "Lordaeron Knight",
		27747: "High Elf Mage-Priest",
		27752: "High Elf Sorceress",
		27827: "Grain Crate Helper",
		27876: "Silvio Perelli",
		27877: "Sergeant Morigan",
		27884: "Martha Goslin",
		27885: "Jena Anderson",
		27903: "Roger Owens",
		27907: "Bartleby Battson",
		27911: "Nell",
		27912: "Pepper",
		27913: "Lordaeron Crier",
		28167: "Stratholme Citizen",
		28169: "Stratholme Resident",
		28201: "Bile Golem",
		28249: "Devouring Ghoul",
		28656: "Hourglass (CoT Stratholme)",
		30547: "Postmaster Malown",
		30551: "Hearthsinger Forresten",
		30552: "Fras Siabi",
		30553: "Footman James",
		30554: "Footman Maxwell",
		30555: "Carlin Redpath",
		30556: "Marlene Redpath",
		30557: "Pamela Redpath",
		30561: "Gryan Stoutmantle",
		30565: "Joseph Redpath",
		30570: "Emery Neill",
		30571: "Michael Belfast",
		30573: "Duke",
		30574: "Arion",
		30994: "Magistrate Barthilas",
		30996: "CoT Stratholme - Crates KC Bunny",
		30997: "Chromie",
		31018: "Edward Orrick",
		31020: "Olivia Zenith",
		31023: "Brandon Eiredeck",
		31028: "Patricia O'Reilly",
		31057: "Mechanical Greeter RY7R",
		31126: "Agitated Stratholme Citizen",
		31127: "Agitated Stratholme Resident",
		31178: "Enraging Ghoul (1)",
		31179: "Devouring Ghoul (1)",
		31187: "Crypt Fiend (1)",
		31199: "Patchwork Construct (1)",
		31200: "Bile Golem (1)",
		31201: "Acolyte (1)",
		31208: "Risen Zombie (1)",
		31210: "Arthas (1)",
	})
	return hostile
}

var CullingOfStratholmeFactory = &instances.CommonFactory{
	Name:      "Culling of Stratholme",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"the culling of stratholme"},
	MapIDs:    []uint32{595},
	Hostiles:  instances.FromMap(CullingOfStratholmeHostiles()),
}

// HallsOfStoneHostiles returns creature entry IDs for Halls of Stone (map 599).
func HallsOfStoneHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		22515: "World Trigger",
		27960: "Dark Rune Warrior",
		27961: "Dark Rune Worker",
		27962: "Dark Rune Elementalist",
		27963: "Dark Rune Theurgist",
		27964: "Dark Rune Scholar",
		27965: "Dark Rune Shaper",
		27966: "Dark Rune Controller",
		27969: "Dark Rune Giant",
		27970: "Raging Construct",
		27971: "Unrelenting Construct",
		27972: "Lightning Construct",
		27973: "Crystalline Shardling",
		28055: "Channel Target",
		28149: "Earthen Protector",
		28824: "Brann Flying Machine",
		30535: "Elder Yurauk",
		27979: "Forged Iron Trogg",
		27980: "Earthen Dwarf",
		27981: "Malformed Ooze",
		27982: "Forged Iron Dwarf",
		27983: "Dark Rune Protector",
		27984: "Dark Rune Stormcaller",
		27985: "Iron Golem Custodian",
		28384: "Lesser Air Elemental",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		27975: "Maiden of Grief",
		27977: "Krystallus",
		27978: "Sjonnir The Ironshaper",
		28070: "Brann Bronzebeard",
	})
	return hostile
}

var HallsOfStoneFactory = &instances.CommonFactory{
	Name:      "Halls of Stone",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"halls of stone"},
	MapIDs:    []uint32{599},
	Hostiles:  instances.FromMap(HallsOfStoneHostiles()),
}

// DrakTharonKeepHostiles returns creature entry IDs for Drak'Tharon Keep (map 600).
func DrakTharonKeepHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		26620: "Drakkari Guardian",
		26621: "Ghoul Tormentor",
		26622: "Drakkari Bat",
		26623: "Scourge Brute",
		26624: "Wretched Belcher",
		26625: "Darkweb Recluse",
		26626: "Scourge Reanimator",
		26628: "Drakkari Scytheclaw",
		26635: "Risen Drakkari Warrior",
		26636: "Risen Drakkari Soulmage",
		26637: "Risen Drakkari Handler",
		26638: "Risen Drakkari Bat Rider",
		26639: "Drakkari Shaman",
		26641: "Drakkari Gutripper",
		26675: "Spider Summon Target",
		26712: "Crystal Channel Target",
		26830: "Risen Drakkari Death Knight",
		27431: "Drakkari Commander",
		27490: "Cosmetic Drakkari Bat [PH]",
		27871: "Flesheating Ghoul",
		27909: "Darkweb Victim",
		30534: "Elder Kilias",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		26630: "Trollgore",
		26631: "Novos the Summoner",
		26632: "The Prophet Tharon'ja",
		27483: "King Dred",
	})
	return hostile
}

var DrakTharonKeepFactory = &instances.CommonFactory{
	Name:      "Drak'Tharon Keep",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"drak'tharon keep"},
	MapIDs:    []uint32{600},
	Hostiles:  instances.FromMap(DrakTharonKeepHostiles()),
}

// AzjolNerubHostiles returns creature entry IDs for Azjol-Nerub (map 601).
func AzjolNerubHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		22515: "World Trigger",
		23472: "World Trigger (Large AOI, Not Immune PC/NPC)",
		28732: "Anub'ar Warrior",
		28734: "Anub'ar Skirmisher",
		29128: "Anub'ar Prime Guard",
		29335: "Anub'ar Webspinner",
		29340: "Anub'ar Brood Keeper",
		30533: "Elder Nurgen",
		31587: "Anub'ar Brood Keeper (1)",
		31604: "Anub'ar Prime Guard (1)",
		31606: "Anub'ar Skirmisher (1)",
		31608: "Anub'ar Warrior (1)",
		31609: "Anub'ar Webspinner (1)",
		31610: "Anub'arak (1)",
		31611: "Hadronox (1)",
		31612: "Krik'thir the Gatewatcher (1)",
		32593: "Skittering Swarmer",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		28684: "Krik'thir the Gatewatcher",
		28921: "Hadronox",
		29120: "Anub'arak",
	})
	return hostile
}

var AzjolNerubFactory = &instances.CommonFactory{
	Name:      "Azjol-Nerub",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"azjol-nerub"},
	MapIDs:    []uint32{601},
	Hostiles:  instances.FromMap(AzjolNerubHostiles()),
}

// HallsOfLightningHostiles returns creature entry IDs for Halls of Lightning (map 602).
func HallsOfLightningHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		28547: "Storming Vortex",
		28578: "Hardened Steel Reaver",
		28579: "Hardened Steel Berserker",
		28580: "Hardened Steel Skycaller",
		28581: "Stormforged Tactician",
		28582: "Stormforged Mender",
		28583: "Blistering Steamrager",
		28584: "Unbound Firestorm",
		28585: "Slag",
		28823: "Volkhan's Anvil",
		28825: "Cyclone",
		28826: "Stormfury Revenant",
		28835: "Stormforged Construct",
		28836: "Stormforged Runeshaper",
		28837: "Stormforged Sentinel",
		28838: "Titanium Vanguard",
		28920: "Stormforged Giant",
		28961: "Titanium Siegebreaker",
		28965: "Titanium Thunderer",
		29048: "Ulduar Monitor",
		30964: "Blistering Steamrager (1)",
		30965: "Cyclone (1)",
		30966: "Hardened Steel Berserker (1)",
		30967: "Hardened Steel Reaver (1)",
		30968: "Hardened Steel Skycaller (1)",
		30970: "Slag (1)",
		30971: "Stormforged Construct (1)",
		30972: "Stormforged Giant (1)",
		30974: "Stormforged Mender (1)",
		30975: "Stormforged Runeshaper (1)",
		30976: "Stormforged Sentinel (1)",
		30977: "Stormforged Tactician (1)",
		30978: "Stormfury Revenant (1)",
		30979: "Storming Vortex (1)",
		30980: "Titanium Siegebreaker (1)",
		30981: "Titanium Vanguard (1)",
		30982: "Titanium Thunderer (1)",
		30983: "Unbound Firestorm (1)",
		31533: "General Bjarngrim (1)",
		31536: "Volkhan (1)",
		31537: "Ionar (1)",
		31538: "Loken (1)",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		28546: "Ionar",
		28586: "General Bjarngrim",
		28587: "Volkhan",
		28923: "Loken",
	})
	return hostile
}

var HallsOfLightningFactory = &instances.CommonFactory{
	Name:      "Halls of Lightning",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"halls of lightning"},
	MapIDs:    []uint32{602},
	Hostiles:  instances.FromMap(HallsOfLightningHostiles()),
}

// GundrakHostiles returns creature entry IDs for Gundrak (map 604).
func GundrakHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		22517: "World Trigger (Large AOI)",
		29630: "Fanged Pit Viper",
		29637: "Crafty Snake",
		29682: "Slad'ran Summon Target",
		29768: "Unyielding Constrictor",
		29774: "Spitting Cobra",
		29819: "Drakkari Lancer",
		29820: "Drakkari God Hunter",
		29822: "Drakkari Fire Weaver",
		29826: "Drakkari Medicine Man",
		29829: "Drakkari Earthshaker",
		29830: "Living Mojo",
		29832: "Drakkari Golem",
		29834: "Drakkari Frenzy",
		29838: "Drakkari Rhino",
		29874: "Drakkari Inciter",
		29920: "Ruins Dweller",
		29931: "Drakkari Rhino",
		30537: "Elder Ohanzee",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		29304: "Slad'ran",
		29305: "Moorabi",
		29306: "Gal'darah",
		29307: "Drakkari Colossus",
	})
	return hostile
}

var GundrakFactory = &instances.CommonFactory{
	Name:      "Gundrak",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"gundrak"},
	MapIDs:    []uint32{604},
	Hostiles:  instances.FromMap(GundrakHostiles()),
}

// VioletHoldHostiles returns creature entry IDs for Violet Hold (map 608).
func VioletHoldHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		29276: "Ethereal Summon Target",
		29395: "Erekem Guard",
		29425: "Erekem Controller",
		30658: "Lieutenant Sinclari",
		30659: "Violet Hold Guard",
		30857: "Defense Dummy Target",
		30883: "Dalaran Prison Event Controller",
		30896: "Prison Door Seal",
		31118: "Azure Raider",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		29266: "Xevozz",
		29312: "Lavanthor",
		29313: "Ichoron",
		29314: "Zuramat the Obliterator",
		29315: "Erekem",
		29316: "Moragg",
	})
	return hostile
}

var VioletHoldFactory = &instances.CommonFactory{
	Name:      "Violet Hold",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"the violet hold"},
	MapIDs:    []uint32{608},
	Hostiles:  instances.FromMap(VioletHoldHostiles()),
}

// AhnkahetOldKingdomHostiles returns creature entry IDs for Ahn'kahet: The Old Kingdom (map 619).
func AhnkahetOldKingdomHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		30111: "Twilight Worshipper",
		30179: "Twilight Apostle",
		30276: "Ahn'kahar Web Winder",
		30277: "Ahn'kahar Slasher",
		30278: "Ahn'kahar Spell Flinger",
		30279: "Deep Crawler",
		30283: "Plague Walker",
		30284: "Bonegrinder",
		30285: "Eye of Taldaram",
		30286: "Frostbringer",
		30287: "Plundering Geist",
		30288: "Ahn'kahar Channeler",
		30319: "Twilight Darkcaster",
		30329: "Savage Cave Beast",
		30338: "Ahn'kahar Swarmer",
		30413: "Channel Image Target",
		30414: "Forgotten One",
		30416: "Bound Fire Elemental",
		30418: "Bound Air Elemental",
		30419: "Bound Water Elemental",
		31104: "Ahn'kahar Watcher",
		31105: "Ahn'kahet Brazier KC Bunny",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		29308: "Prince Taldaram",
		29309: "Elder Nadox",
		29310: "Jedoga Shadowseeker",
		29311: "Herald Volazj",
		30258: "Amanitar",
	})
	return hostile
}

var AhnkahetOldKingdomFactory = &instances.CommonFactory{
	Name:      "Ahn'kahet: The Old Kingdom",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"ahn'kahet: the old kingdom"},
	MapIDs:    []uint32{619},
	Hostiles:  instances.FromMap(AhnkahetOldKingdomHostiles()),
}

// TrialOfTheChampionHostiles returns creature entry IDs for Trial of the Champion (map 650).
func TrialOfTheChampionHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		34856: "Dwarven Coliseum Spectator",
		34857: "Troll Coliseum Spectator",
		34858: "Tauren Coliseum Spectator",
		34859: "Orcish Coliseum Spectator",
		34860: "Forsaken Coliseum Spectator",
		34861: "Blood Elf Coliseum Spectator",
		34868: "Draenei Coliseum Spectator",
		34869: "Gnomish Coliseum Spectator",
		34870: "Human Coliseum Spectator",
		34871: "Night Elf Coliseum Spectator",
		34883: "[ph] Argent Raid Spectator - FX - Horde",
		34901: "[ph] Argent Raid Spectator - FX - Orc",
		34902: "[ph] Argent Raid Spectator - FX - Troll",
		34903: "[ph] Argent Raid Spectator - FX - Tauren",
		34904: "[ph] Argent Raid Spectator - FX - Blood Elf",
		34905: "[ph] Argent Raid Spectator - FX - Undead",
		34966: "Argent Crusade Spectator",
		34970: "Argent Crusade Spectator",
		34974: "Argent Crusade Spectator",
		34975: "Argent Crusade Spectator",
		34977: "Argent Crusade Spectator",
		34979: "Argent Crusade Spectator",
		35016: "[ph] Argent Raid Spectator - Generic Bunny",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		33628: "Highlord Tirion Fordring",
	})
	return hostile
}

var TrialOfTheChampionFactory = &instances.CommonFactory{
	Name:      "Trial of the Champion",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"trial of the champion"},
	MapIDs:    []uint32{650},
	Hostiles:  instances.FromMap(TrialOfTheChampionHostiles()),
}

// PitOfSaronHostiles returns creature entry IDs for Pit of Saron (map 658).
func PitOfSaronHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		36661: "Rimefang",
		36764: "Alliance Slave",
		36765: "Alliance Slave",
		36766: "Alliance Slave",
		36767: "Alliance Slave",
		36770: "Horde Slave",
		36771: "Horde Slave",
		36772: "Horde Slave",
		36773: "Horde Slave",
		36788: "Deathwhisper Necrolyte",
		36794: "Scourgelord Tyrannus",
		36830: "Wrathbone Laborer",
		36841: "Fallen Warrior",
		36848: "Invisible Stalker",
		36874: "Disturbed Glacial Revenant",
		36877: "Wrathbone Skeleton",
		36879: "Plagueborn Horror",
		36881: "Skeletal Slave",
		36886: "Geist Ambusher",
		36888: "Rescued Alliance Slave",
		36889: "Rescued Horde Slave",
		36891: "Iceborn Proto-Drake",
		36896: "Stonespine Gargoyle",
		36907: "Wrathbone Siegesmith",
		36913: "Eye of the Lich King",
		37609: "Deathwhisper Necrolyte (1)",
		37612: "Fallen Warrior (1)",
		37613: "Forgemaster Garfrost (1)",
		37622: "Geist Ambusher (1)",
		37626: "Iceborn Proto-Drake (1)",
		37627: "Ick (1)",
		37635: "Plagueborn Horror (1)",
		37636: "Stonespine Gargoyle (1)",
		37638: "Wrathbone Laborer (1)",
		37639: "Wrathbone Siegesmith (1)",
		37640: "Wrathbone Skeleton (1)",
		37645: "Alliance Slave (1)",
		37646: "Alliance Slave (1)",
		37647: "Alliance Slave (1)",
		37648: "Alliance Slave (1)",
		37649: "Horde Slave (1)",
		37650: "Horde Slave (1)",
		37651: "Horde Slave (1)",
		37652: "Horde Slave (1)",
		37656: "Skeletal Slave (1)",
		37711: "Hungering Ghoul",
		37712: "Deathwhisper Shadowcaster",
		37713: "Deathwhisper Torturer",
		37728: "Wrathbone Sorcerer",
		37731: "Wrathbone Sorcerer (1)",
		38025: "Deathwhisper Shadowcaster (1)",
		38026: "Deathwhisper Torturer (1)",
		38249: "Hungering Ghoul (1)",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		36476: "Ick",
		36494: "Forgemaster Garfrost",
		36990: "Lady Sylvanas Windrunner",
	})
	return hostile
}

var PitOfSaronFactory = &instances.CommonFactory{
	Name:      "Pit of Saron",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"pit of saron"},
	MapIDs:    []uint32{658},
	Hostiles:  instances.FromMap(PitOfSaronHostiles()),
}
