package instances

import "github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/instances/rankings"

// MoltenCoreSpeedrunRequirements returns the 10 boss kills required for a
// valid Molten Core speedrun.
func MoltenCoreSpeedrunRequirements() []rankings.SpeedrunRequirement {
	return []rankings.SpeedrunRequirement{
		{Name: "Incindis", EntryIDs: []uint32{52145}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Lucifron", EntryIDs: []uint32{12118}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Magmadar", EntryIDs: []uint32{11982}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Garr", EntryIDs: []uint32{12057}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Shazzrah", EntryIDs: []uint32{12264}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Baron Geddon", EntryIDs: []uint32{12056}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Sulfuron Harbinger", EntryIDs: []uint32{12098}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Golemagg the Incinerator", EntryIDs: []uint32{11988}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Basalthar", EntryIDs: []uint32{65020}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Smoldaris", EntryIDs: []uint32{65021}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Sorcerer-Thane Thaurissan", EntryIDs: []uint32{57642}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Majordomo Executus", EntryIDs: []uint32{12018}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Ragnaros", EntryIDs: []uint32{11502}, Count: 1, Category: rankings.SpeedrunCategoryBosses},

		// Trash Requirements
		{Name: "Firesworn", EntryIDs: []uint32{12099}, Count: 8, Category: rankings.SpeedrunCategoryTrash},
	}
}
