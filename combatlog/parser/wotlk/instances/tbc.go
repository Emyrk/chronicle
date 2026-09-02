package instances

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
)

// MagtheridonsLairHostiles returns creature entry IDs for Magtheridon's Lair (map 544).
func MagtheridonsLairHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		18829: "Hellfire Warder",
		17256: "Hellfire Channeler",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		17257: "Magtheridon",
	})
	return hostile
}

var MagtheridonsLairFactory = &instances.CommonFactory{
	Name:      "Magtheridon's Lair",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"magtheridon's lair"},
	MapIDs:    []uint32{544},
	Hostiles:  instances.FromMap(MagtheridonsLairHostiles()),
}

func BloodFurnaceHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		17370: "Laughing Skull Enforcer",
		17371: "Shadowmoon Warlock",
		17395: "Shadowmoon Summoner",
		17397: "Shadowmoon Adept",
		17398: "Nascent Fel Orc",
		17399: "Seductress",
		17400: "Felguard Annihilator",
		17401: "Felhound Manastalker",
		17414: "Shadowmoon Technician",
		17477: "Hellfire Imp",
		17491: "Laughing Skull Rogue",
		17624: "Laughing Skull Warden",
		17626: "Laughing Skull Legionnaire",
		17653: "Shadowmoon Channeler",
		17662: "Broggok Poison Cloud",
		18894: "Felguard Brute",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		17380: "Broggok",
		17377: "Keli'dan the Breaker",
		17381: "The Maker",
	})
	return hostile
}

var BloodFurnaceFactory = &instances.CommonFactory{
	Name:      "The Blood Furnace",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"the blood furnace", "hellfire citadel: the blood furnace"},
	MapIDs:    []uint32{542},
	Hostiles:  instances.FromMap(BloodFurnaceHostiles()),
}

// SethekkHallsHostiles returns creature entry IDs for Sethekk Halls (map 556).
func SethekkHallsHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		18318: "Sethekk Initiate",
		18319: "Time-Lost Scryer",
		18320: "Time-Lost Shadowmage",
		18321: "Sethekk Talon Lord",
		18322: "Sethekk Ravenguard",
		18323: "Sethekk Guard",
		18325: "Sethekk Prophet",
		18326: "Sethekk Shaman",
		18327: "Time-Lost Controller",
		18328: "Sethekk Oracle",
		18956: "Lakka",
		19428: "Cobalt Serpent",
		19429: "Avian Darkhawk",
		23058: "Invis Raven God Caster",

		19203: "Syth Fire Elemental",
		19204: "Syth Frost Elemental",
		19205: "Syth Arcane Elemental",
		19206: "Syth Shadow Elemental",

		21891: "Avian Ripper",
		21904: "Avian Warhawk",
		23132: "Brood of Anzu",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		18472: "Darkweaver Syth",
		18473: "Talon King Ikiss",
		23035: "Anzu",
	})
	return hostile
}

var SethekkHallsFactory = &instances.CommonFactory{
	Name:      "Sethekk Halls",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"sethekk halls", "auchindoun: sethekk halls"},
	MapIDs:    []uint32{556},
	Hostiles:  instances.FromMap(SethekkHallsHostiles()),
}

// BlackMorassHostiles returns creature entry IDs for The Black Morass (map 269).
func BlackMorassHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		18982: "Sable Jaguar",
		18983: "Blackfang Tarantula",
		20075: "Darkwater Crocolisk",
		20201: "Sa'at",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		15608: "Medivh",
	})
	return hostile
}

var BlackMorassFactory = &instances.CommonFactory{
	Name:      "The Black Morass",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"the black morass", "opening of the dark portal"},
	MapIDs:    []uint32{269},
	Hostiles:  instances.FromMap(BlackMorassHostiles()),
}

// ShatteredHallsHostiles returns creature entry IDs for The Shattered Halls (map 540).
func ShatteredHallsHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		16507: "Shattered Hand Sentry",
		16593: "Shattered Hand Brawler",
		16594: "Shadowmoon Acolyte",
		16699: "Shattered Hand Reaver",
		16700: "Shattered Hand Legionnaire",
		16704: "Shattered Hand Sharpshooter",
		17083: "Fel Orc Convert",
		17289: "Rifleman Brownbeard",
		17290: "Captain Alina",
		17292: "Private Jacint",
		17301: "Shattered Hand Executioner",
		17356: "Creeping Ooze",
		17357: "Creeping Oozeling",
		17420: "Shattered Hand Heathen",
		17427: "Shattered Hand Archer",
		17461: "Shattered Hand Blood Guard",
		17464: "Shattered Hand Gladiator",
		17465: "Shattered Hand Centurion",
		17474: "Target Trigger",
		17622: "Sharpshooter Guard",
		17669: "Rabid Warhound",
		17670: "Shattered Hand Houndmaster",
		17671: "Shattered Hand Champion",
		17694: "Shadowmoon Darkcaster",
		17695: "Shattered Hand Assassin",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		16807: "Grand Warlock Nethekurse",
		16808: "Warchief Kargath Bladefist",
		16809: "Warbringer O'mrogg",
		20923: "Blood Guard Porung",
	})
	return hostile
}

var ShatteredHallsFactory = &instances.CommonFactory{
	Name:      "The Shattered Halls",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"the shattered halls"},
	MapIDs:    []uint32{540},
	Hostiles:  instances.FromMap(ShatteredHallsHostiles()),
}

// HellfireRampartsHostiles returns creature entry IDs for Hellfire Ramparts (map 543).
func HellfireRampartsHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		17259: "Bonechewer Hungerer",
		17264: "Bonechewer Ravener",
		17269: "Bleeding Hollow Darkcaster",
		17270: "Bleeding Hollow Archer",
		17271: "Bonechewer Destroyer",
		17280: "Shattered Hand Warhound",
		17281: "Bonechewer Ripper",
		17309: "Hellfire Watcher",
		17455: "Bonechewer Beastmaster",
		17478: "Bleeding Hollow Scryer",
		17517: "Hellfire Sentry",

		// ?? Unsure
		//
	})
	instances.LoadBosses(hostile, map[uint32]string{
		17306: "Watchkeeper Gargolmar",
		17308: "Omor the Unscarred",

		// 17537 from logs, and 17307 from az core data dump
		17307: "Vazruden the Herald",
		17537: "Vazruden",
	})

	hostile[17536] = instances.Identity{
		Affiliation:   types.AffiliationHostile,
		Name:          "Nazan",
		EncounterName: "",
		Boss:          true,
		EncounterNameFn: func(f encounter.Fight) *identifier.EncounterFuncResult {
			for _, host := range f.Hostiles {
				entry, _ := host.ID.GetEntry()
				if entry == 17537 || entry == 17307 {
					return &identifier.EncounterFuncResult{
						EncounterName: "Vazruden",
						Bosses:        nil,
					}
				}
			}
			return nil
		},
	}

	return hostile
}

var HellfireRampartsFactory = &instances.CommonFactory{
	Name:      "Hellfire Ramparts",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"hellfire ramparts", "hellfire citadel: ramparts"},
	MapIDs:    []uint32{543},
	Hostiles:  instances.FromMap(HellfireRampartsHostiles()),
}

// SteamvaultHostiles returns creature entry IDs for The Steamvault (map 545).
func SteamvaultHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		17721: "Coilfang Engineer",
		17722: "Coilfang Sorceress",
		17799: "Dreghood Slave",
		17800: "Coilfang Myrmidon",
		17801: "Coilfang Siren",
		17802: "Coilfang Warrior",
		17803: "Coilfang Oracle",
		17805: "Coilfang Slavemaster",
		17917: "Coilfang Water Elemental",
		17954: "Naga Distiller",
		21338: "Coilfang Leper",
		21694: "Bog Overlord",
		21695: "Tidal Surger",
		21696: "Steam Surger",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		17796: "Mekgineer Steamrigger",
		17797: "Hydromancer Thespia",
		17798: "Warlord Kalithresh",
	})
	return hostile
}

var SteamvaultFactory = &instances.CommonFactory{
	Name:      "The Steamvault",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"the steamvault"},
	MapIDs:    []uint32{545},
	Hostiles:  instances.FromMap(SteamvaultHostiles()),
}

// UnderbogHostiles returns creature entry IDs for The Underbog (map 546).
func UnderbogHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		17723: "Bog Giant",
		17724: "Underbat",
		17725: "Underbog Lurker",
		17726: "Wrathfin Myrmidon",
		17727: "Wrathfin Sentry",
		17728: "Murkblood Tribesman",
		17729: "Murkblood Spearman",
		17731: "Fen Ray",
		17734: "Underbog Lord",
		17735: "Wrathfin Warrior",
		17771: "Murkblood Oracle",
		17827: "Claw",
		17871: "Underbog Shambler",
		17885: "Earthbinder Rayge",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		17770: "Hungarfen",
		17826: "Swamplord Musel'ek",
		17882: "The Black Stalker",
		18105: "Ghaz'an",
	})
	return hostile
}

var UnderbogFactory = &instances.CommonFactory{
	Name:      "The Underbog",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"the underbog", "coilfang: the underbog"},
	MapIDs:    []uint32{546},
	Hostiles:  instances.FromMap(UnderbogHostiles()),
}

// SlavePensHostiles returns creature entry IDs for The Slave Pens (map 547).
func SlavePensHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		17816: "Bogstrok",
		17817: "Greater Bogstrok",
		17890: "Weeder Greenthumb",
		17893: "Naturalist Bite",
		17938: "Coilfang Observer",
		17940: "Coilfang Technician",
		17957: "Coilfang Champion",
		17958: "Coilfang Defender",
		17959: "Coilfang Slavehandler",
		17960: "Coilfang Soothsayer",
		17961: "Coilfang Enchantress",
		17962: "Coilfang Collaborator",
		17963: "Wastewalker Slave",
		17964: "Wastewalker Worker",
		18206: "Wastewalker Captive",
		21126: "Coilfang Scale-Healer",
		21127: "Coilfang Tempest",
		21128: "Coilfang Ray",
		22421: "Skar'this the Heretic",
		25697: "Luma Skymother",
		25710: "Numa Cloudsister",
		25754: "Earthen Ring Flamecaller",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		17941: "Mennu the Betrayer",
		17942: "Quagmirran",
		17991: "Rokmar the Crackler",
	})
	return hostile
}

var SlavePensFactory = &instances.CommonFactory{
	Name:      "The Slave Pens",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"coilfang: the slave pens", "the slave pens"},
	MapIDs:    []uint32{547},
	Hostiles:  instances.FromMap(SlavePensHostiles()),
}

// ArcatrazHostiles returns creature entry IDs for The Arcatraz (map 552).
func ArcatrazHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		20857: "Arcatraz Defender",
		20859: "Arcatraz Warder",
		20864: "Protean Nightmare",
		20865: "Protean Horror",
		20866: "Soul Devourer",
		20867: "Death Watcher",
		20869: "Arcatraz Sentinel",
		20873: "Negaton Warp-Master",
		20875: "Negaton Screamer",
		20879: "Eredar Soul-Eater",
		20880: "Eredar Deathbringer",
		20881: "Unbound Devastator",
		20882: "Skulking Witch",
		20883: "Spiteful Temptress",
		20896: "Ethereum Slayer",
		20897: "Ethereum Wave-Caster",
		20898: "Gargantuan Abyssal",
		20900: "Unchained Doombringer",
		20901: "Sargeron Archer",
		20902: "Sargeron Hellcaller",
		20904: "Warden Mellichar",
		21186: "Arcane Warder Target",
		21304: "Warder Corpse",
		21702: "Ethereum Life-Binder",
		21962: "Udalo",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		20870: "Zereketh the Unbound",
		20885: "Dalliah the Doomsayer",
		20886: "Wrath-Scryer Soccothrates",
	})
	return hostile
}

var ArcatrazFactory = &instances.CommonFactory{
	Name:      "The Arcatraz",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"the arcatraz"},
	MapIDs:    []uint32{552},
	Hostiles:  instances.FromMap(ArcatrazHostiles()),
}

// BotanicaHostiles returns creature entry IDs for The Botanica (map 553).
func BotanicaHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		17993: "Bloodwarder Protector",
		17994: "Bloodwarder Falconer",
		18155: "Bloodfalcon",
		18404: "Bloodwarder Steward",
		18405: "Tempest-Forge Peacekeeper",
		18419: "Bloodwarder Greenkeeper",
		18420: "Sunseeker Geomancer",
		18421: "Sunseeker Researcher",
		18422: "Sunseeker Botanist",
		18587: "Frayer",
		19486: "Sunseeker Chemist",
		19505: "Sunseeker Channeler",
		19507: "Sunseeker Gene-Splicer",
		19508: "Sunseeker Herbalist",
		19509: "Sunseeker Harvester",
		19511: "Nethervine Inciter",
		19512: "Nethervine Reaper",
		19513: "Mutate Fear-Shrieker",
		19557: "Greater Frayer",
		19598: "Mutate Fleshlasher",
		19608: "Frayer Wildling",
		19633: "Bloodwarder Mender",
		19843: "Nethervine Trickster",
		19865: "Mutate Horror",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		17975: "High Botanist Freywinn",
		17976: "Commander Sarannis",
		17977: "Warp Splinter",
		17978: "Thorngrin the Tender",
		17980: "Laj",
	})
	return hostile
}

var BotanicaFactory = &instances.CommonFactory{
	Name:      "The Botanica",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"the botanica"},
	MapIDs:    []uint32{553},
	Hostiles:  instances.FromMap(BotanicaHostiles()),
}

// MechanarHostiles returns creature entry IDs for The Mechanar (map 554).
func MechanarHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		19166: "Tempest-Forge Patroller",
		19167: "Bloodwarder Slayer",
		19168: "Sunseeker Astromage",
		19231: "Mechanar Crusher",
		19510: "Bloodwarder Centurion",
		19712: "Mechanar Driller",
		19713: "Mechanar Wrecker",
		19716: "Mechanar Tinkerer",
		19735: "Tempest-Forge Destroyer",
		20059: "Sunseeker Netherbinder",
		20988: "Sunseeker Engineer",
		20990: "Bloodwarder Physician",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		19218: "Gatewatcher Gyro-Kill",
		19219: "Mechano-Lord Capacitus",
		19220: "Pathaleon the Calculator",
		19221: "Nethermancer Sepethrea",
		19710: "Gatewatcher Iron-Hand",
	})
	return hostile
}

var MechanarFactory = &instances.CommonFactory{
	Name:      "The Mechanar",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"the mechanar"},
	MapIDs:    []uint32{554},
	Hostiles:  instances.FromMap(MechanarHostiles()),
}

// ShadowLabyrinthHostiles returns creature entry IDs for Shadow Labyrinth (map 555).
func ShadowLabyrinthHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		18631: "Cabal Cultist",
		18632: "Cabal Executioner",
		18633: "Cabal Acolyte",
		18634: "Cabal Summoner",
		18635: "Cabal Deathsworn",
		18636: "Cabal Assassin",
		18637: "Cabal Shadow Priest",
		18638: "Cabal Zealot",
		18639: "Cabal Spellbinder",
		18640: "Cabal Warlock",
		18641: "Cabal Familiar",
		18642: "Fel Guardhound",
		18793: "Invisible Target",
		18794: "Cabal Ritualist",
		18796: "Fel Overseer",
		18797: "Tortured Skeleton",
		18830: "Cabal Fanatic",
		18848: "Malicious Instructor",
		18891: "Spy To'gun",
		19208: "Summoned Cabal Acolyte",
		19209: "Summoned Cabal Deathsworn",
		19300: "Blackheart the Inciter",
		19301: "Blackheart the Inciter",
		19302: "Blackheart the Inciter",
		19303: "Blackheart the Inciter",
		19304: "Blackheart the Inciter",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		18667: "Blackheart the Inciter",
		18708: "Murmur",
		18731: "Ambassador Hellmaw",
		18732: "Grandmaster Vorpil",
	})
	return hostile
}

var ShadowLabyrinthFactory = &instances.CommonFactory{
	Name:      "Shadow Labyrinth",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"shadow labyrinth"},
	MapIDs:    []uint32{555},
	Hostiles:  instances.FromMap(ShadowLabyrinthHostiles()),
}

// ManaTombsHostiles returns creature entry IDs for Mana-Tombs (map 557).
func ManaTombsHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		18309: "Ethereal Scavenger",
		18311: "Ethereal Crypt Raider",
		18312: "Ethereal Spellbinder",
		18313: "Ethereal Sorcerer",
		18314: "Nexus Stalker",
		18315: "Ethereal Theurgist",
		18317: "Ethereal Priest",
		18331: "Ethereal Darkcaster",
		18429: "Arcane Fiend",
		18431: "Ethereal Beacon",
		19306: "Mana Leech",
		19307: "Nexus Terror",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		18341: "Pandemonius",
		18343: "Tavarok",
		18344: "Nexus-Prince Shaffar",
	})
	return hostile
}

var ManaTombsFactory = &instances.CommonFactory{
	Name:      "Mana-Tombs",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"mana-tombs", "auchindoun: mana-tombs"},
	MapIDs:    []uint32{557},
	Hostiles:  instances.FromMap(ManaTombsHostiles()),
}

// AuchenaiCryptsHostiles returns creature entry IDs for Auchenai Crypts (map 558).
func AuchenaiCryptsHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		18493: "Auchenai Soulpriest",
		18495: "Auchenai Vindicator",
		18497: "Auchenai Monk",
		18521: "Raging Skeleton",
		18524: "Angered Skeleton",
		18700: "Reanimated Bones",
		18702: "Auchenai Necromancer",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		18371: "Shirrak the Dead Watcher",
		18373: "Exarch Maladaar",
	})
	return hostile
}

var AuchenaiCryptsFactory = &instances.CommonFactory{
	Name:      "Auchenai Crypts",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"auchindoun: auchenai crypts", "auchenai crypts"},
	MapIDs:    []uint32{558},
	Hostiles:  instances.FromMap(AuchenaiCryptsHostiles()),
}

// OldHillsbradHostiles returns creature entry IDs for Old Hillsbrad Foothills (map 560).
func OldHillsbradHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		2350:  "Forest Moss Creeper",
		2354:  "Vicious Gray Bear",
		2385:  "Feral Mountain Lion",
		2408:  "Snapjaw",
		8883:  "Riding Horse",
		17814: "Lordaeron Watchman",
		17815: "Lordaeron Sentry",
		17819: "Durnholde Sentry",
		17820: "Durnholde Rifleman",
		17833: "Durnholde Warden",
		17840: "Durnholde Tracking Hound",
		17846: "Pit Spectator",
		17860: "Durnholde Veteran",
		17876: "Thrall",
		18092: "Tarren Mill Guardsman",
		18093: "Tarren Mill Protector",
		18094: "Tarren Mill Lookout",
		18598: "Orc Prisoner",
		18644: "Tarren Mill Peasant",
		18649: "Innkeeper Monica",
		18655: "Jay Lemieux",
		18656: "Julie Honeywell",
		18666: "Dalaran Sorceress",
		18673: "Pit Announcer",
		18723: "Erozion",
		18725: "Brazen",
		18764: "Durnholde Armorer",
		18765: "Durnholde Cook",
		18887: "Taretha",
		20342: "Hal McAllister",
		20344: "Nat Pagle",
		20345: "Commander Mograine",
		20346: "Isillien",
		20347: "Abbendis",
		20348: "Fairbanks",
		20349: "Tirion Fordring",
		20350: "Kel'Thuzad",
		20351: "Captain Sanders",
		20352: "Arcanist Doan",
		20353: "Helcular",
		20354: "Nathanos Marris",
		20355: "Stalvan Mistmantle",
		20357: "Sally Whitemane",
		20358: "Renault Mograine",
		20360: "Herod the Bully",
		20361: "Taelan",
		20363: "Caretaker Smithers",
		20365: "Bartolo Ginsetti",
		20368: "Farmer Kent",
		20370: "Phin Odelic",
		20372: "Jonathan Revah",
		20373: "Magistrate Henry Maleb",
		20376: "Jerry Carter",
		20379: "Bilger the Straight-laced",
		20380: "Raleigh the True",
		20400: "Captain Edward Hanes",
		20401: "Frances Lin",
		20419: "Zixil",
		20422: "Kirin Tor Mage",
		20424: "Hillsbrad Peasant",
		20426: "Hillsbrad Citizen",
		20428: "Hillsbrad Citizen",
		20429: "Hillsbrad Citizen",
		20430: "Hillsbrad Citizen",
		20432: "Beggar",
		20433: "Hillsbrad Farmer",
		20434: "Horse",
		20441: "Natasha Morris",
		21341: "Victor",
		21342: "Alex",
		21343: "Harvey",
		21344: "Phil",
		21345: "Hugh",
		23176: "Tarren Mill Guardsman",
		23178: "Tarren Mill Lookout",
		28132: "Don Carlos",
	})
	return hostile
}

var OldHillsbradFactory = &instances.CommonFactory{
	Name:      "Old Hillsbrad Foothills",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"old hillsbrad foothills"},
	MapIDs:    []uint32{560},
	Hostiles:  instances.FromMap(OldHillsbradHostiles()),
}

// MagistersTerraceHostiles returns creature entry IDs for Magisters' Terrace (map 585).
func MagistersTerraceHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		24683: "Sunblade Mage Guard",
		24684: "Sunblade Blood Knight",
		24685: "Sunblade Magister",
		24686: "Sunblade Warlock",
		24687: "Sunblade Physician",
		24688: "Wretched Skulker",
		24689: "Wretched Bruiser",
		24690: "Wretched Husk",
		24696: "Coilskar Witch",
		24697: "Sister of Torment",
		24698: "Ethereum Smuggler",
		24761: "Brightscale Wyrm",
		24777: "Sunblade Sentinel",
		24808: "Broken Sentinel",
		24822: "Tyrith",
		25954: "Shadowsword Guardian Sunwell",
		25955: "Hand of the Deceiver Sunwell",
		25956: "Chaos Gazer Sunwell",
		25957: "Cataclysm Hound Sunwell",
		25958: "Volatile Felfire Fiend Sunwell",
		25959: "Apocalypse Guard Sunwell",
		26057: "Anveena Marker",
		26579: "Anveena Replica",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		24560: "Priestess Delrissa",
		24664: "Kael'thas Sunstrider",
		24723: "Selin Fireheart",
		24744: "Vexallus",
		25960: "M'uru Sunwell",
	})
	return hostile
}

var MagistersTerraceFactory = &instances.CommonFactory{
	Name:      "Magisters' Terrace",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"magisters' terrace", "magister's terrace"},
	MapIDs:    []uint32{585},
	Hostiles:  instances.FromMap(MagistersTerraceHostiles()),
}

// KarazhanHostiles returns creature entry IDs for Karazhan (map 532).
func KarazhanHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		15547: "Spectral Charger",
		15548: "Spectral Stallion",
		15551: "Spectral Stable Hand",
		16153: "Berthold",
		16159: "Calliard",
		16169: "Hastings",
		16170: "Coldmist Stalker",
		16171: "Coldmist Widow",
		16173: "Shadowbat",
		16174: "Greater Shadowbat",
		16175: "Vampiric Shadowbat",
		16176: "Shadowbeast",
		16177: "Dreadbeast",
		16178: "Phase Hound",
		16388: "Koren",
		16389: "Spectral Apprentice",
		16406: "Phantom Attendant",
		16407: "Spectral Servant",
		16408: "Phantom Valet",
		16409: "Phantom Guest",
		16410: "Spectral Retainer",
		16411: "Spectral Chef",
		16412: "Ghostly Baker",
		16414: "Ghostly Steward",
		16415: "Skeletal Waiter",
		16424: "Spectral Sentry",
		16425: "Phantom Guardsman",
		16426: "Bennett",
		16459: "Wanton Hostess",
		16460: "Night Mistress",
		16461: "Concubine",
		16468: "Spectral Patron",
		16470: "Ghostly Philanthropist",
		16471: "Skeletal Usher",
		16472: "Phantom Stagehand",
		16473: "Spectral Performer",
		16481: "Ghastly Haunt",
		16482: "Trapped Soul",
		16485: "Arcane Watchman",
		16488: "Arcane Anomaly",
		16489: "Chaotic Sentience",
		16491: "Mana Feeder",
		16492: "Syphoner",
		16504: "Arcane Protector",
		16525: "Spell Shade",
		16526: "Sorcerous Shade",
		16529: "Magical Horror",
		16530: "Mana Warp",
		16539: "Homunculus",
		16540: "Shadow Pillager",
		16544: "Ethereal Thief",
		16545: "Ethereal Spellfilcher",
		16595: "Fleshbeast",
		16596: "Greater Fleshbeast",
		16806: "Ebonlocke",
		16811: "Sebastian",
		16813: "Wravien",
		16814: "Gradav",
		16815: "Kamsis",
		17211: "Human Footman",
		17469: "Orc Grunt",
		17518: "Ythyar",
		17644: "Infernal Target",
		17645: "Infernal Relay",
		17660: "Skeletal Gryphon",
		18654: "Crowd Murmur Helper",
		21160: "Conjured Water Elemental",
		21664: "Human Charger",
		21682: "Human Cleric",
		21683: "Human Conjurer",
		21684: "King Llane",
		21726: "Summoned Daemon",
		21747: "Orc Necrolyte",
		21748: "Orc Wolf",
		21750: "Orc Warlock",
		21752: "Warchief Blackhand",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		15687: "Moroes",
		15688: "Terestian Illhoof",
		15689: "Netherspite",
		15690: "Prince Malchezaar",
		15691: "The Curator",
		15550: "Attumen the Huntsman",
		16151: "Attumen the Huntsman",
		16152: "Attumen the Huntsman",
		16179: "Hyakiss the Lurker",
		16180: "Shadikith the Glider",
		16181: "Rokad the Ravager",
		16457: "Maiden of Virtue",
		16524: "Shade of Aran",
		16812: "Barnes",
		16816: "Echo of Medivh",
		17161: "Blizzard (Shade of Aran)",
		17225: "Nightbane",
		22520: "Chess Piece: Status Bar",
	})
	return hostile
}

var KarazhanFactory = &instances.CommonFactory{
	Name:      "Karazhan",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"karazhan"},
	MapIDs:    []uint32{532},
	Hostiles:  instances.FromMap(KarazhanHostiles()),
}

// HyjalSummitHostiles returns creature entry IDs for Hyjal Summit (map 534).
func HyjalSummitHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		3794:  "Druid of the Talon",
		3795:  "Druid of the Claw",
		17919: "Alliance Footman",
		17920: "Alliance Knight",
		17921: "Alliance Rifleman",
		17922: "Alliance Sorceress",
		17928: "Alliance Priest",
		17931: "Alliance Peasant",
		17932: "Horde Grunt",
		17933: "Tauren Warrior",
		17934: "Horde Headhunter",
		17935: "Horde Witch Doctor",
		17936: "Horde Shaman",
		17937: "Horde Peon",
		17943: "Night Elf Archer",
		17944: "Dryad",
		17945: "Night Elf Huntress",
		18485: "Night Elf Ancient of War",
		18486: "Night Elf Ancient of Lore",
		18487: "Night Elf Ancient Protector",
		18502: "Night Elf Wisp",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		17772: "Lady Jaina Proudmoore",
		17852: "Thrall",
		17948: "Tyrande Whisperwind",
		17968: "Archimonde",
	})
	return hostile
}

var HyjalSummitFactory = &instances.CommonFactory{
	Name:      "Hyjal Summit",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"hyjal summit", "the battle for mount hyjal"},
	MapIDs:    []uint32{534},
	Hostiles:  instances.FromMap(HyjalSummitHostiles()),
}

// SerpentshrineCavernHostiles returns creature entry IDs for Serpentshrine Cavern (map 548).
func SerpentshrineCavernHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		21218: "Vashj'ir Honor Guard",
		21220: "Coilfang Priestess",
		21221: "Coilfang Beast-Tamer",
		21224: "Tidewalker Depth-Seer",
		21225: "Tidewalker Warrior",
		21226: "Tidewalker Shaman",
		21227: "Tidewalker Harpooner",
		21228: "Tidewalker Hydromancer",
		21229: "Greyheart Tidecaller",
		21230: "Greyheart Nether-Mage",
		21231: "Greyheart Shield-Bearer",
		21232: "Greyheart Skulker",
		21246: "Serpentshrine Sporebat",
		21251: "Underbog Colossus",
		21253: "Tainted Water Elemental",
		21260: "Purified Water Elemental",
		21263: "Greyheart Technician",
		21301: "Coilfang Shatterer",
		21339: "Coilfang Hate-Screamer",
		21689: "Coilfang Frenzy Corpse",
		21863: "Serpentshrine Lurker",
		21873: "Coilfang Guardian",
		22057: "Coilfang Raid Control Emote Stalker",
		22036: "Tainted Spawn of Hydross",
		22035: "Pure Spawn of Hydross",
		22055: "Coilfang Elite",
		22009: "Tainted Elemental",
		22056: "Coilfang Strider",
		21298: "Coilfang Serpentguard",
		21865: "Coilfang Ambusher",
		21920: "Tidewalker Lurker",
		21299: "Coilfang Fathom-Witch",
		22347: "Colossus Lurker",
		21806: "Greyheart Spellbinder",
		21875: "Shadow of Leotheras",
		21964: "Fathom-Guard Caribdis",
		21965: "Fathom-Guard Tidalvess",
		21966: "Fathom-Guard Sharkkis",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		21212: "Lady Vashj",
		21213: "Morogrim Tidewalker",
		21214: "Fathom-Lord Karathress",
		21215: "Leotheras the Blind",
		21216: "Hydross the Unstable",
		21217: "The Lurker Below",
	})
	return hostile
}

var SerpentshrineCavernFactory = &instances.CommonFactory{
	Name:      "Serpentshrine Cavern",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"serpentshrine cavern"},
	MapIDs:    []uint32{548},
	Hostiles:  instances.FromMap(SerpentshrineCavernHostiles()),
	FlavoredRankings: func(fl database.WoWFlavor) *rankings.Rankings {
		rules := SerpentshrineCavernSpeedrunRequirements()
		rules.Speedrun.LevelRange = instances.Level70Cap(fl)
		return rules
	},
}

// TempestKeepHostiles returns creature entry IDs for Tempest Keep (map 550).
func TempestKeepHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		20031: "Bloodwarder Legionnaire",
		20032: "Bloodwarder Vindicator",
		20033: "Astromancer",
		20034: "Star Scryer",
		20035: "Bloodwarder Marshal",
		20036: "Bloodwarder Squire",
		20037: "Tempest Falconer",
		20038: "Phoenix-Hawk Hatchling",
		20039: "Phoenix-Hawk",
		20040: "Crystalcore Devastator",
		20041: "Crystalcore Sentinel",
		20042: "Tempest-Smith",
		20043: "Apprentice Star Scryer",
		20044: "Novice Astromancer",
		20046: "Astromancer Lord",
		20047: "Crimson Hand Battle Mage",
		20048: "Crimson Hand Centurion",
		20049: "Crimson Hand Blood Knight",
		20050: "Crimson Hand Inquisitor",
		20052: "Crystalcore Mechanic",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		18805: "High Astromancer Solarian",
		19514: "Al'ar",
		19516: "Void Reaver",
		19622: "Kael'thas Sunstrider",
		20060: "Lord Sanguinar",
		20062: "Grand Astromancer Capernian",
		20063: "Master Engineer Telonicus",
		20064: "Thaladred the Darkener",
	})
	return hostile
}

var TempestKeepFactory = &instances.CommonFactory{
	Name:      "Tempest Keep",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"tempest keep", "the eye"},
	MapIDs:    []uint32{550},
	Hostiles:  instances.FromMap(TempestKeepHostiles()),
}

// BlackTempleHostiles returns creature entry IDs for Black Temple (map 564).
func BlackTempleHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		22844: "Ashtongue Battlelord",
		22845: "Ashtongue Mystic",
		22846: "Ashtongue Stormcaller",
		22847: "Ashtongue Primalist",
		22853: "Illidari Defiler",
		22855: "Illidari Nightlord",
		22869: "Illidari Boneslicer",
		22873: "Coilskar General",
		22874: "Coilskar Harpooner",
		22875: "Coilskar Sea-Caller",
		22876: "Coilskar Soothsayer",
		22877: "Coilskar Wrangler",
		22878: "Aqueous Lord",
		22879: "Shadowmoon Reaver",
		22880: "Shadowmoon Champion",
		22882: "Shadowmoon Deathshaper",
		22883: "Aqueous Spawn",
		22884: "Leviathan",
		22885: "Dragon Turtle",
		22886: "Black Temple Captive",
		22939: "Temple Concubine",
		22945: "Shadowmoon Blood Mage",
		22946: "Shadowmoon War Hound",
		22953: "Wrathbone Flayer",
		22954: "Illidari Fearbringer",
		22955: "Charming Courtesan",
		22956: "Sister of Pain",
		22957: "Priestess of Dementia",
		22959: "Spellbound Attendant",
		22960: "Dragonmaw Wyrmcaller",
		22962: "Priestess of Delight",
		22963: "Bonechewer Worker",
		22964: "Sister of Pleasure",
		22965: "Enslaved Servant",
		22984: "Black Temple Trigger",
		23018: "Shadowmoon Houndmaster",
		23028: "Bonechewer Taskmaster",
		23030: "Dragonmaw Sky Stalker",
		23047: "Shadowmoon Soldier",
		23049: "Shadowmoon Weapon Master",
		23084: "Black Temple Invis Stalker",
		23089: "Akama",
		23147: "Shadowmoon Grunt",
		23158: "Seer Kanai",
		23159: "Okuno",
		23172: "Hand of Gorefiend",
		23196: "Bonechewer Behemoth",
		23222: "Bonechewer Brawler",
		23223: "Bonechewer Spectator",
		23232: "Mutant War Hound",
		23235: "Bonechewer Blade Fury",
		23236: "Bonechewer Shield Disciple",
		23237: "Bonechewer Blood Prophet",
		23239: "Bonechewer Combatant",
		23288: "Akama Event Stalker",
		23330: "Dragonmaw Wind Reaver",
		23337: "Illidari Centurion",
		23339: "Illidari Heartseeker",
		23374: "Ashtongue Stalker",
		23394: "Promenade Sentinel",
		23397: "Illidari Blood Lord",
		23398: "Angered Soul Fragment",
		23399: "Suffering Soul Fragment",
		23400: "Illidari Archon",
		23401: "Hungering Soul Fragment",
		23402: "Illidari Battle-mage",
		23403: "Illidari Assassin",
		23410: "Spirit of Udalo",
		23411: "Spirit of Olum",
		23412: "Illidan Door Trigger",
		23417: "Reliquary Combat Trigger",
		23421: "Ashtongue Channeler",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		22841: "Shade of Akama",
		22856: "Reliquary of the Lost",
		22871: "Teron Gorefiend",
		22887: "High Warlord Naj'entus",
		22898: "Supremus",
		22917: "Illidan Stormrage",
		22947: "Mother Shahraz",
		22948: "Gurtogg Bloodboil",
		22949: "Gathios the Shatterer",
		22950: "High Nethermancer Zerevor",
		22951: "Lady Malande",
		22952: "Veras Darkshadow",
		23191: "Akama",
		23426: "The Illidari Council",
	})
	return hostile
}

var BlackTempleFactory = &instances.CommonFactory{
	Name:      "Black Temple",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"black temple"},
	MapIDs:    []uint32{564},
	Hostiles:  instances.FromMap(BlackTempleHostiles()),
}

// GruulsLairHostiles returns creature entry IDs for Gruul's Lair (map 565).
func GruulsLairHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		19389: "Lair Brute",
		21350: "Gronn-Priest",
	})
	// The High King Maulgar council is a single encounter: all five units
	// share one encounter name so the fight is reported as one boss kill.
	instances.LoadBosses(hostile, map[uint32]string{
		18831: "High King Maulgar",
		18832: "High King Maulgar", // Krosh Firehand
		18834: "High King Maulgar", // Olm the Summoner
		18835: "High King Maulgar", // Kiggler the Crazed
		18836: "High King Maulgar", // Blindeye the Seer
		19044: "Gruul the Dragonkiller",
	})
	return hostile
}

var GruulsLairFactory = &instances.CommonFactory{
	Name:      "Gruul's Lair",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"gruul's lair"},
	MapIDs:    []uint32{565},
	Hostiles:  instances.FromMap(GruulsLairHostiles()),
	FlavoredRankings: func(fl database.WoWFlavor) *rankings.Rankings {
		rules := GruulsLairSpeedrunRequirements()
		rules.Speedrun.LevelRange = instances.Level70Cap(fl)
		return rules
	},
}

// ZulAmanHostiles returns creature entry IDs for Zul'Aman (map 568).
func ZulAmanHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		23542: "Amani'shi Axe Thrower",
		23580: "Amani'shi Warbringer",
		23581: "Amani'shi Medicine Man",
		23582: "Amani'shi Tribesman",
		23584: "Amani Bear",
		23586: "Amani'shi Scout",
		23596: "Amani'shi Flame Caster",
		23597: "Amani'shi Guardian",
		23746: "Zul'Aman Exterior InvisMan",
		23774: "Amani'shi Trainer",
		23790: "Tanzar",
		23807: "Zul'Aman - Bear God Invisman",
		23813: "Zul'Aman - Dragonhawk God Invisman",
		23814: "Zul'Aman - Eagle God Invisman",
		23815: "Zul'Aman - Lynx God Invisman",
		23817: "Dragonhawk Egg",
		23834: "Amani Dragonhawk",
		23889: "Amani'shi Savage",
		24043: "Amani Lynx",
		24047: "Amani Crocolisk",
		24059: "Amani'shi Beast Tamer",
		24064: "Amani Lynx Cub",
		24065: "Amani'shi Handler",
		24138: "Tamed Amani Crocolisk",
		24175: "Amani'shi Lookout",
		24179: "Amani'shi Wind Walker",
		24180: "Amani'shi Protector",
		24217: "Amani Bear Mount",
		24312: "Dragonhawk Egg",
		24363: "Hex Lord Malacrass",
		24374: "Amani'shi Berserker",
		24396: "Forest Frog",
		24444: "Kraz's Corpse",
		24530: "Amani Elder Lynx",
		24549: "Amani'shi Tempest",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		23574: "Akil'zon",
		23576: "Nalorakk",
		23577: "Halazzi",
		23578: "Jan'alai",
		23863: "Zul'jin",
		24239: "Hex Lord Malacrass",
	})
	return hostile
}

var ZulAmanFactory = &instances.CommonFactory{
	Name:      "Zul'Aman",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"zul'aman"},
	MapIDs:    []uint32{568},
	Hostiles:  instances.FromMap(ZulAmanHostiles()),
}

// SunwellPlateauHostiles returns creature entry IDs for Sunwell Plateau (map 580).
func SunwellPlateauHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		25363: "Sunblade Cabalist",
		25367: "Sunblade Arch Mage",
		25368: "Sunblade Slayer",
		25369: "Sunblade Vindicator",
		25370: "Sunblade Dusk Priest",
		25371: "Sunblade Dawn Priest",
		25372: "Sunblade Scout",
		25373: "Shadowsword Soulbinder",
		25483: "Shadowsword Manafiend",
		25484: "Shadowsword Assassin",
		25486: "Shadowsword Vanquisher",
		25506: "Shadowsword Lifeshaper",
		25507: "Sunblade Protector",
		25508: "Shadowsword Guardian",
		25509: "Priestess of Torment",
		25591: "Painbringer",
		25592: "Doomfire Destroyer",
		25593: "Apocalypse Guard",
		25595: "Chaos Gazer",
		25597: "Oblivion Mage",
		25599: "Cataclysm Hound",
		25608: "Kil'jaeden",
		25632: "Vindicator Moorba",
		25638: "Captain Selana",
		25639: "Anchorite Elbadon",
		25644: "Neophyte Narama",
		25661: "Shattered Sun Soldier",
		25770: "M'uru Portal Target",
		25795: "Normal Realm",
		25796: "Spectral Realm",
		25837: "Shadowsword Commander",
		25848: "Gauntlet Imp Trigger",
		25851: "Volatile Fiend",
		25867: "Sunblade Dragonhawk",
		25953: "Fel Crystal Spell Target",
		36991: "Sunwell Guardian",
		37746: "Sunwell Caster Bunny",
		37765: "Captain Auric Sunchaser",
		37781: "Sunwell Honor Guard",
		38047: "Blood Elf Pilgrim",
		38056: "Chamberlain Galiros",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		24850: "Kalecgos",
		24882: "Brutallus",
		24895: "Madrigosa",
		25038: "Felmyst",
		25165: "Lady Sacrolash",
		25166: "Grand Warlock Alythess",
		25741: "M'uru",
		37763: "Grand Magister Rommath",
		37764: "Lor'themar Theron",
	})
	return hostile
}

var SunwellPlateauFactory = &instances.CommonFactory{
	Name:      "Sunwell Plateau",
	Category:  instances.InstanceCategoryDungeon,
	ZoneNames: []string{"sunwell plateau"},
	MapIDs:    []uint32{580},
	Hostiles:  instances.FromMap(SunwellPlateauHostiles()),
}
