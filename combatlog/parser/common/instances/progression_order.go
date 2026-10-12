package instances

import "github.com/Emyrk/chronicle/database"

// RaidProgressionOrder returns the display order for raids across rankings and
// speedrun pages. Higher values are later in progression and display first.
// Instances that are not raids, or are not yet assigned an order, return zero.
//
// Most ordering is shared across flavors. Flavor-specific replacements belong
// in the override maps so the same instance name can occupy a different tier.
func RaidProgressionOrder(name string, flavor database.WoWFlavor) int {
	if flavor.Has(database.FlavorWrath) {
		if order, ok := wrathRaidProgressionOrder[name]; ok {
			return order
		}
	}
	return raidProgressionOrder[name]
}

var raidProgressionOrder = map[string]int{
	// Vanilla and custom vanilla content.
	"Scarlet Monastery":       50,
	"Molten Core":             100,
	"Onyxia's Lair":           200,
	"Onyxia Classic":          200,
	"Blackwing Lair":          300,
	"Zul'Gurub":               400,
	"Ruins of Ahn'Qiraj":      500,
	"Temple of Ahn'Qiraj":     600,
	"Naxxramas":               700,
	"Emerald Sanctum":         800,
	"Timbermaw Hold":          850,
	"Tower of Karazhan":       900,
	"Lower Tower of Karazhan": 900,
	"Upper Tower of Karazhan": 950,

	// The Burning Crusade.
	"Karazhan":             1000,
	"Gruul's Lair":         1010,
	"Magtheridon's Lair":   1020,
	"Serpentshrine Cavern": 1100,
	"Tempest Keep":         1110,
	"Hyjal Summit":         1200,
	"Black Temple":         1210,
	"Zul'Aman":             1250,
	"Sunwell Plateau":      1300,

	// Wrath of the Lich King names that do not replace a vanilla raid.
	"Vault of Archavon":     2001,
	"Obsidian Sanctum":      2010,
	"Eye of Eternity":       2020,
	"Ulduar":                2100,
	"Trial of the Crusader": 2200,
	"Ruby Sanctum":          2300,
	"Icecrown Citadel":      2400,
}

var wrathRaidProgressionOrder = map[string]int{
	"Naxxramas":     2030,
	"Onyxia's Lair": 2000,
}
