package instances

import (
	"context"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
)

// VoAHostiles returns creature entry IDs for Vault of Archavon (map 4603).
// Includes both 10-man and 25-man NPC IDs where they differ.
func VoAHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		// Trash — 10-man
		32353: "Archavon Warder",
		33998: "Tempest Minion",
		34015: "Tempest Warder",
		35143: "Flame Warder",
		38482: "Frost Warder",
		// Trash — 25-man (separate entry IDs)
		32368: "Archavon Warder",
		34200: "Tempest Minion",
		34016: "Tempest Warder",
		35359: "Flame Warder",
		38483: "Frost Warder",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		// 10-man bosses
		31125: "Archavon the Stone Watcher",
		33993: "Emalon the Storm Watcher",
		35013: "Koralon the Flame Watcher",
		38433: "Toravon the Ice Watcher",
		// 25-man bosses (separate entry IDs)
		31722: "Archavon the Stone Watcher",
		33994: "Emalon the Storm Watcher",
		38462: "Toravon the Ice Watcher",
	})
	return hostile
}

var VoAFactory = &instances.CommonFactory{
	Name:      "Vault of Archavon",
	ZoneNames: []string{"vault of archavon"},
	MapIDs:    []uint32{624},
	Hostiles:  instances.FromMap(VoAHostiles()),
}

// ObsidianSanctumHostiles returns creature entry IDs for The Obsidian Sanctum (zone 4493).
// Single boss (Sartharion) with three optional drake lieutenants.
func ObsidianSanctumHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		// Trash
		30680: "Onyx Brood General",
		30681: "Onyx Blaze Mistress",
		30682: "Onyx Flight Captain",
		30453: "Onyx Sanctum Guardian",
		// Encounter adds
		30643: "Lava Blaze",
		31218: "Acolyte of Shadron",
		31219: "Acolyte of Vesperon",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		28860: "Sartharion",
		30449: "Vesperon",
		30451: "Shadron",
		30452: "Tenebron",
	})
	return hostile
}

var ObsidianSanctumFactory = &instances.CommonFactory{
	Name:      "Obsidian Sanctum",
	ZoneNames: []string{"the obsidian sanctum"},
	MapIDs:    []uint32{615},
	Hostiles:  instances.FromMap(ObsidianSanctumHostiles()),
}

func onyxiaZoneName(ctx context.Context, z zone.Zone, fl database.WoWFlavor) string {
	if !fl.Has(database.FlavorAzerothcoreProgression) {
		return "Onyxia's Lair"
	}
	format, ok := parsectx.Format(ctx)
	if !ok || format != database.LogFormat335aCcAddon {
		return "Onyxia's Lair"
	}

	// AzerothCore progression servers can expose both the level 60 and level 80
	// versions of Onyxia on the same client and zone name. The companion reports
	// 10/25-player metadata for the WotLK raid, while the classic raid has none.
	if z.InstanceType == "raid" && z.DifficultyName == "" && z.MaxPlayers == 0 {
		return "Onyxia Classic"
	}
	return "Onyxia's Lair"
}

func onyxiaRankings(fl database.WoWFlavor, classic bool) *rankings.Rankings {
	if fl.Has(database.FlavorChromieCraft) {
		return &rankings.Rankings{}
	}

	onyxiaEntry := uint32(10184)
	warderEntry := uint32(12129)
	if classic {
		onyxiaEntry = 301000
		warderEntry = 301002
	}
	trash := []rankings.SpeedrunRequirement{
		{Name: "Onyxian Warder", EntryIDs: []uint32{warderEntry}, Count: 3, Category: rankings.SpeedrunCategoryTrash},
	}
	if fl.Has(database.FlavorNightmareOfUrsol) {
		// TODO: Should figure this out.
		trash = []rankings.SpeedrunRequirement{
			//{Name: "Onyxian Warder", EntryIDs: []uint32{12129}, Count: 3, Category: rankings.SpeedrunCategoryTrash},
			//{Name: "Onyxian Inciter/Onyxian Flamespawn", EntryIDs: []uint32{49016}, Count: 2, Category: rankings.SpeedrunCategoryTrash},
		}
	}

	rules := &rankings.SpeedrunRules{
		Requirements: append([]rankings.SpeedrunRequirement{
			{Name: "Onyxia", EntryIDs: []uint32{onyxiaEntry}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		}, trash...),
	}
	if classic {
		rules.LevelRange = instances.Level60Cap(fl)
	}
	return &rankings.Rankings{Speedrun: rules}
}

func onyxiaDerivedName(fl database.WoWFlavor) *instances.MultiInstanceZone {
	if !fl.Has(database.FlavorAzerothcoreProgression) {
		return nil
	}
	return instances.NewMultiInstanceZone(map[string][]uint32{
		"Onyxia Classic": {301000, 301001, 301002},
		"Onyxia's Lair":  {10184},
	})
}

var OnyxiaFactory = &instances.CommonFactory{
	Name:         "Onyxia's Lair",
	NameFromZone: onyxiaZoneName,
	DerivedName:  onyxiaDerivedName,
	ZoneNames:    []string{"onyxia's lair", "奥妮克希亚的巢穴"},
	MapIDs:       []uint32{249},
	Hostiles:     instances.OnyxiaHostiles,
	FlavoredRankings: func(fl database.WoWFlavor) *rankings.Rankings {
		if fl.Has(database.FlavorAzerothcoreProgression) {
			return nil
		}
		return onyxiaRankings(fl, false)
	},
	DerivedRankings: map[string]func(database.WoWFlavor) *rankings.Rankings{
		"Onyxia Classic": func(fl database.WoWFlavor) *rankings.Rankings {
			if !fl.Has(database.FlavorAzerothcoreProgression) {
				return nil
			}
			return onyxiaRankings(fl, true)
		},
		"Onyxia's Lair": func(fl database.WoWFlavor) *rankings.Rankings {
			if !fl.Has(database.FlavorAzerothcoreProgression) {
				return nil
			}
			return onyxiaRankings(fl, false)
		},
	},
}

// NaxxramasHostiles returns creature entry IDs for Naxxramas (WotLK).
// Reuses the Vanilla Naxx hostile list, replacing Highlord Mograine with Baron Rivendare
// for the Four Horsemen encounter.
func NaxxramasHostiles(fl database.WoWFlavor) *identifier.Identifier {
	hostile := instances.NaxxramasHostiles(fl)
	// WotLK replaces Highlord Mograine with Baron Rivendare in the Four Horsemen
	delete(hostile, 16062)
	instances.LoadBosses(hostile, map[uint32]string{
		30549: "Four Horsemen", // Baron Rivendare
	})
	return identifier.NewIdentifier(hostile)
}

func NaxxramasSpeedrunRequirements() []rankings.SpeedrunRequirement {
	reqs := instances.NaxxramasSpeedrunRequirements()
	for i := range reqs {
		if len(reqs[i].EntryIDs) > 0 && reqs[i].EntryIDs[0] == 16062 {
			reqs[i].EntryIDs[0] = 30549 // Baron Rivendare replaces Highlord Mograine for the Four Horsemen encounter
			reqs[i].Name = "Four Horsemen: Baron Rivendare"
		}
	}
	return reqs
}

var NaxxramasFactory = &instances.CommonFactory{
	Name:      "Naxxramas",
	ZoneNames: []string{"naxxramas", "the upper necropolis"},
	MapIDs:    []uint32{533},
	Hostiles:  NaxxramasHostiles,
	FlavoredRankings: func(database.WoWFlavor) *rankings.Rankings {
		return &rankings.Rankings{
			Speedrun: &rankings.SpeedrunRules{
				Requirements: NaxxramasSpeedrunRequirements(),
			},
		}
	},
}

// EyeOfEternityHostiles returns creature entry IDs for The Eye of Eternity (map 616).
// The live AzerothCore map data only exposes Malygos and encounter vortexes as hostile units.
func EyeOfEternityHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		30090: "Vortex",
		30249: "Scion of Eternity",
		30245: "Nexus Lord",
		30084: "Power Spark",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		28859: "Malygos",
	})
	return hostile
}

var EyeOfEternityFactory = &instances.CommonFactory{
	Name:      "Eye of Eternity",
	ZoneNames: []string{"the eye of eternity", "eye of eternity"},
	MapIDs:    []uint32{616},
	Hostiles:  instances.FromMap(EyeOfEternityHostiles()),
}

// RubySanctumHostiles returns creature entry IDs for The Ruby Sanctum (map 724).
// Hostiles are sourced from the live AzerothCore map spawns for the instance.
func RubySanctumHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		40417: "Charscale Invoker",
		40419: "Charscale Assaulter",
		40628: "Ruby Scalebane",
		40421: "Charscale Elite",
		40626: "Ruby Drakonid",
		40627: "Ruby Drake",
		39794: "Zarithrian Spawn Stalker",
		40423: "Charscale Commander",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		39746: "General Zarithrian",
		39747: "Saviana Ragefire",
		39751: "Baltharus the Warborn",
		39863: "Halion",
	})
	return hostile
}

var RubySanctumFactory = &instances.CommonFactory{
	Name:      "Ruby Sanctum",
	ZoneNames: []string{"the ruby sanctum", "ruby sanctum"},
	MapIDs:    []uint32{724},
	Hostiles:  instances.FromMap(RubySanctumHostiles()),
}

// TrialOfTheCrusaderHostiles returns creature entry IDs for Trial of the Crusader (map 649).
// This slice covers the primary raid bosses, their major adds, and the known faction champion units
// exposed in the live AzerothCore creature templates. Champion coverage is intentionally not exhaustive.
func TrialOfTheCrusaderHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		34784: "Legion Flame",
		34813: "Infernal Volcano",
		34825: "Nether Portal",
		34826: "Mistress of Pain",
		34606: "Frost Sphere",
		34607: "Nerubian Burrower",
		35314: "Orgrimmar Champion",
		35323: "Sen'jin Champion",
		35325: "Thunder Bluff Champion",
		35326: "Silvermoon Champion",
		35327: "Undercity Champion",
		35328: "Stormwind Champion",
		35329: "Ironforge Champion",
		35330: "Exodar Champion",
		35331: "Gnomeregan Champion",
		35332: "Darnassus Champion",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		34780: "Lord Jaraxxus",
		34796: "Gormok the Impaler",
		34797: "Icehowl",
		34799: "Dreadscale",
		35144: "Acidmaw",
		34496: "Eydis Darkbane",
		34497: "Fjola Lightbane",
		29120: "Anub'arak",
		35469: "Gormok the Impaler",
		35470: "Icehowl",
		36065: "Fjola Lightbane",
		36066: "Eydis Darkbane",
		34564: "Anub'arak",
		34660: "Anub'arak",
	})
	return hostile
}

var TrialOfTheCrusaderFactory = &instances.CommonFactory{
	Name:      "Trial of the Crusader",
	ZoneNames: []string{"trial of the crusader", "trial of the grand crusader"},
	MapIDs:    []uint32{649},
	Hostiles:  instances.FromMap(TrialOfTheCrusaderHostiles()),
}

// IcecrownCitadelHostiles returns the major boss creature entry IDs for Icecrown Citadel (map 631).
// Coverage is boss-first and intentionally not exhaustive for trash or scripted events.
func IcecrownCitadelHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		10404: "Pustulating Horror",
		22515: "World Trigger",
		26043: "Steam Burst",
		36659: "Abomination Wing Orange Gas Stalker",
		36724: "Servant of the Throne",
		36725: "Nerub'ar Broodkeeper",
		36805: "Deathspeaker Servant",
		36807: "Deathspeaker Disciple",
		36808: "Deathspeaker Zealot",
		36811: "Deathspeaker Attendant",
		36829: "Deathspeaker High Priest",
		36880: "Decaying Colossus",
		36934: "Empowering Orb Controller Stalker",
		36998: "Skybreaker Protector",
		37003: "Skybreaker Vindicator",
		37004: "Skybreaker Dreadblade",
		37007: "Deathbound Ward",
		37011: "The Damned",
		37012: "Ancient Skeletal Soldier",
		37013: "Puddle Stalker",
		37016: "Skybreaker Luminary",
		37017: "Skybreaker Assassin",
		37021: "Skybreaker Vicar",
		37022: "Blighted Abomination",
		37023: "Plague Scientist",
		37025: "Stinky",
		37026: "Skybreaker Sorcerer",
		37027: "Skybreaker Hierophant",
		37028: "Kor'kron Stalker",
		37030: "Kor'kron Primalist",
		37031: "Kor'kron Oracle",
		37032: "Kor'kron Defender",
		37033: "Kor'kron Invoker",
		37035: "Kor'kron Vanquisher",
		37038: "Vengeful Fleshreaper",
		37098: "Val'kyr Herald",
		37122: "Captain Arnath",
		37123: "Captain Brandon",
		37124: "Captain Grondel",
		37125: "Captain Rupert",
		37127: "Ymirjar Frostbinder",
		37129: "Crok Scourgebane",
		37132: "Ymirjar Battle-Maiden",
		37133: "Ymirjar Warlord",
		37134: "Ymirjar Huntress",
		37144: "Skybreaker Marksman",
		37148: "Skybreaker Summoner",
		37181: "The Lich King",
		37217: "Precious",
		37230: "Spire Frostwyrm",
		37503: "Sindragosa's Ward",
		37531: "Frostwarden Handler",
		37532: "Frostwing Whelp",
		37533: "Rimefang",
		37534: "Spinestalker",
		37544: "Spire Gargoyle",
		37545: "Spire Minion",
		37546: "Frenzied Abomination",
		37571: "Darkfallen Advisor",
		37586: "Fury",
		37589: "Stefan Vadu",
		37595: "Darkfallen Blood Knight",
		37662: "Darkfallen Commander",
		37663: "Darkfallen Noble",
		37664: "Darkfallen Archmage",
		37665: "Darkfallen Lieutenant",
		37666: "Darkfallen Tactician",
		37689: "Commander Kunz",
		37702: "Runeforge Bunny",
		37744: "Frost Freeze Trap",
		37824: "Abomination Wing Mad Scientist Stalker",
		37868: "Risen Archmage",
		37920: "Kor'kron Reaver",
		37985: "Dream Cloud",
	})

	instances.LoadBosses(hostile, map[uint32]string{
		36612: "Lord Marrowgar",
		36855: "Lady Deathwhisper",
		37813: "Deathbringer Saurfang",
		36626: "Festergut",
		36627: "Rotface",
		36678: "Professor Putricide",
		37955: "Blood-Queen Lana'thel",
		36789: "Valithria Dreamwalker",
		36853: "Sindragosa",
		36597: "The Lich King",
	})
	hostile[37970] = instances.Identity{Affiliation: types.AffiliationHostile, EncounterName: "Blood Council", Boss: true}
	hostile[37972] = instances.Identity{Affiliation: types.AffiliationHostile, EncounterName: "Blood Council", Boss: true}
	hostile[37973] = instances.Identity{Affiliation: types.AffiliationHostile, EncounterName: "Blood Council", Boss: true}
	return hostile
}

var IcecrownCitadelFactory = &instances.CommonFactory{
	Name:      "Icecrown Citadel",
	ZoneNames: []string{"icecrown citadel"},
	MapIDs:    []uint32{631},
	Hostiles:  instances.FromMap(IcecrownCitadelHostiles()),
}

// UlduarHostiles returns creature entry IDs for Ulduar (map 603).
func UlduarHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		22515: "World Trigger",
		24921: "Cosmetic Trigger - LAB",
		32780: "Invisible Stalker (All Phases)",
		32922: "Dark Rune Champion",
		32923: "Dark Rune Commoner",
		32924: "Dark Rune Evoker",
		32925: "Dark Rune Warbringer",
		33059: "Wrecked Demolisher",
		33063: "Wrecked Siege Engine",
		33089: "Dark Matter",
		33121: "Iron Construct",
		33191: "Iron Construct",
		33210: "Expedition Commander",
		33214: "Mechanolift 304-A",
		33235: "Brann Bronzebeard",
		33236: "Steelforged Defender",
		33237: "Ulduar Colossus",
		33259: "Expedition Trapper",
		33282: "Razorscale Harpoon Fire State",
		33287: "Expedition Engineer",
		33354: "Corrupted Servitor",
		33355: "Misguided Nymph",
		33430: "Guardian Lasher",
		33431: "Forest Swarmer",
		33525: "Mangrove Ent",
		33526: "Ironroot Lasher",
		33527: "Nature's Blade",
		33528: "Guardian of Life",
		33571: "Ulduar Gauntlet Generator",
		33579: "Brann Bronzebeard",
		33620: "Earthen Stoneshaper",
		33622: "Goran Steelbreaker",
		33624: "Archmage Pentarus",
		33626: "Hired Engineer",
		33627: "Hired Demolitionist",
		33629: "Weslex Quickwrench",
		33661: "Armsweep Stalker Kologarn",
		33662: "Kirin Tor Battle-Mage",
		33672: "Kirin Tor Mage",
		33686: "Lore Keeper of Norgannon",
		33696: "Archmage Rhydian",
		33699: "Storm Tempered Keeper",
		33700: "Storm Tempered Keeper",
		33701: "High Explorer Dellorah",
		33721: "Lore Keeper Projection Unit",
		33722: "Storm Tempered Keeper",
		33723: "Storm Tempered Keeper",
		33729: "Corrupted Servitor",
		33731: "Forest Swarmer",
		33732: "Guardian Lasher",
		33733: "Guardian of Life",
		33734: "Ironroot Lasher",
		33735: "Mangrove Ent",
		33737: "Misguided Nymph",
		33741: "Nature's Blade",
		33754: "Dark Rune Thunderer",
		33755: "Dark Rune Ravager",
		33757: "Dark Rune Thunderer",
		33758: "Dark Rune Ravager",
		33772: "Faceless Horror",
		33773: "Faceless Horror",
		33774: "Slain Iron Vrykul",
		33775: "Slain Iron Dwarf",
		33779: "Ulduar Shield Bunny",
		33816: "Expedition Defender",
		33818: "Twilight Adherent",
		33819: "Twilight Frost Mage",
		33820: "Twilight Pyromancer",
		33822: "Twilight Guardian",
		33823: "Twilight Slayer",
		33824: "Twilight Shadowblade",
		33827: "Twilight Adherent",
		33828: "Twilight Guardian",
		33829: "Twilight Frost Mage",
		33830: "Twilight Pyromancer",
		33831: "Twilight Shadowblade",
		33832: "Twilight Slayer",
		33838: "Enslaved Fire Elemental",
		33874: "Archivum System",
		33956: "Prospector Doren",
		33957: "Prospector Loren",
		34054: "Bronzebeard Radio",
		34069: "Molten Colossus",
		34085: "Forge Construct",
		34086: "Magma Rager",
		34096: "Auriaya Feral Defender Stalker",
		34105: "Ulduar Colossus",
		34113: "Steelforged Defender",
		34133: "Champion of Hodir",
		34134: "Winter Revenant",
		34135: "Winter Rumbler",
		34139: "Champion of Hodir",
		34141: "Winter Revenant",
		34142: "Winter Rumbler",
		34146: "Snow Mound (4)",
		34150: "Snow Mound (6)",
		34151: "Snow Mound (8)",
		34164: "Mechagnome Battletank",
		34165: "Mechagnome Battletank",
		34183: "Arachnopod Destroyer",
		34185: "Molten Colossus",
		34186: "Forge Construct",
		34190: "Hardened Iron Golem",
		34191: "Trash",
		34192: "Boomer XP-500",
		34193: "Clockwork Sapper",
		34196: "Rune Etched Sentry",
		34197: "Chamber Overseer",
		34198: "Iron Mender",
		34199: "Lightning Charged Iron Dwarf",
		34201: "Magma Rager",
		34214: "Arachnopod Destroyer",
		34216: "Boomer XP-500",
		34217: "Trash",
		34220: "Clockwork Sapper",
		34221: "Dark Matter",
		34226: "Chamber Overseer",
		34229: "Hardened Iron Golem",
		34234: "Runeforged Sentry",
		34235: "Runeforged Sentry",
		34236: "Iron Mender",
		34237: "Lightning Charged Iron Dwarf",
		34245: "Rune Etched Sentry",
		34254: "Expedition Commander",
		34255: "Expedition Defender",
		34256: "Expedition Engineer",
		34257: "Expedition Trapper",
		34267: "Parts Recovery Technician",
		34268: "Parts Recovery Technician",
		34269: "XR-949 Salvagebot",
		34270: "XR-949 Salvagebot",
		34271: "XD-175 Compactobot",
		34272: "XD-175 Compactobot",
		34273: "XB-488 Disposalbot",
		34274: "XB-488 Disposalbot",
	})
	instances.LoadBosses(hostile, map[uint32]string{
		32845: "Hodir",
		32846: "Hodir",
		32857: "Stormcaller Brundir",
		32865: "Thorim",
		32867: "Steelbreaker",
		32892: "Thorim Event Bunny",
		32906: "Freya",
		32913: "Elder Ironbranch",
		32914: "Elder Stonebark",
		32915: "Elder Brightleaf",
		32927: "Runemaster Molgeim",
		32930: "Kologarn",
		33054: "Thorim Trap Bunny",
		33113: "Flame Leviathan",
		33118: "Ignis the Furnace Master",
		33134: "Sara",
		33147: "Thorim",
		33186: "Razorscale",
		33190: "Ignis the Furnace Master",
		33213: "Hodir",
		33241: "Freya",
		33242: "Thorim",
		33244: "Mimiron",
		33264: "Ironwork Cannon",
		33271: "General Vezax",
		33293: "XT-002 Deconstructor",
		33350: "Mimiron",
		33360: "Freya",
		33378: "Thunder Orb",
		33391: "Elder Brightleaf",
		33392: "Elder Ironbranch",
		33393: "Elder Stonebark",
		33432: "Leviathan Mk II",
		33449: "General Vezax",
		33515: "Auriaya",
		33692: "Runemaster Molgeim",
		33693: "Steelbreaker",
		33694: "Stormcaller Brundir",
		33724: "Razorscale",
		33725: "Thorim Trap Bunny",
		33885: "XT-002 Deconstructor",
		33909: "Kologarn",
		34003: "Flame Leviathan",
		34106: "Leviathan Mk II",
		34175: "Auriaya",
		34332: "Sara",
	})
	return hostile
}

var UlduarFactory = &instances.CommonFactory{
	Name:      "Ulduar",
	ZoneNames: []string{"ulduar"},
	MapIDs:    []uint32{603},
	Hostiles:  instances.FromMap(UlduarHostiles()),
}
