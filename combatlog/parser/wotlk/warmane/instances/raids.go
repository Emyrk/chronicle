package instances

import (
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances"
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

// NaxxramasHostiles returns creature entry IDs for Naxxramas (WotLK).
// Reuses the Vanilla Naxx hostile list, replacing Highlord Mograine with Baron Rivendare
// for the Four Horsemen encounter.
func NaxxramasHostiles() map[uint32]instances.Identity {
	hostile := instances.NaxxramasHostiles()
	// WotLK replaces Highlord Mograine with Baron Rivendare in the Four Horsemen
	delete(hostile, 16062)
	instances.LoadBosses(hostile, map[uint32]string{
		30549: "Four Horsemen", // Baron Rivendare
	})
	return hostile
}

var NaxxramasFactory = &instances.CommonFactory{
	Name:      "Naxxramas",
	ZoneNames: []string{"naxxramas", "the upper necropolis"},
	MapIDs:    []uint32{533},
	Hostiles:  instances.FromMap(NaxxramasHostiles()),
}

// EyeOfEternityHostiles returns creature entry IDs for The Eye of Eternity (map 616).
// The live AzerothCore map data only exposes Malygos and encounter vortexes as hostile units.
func EyeOfEternityHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		30090: "Vortex",
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
