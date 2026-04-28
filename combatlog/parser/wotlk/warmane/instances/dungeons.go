package instances

import (
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances"
)

// NexusHostiles returns creature entry IDs for The Nexus dungeon (map 576).
// Bosses: Grand Magus Telestra, Anomalus, Ormorok the Tree-Shaper, Keristrasza.
// Optional boss: Commander Kolurg (Alliance) / Commander Stoutbeard (Horde).
func NexusHostiles() map[uint32]instances.Identity {
	hostile := make(map[uint32]instances.Identity)
	instances.LoadAdds(hostile, map[uint32]string{
		// Trash mobs
		26746: "Crazed Mana-Wraith",
		26727: "Mage Hunter Ascendant",
		26730: "Mage Slayer",
		26792: "Crystalline Protector",
		26793: "Crystalline Frayer",
		28231: "Crystalline Tender",
		26734: "Azure Enforcer",
		26722: "Azure Magus",
		26735: "Azure Scale-Binder",
		26737: "Crazed Mana-Surge",
		26918: "Chaotic Rift",
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
		32261: "Crystal Spider",
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
	Name:      "The Oculus",
	ZoneNames: []string{"the oculus", "oculus"},
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
	})
	return hostile
}

var ForgeOfSoulsFactory = &instances.CommonFactory{
	Name:      "Forge of Souls",
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
	})
	instances.LoadBosses(hostile, map[uint32]string{
		36723: "Frostsworn General",
		38112: "Falric",
		38113: "Marwyn",
		36954: "The Lich King",
		37226: "The Lich King",
	})
	return hostile
}

var HallsOfReflectionFactory = &instances.CommonFactory{
	Name:      "Halls of Reflection",
	ZoneNames: []string{"halls of reflection"},
	MapIDs:    []uint32{668},
	Hostiles:  instances.FromMap(HallsOfReflectionHostiles()),
}
