package instances

import (
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/database"
)

func Level60Cap(fl database.WoWFlavor) *rankings.LevelRangeRequirement {
	if fl.Has(database.FlavorWrath, database.FlavorTBC) {
		return &rankings.LevelRangeRequirement{
			MinLevel: 0,
			MaxLevel: 60,
		}
	}

	return nil
}

func RagefireChasmSpeedrunRequirements() *rankings.Rankings {
	return &rankings.Rankings{
		Speedrun: &rankings.SpeedrunRules{
			Requirements: []rankings.SpeedrunRequirement{
				{Name: "Taragaman the Hungerer", EntryIDs: []uint32{11520}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Jergosh the Invoker", EntryIDs: []uint32{11518}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Oggleflint", EntryIDs: []uint32{11517}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Bazzalan", EntryIDs: []uint32{11519}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			},
			LevelRange: &rankings.LevelRangeRequirement{
				MinLevel: 0,
				MaxLevel: 20,
			},
		},
	}
}

func DeadminesSpeedrunRequirements() *rankings.Rankings {
	return &rankings.Rankings{
		Speedrun: &rankings.SpeedrunRules{
			Requirements: []rankings.SpeedrunRequirement{
				{Name: "Cookie", EntryIDs: []uint32{645}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Rhahk'Zor", EntryIDs: []uint32{644}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Sneed's Shredder", EntryIDs: []uint32{642}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Sneed", EntryIDs: []uint32{643}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Gilnid", EntryIDs: []uint32{1763}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Mr. Smite", EntryIDs: []uint32{646}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Captain Greenskin", EntryIDs: []uint32{647}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
				{Name: "Edwin VanCleef", EntryIDs: []uint32{639}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			},
			LevelRange: &rankings.LevelRangeRequirement{
				MinLevel: 0,
				MaxLevel: 26,
			},
		},
	}
}

// MoltenCoreSpeedrunRequirements returns the 10 boss kills required for a
// valid Molten Core speedrun.
func MoltenCoreSpeedrunRequirements(fl database.WoWFlavor) []rankings.SpeedrunRequirement {
	mc := []rankings.SpeedrunRequirement{
		{Name: "Lucifron", EntryIDs: []uint32{12118}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Magmadar", EntryIDs: []uint32{11982}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Garr", EntryIDs: []uint32{12057}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Shazzrah", EntryIDs: []uint32{12264}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Baron Geddon", EntryIDs: []uint32{12056}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Sulfuron Harbinger", EntryIDs: []uint32{12098}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Golemagg the Incinerator", EntryIDs: []uint32{11988}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Majordomo Executus", EntryIDs: []uint32{12018}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Ragnaros", EntryIDs: []uint32{11502}, Count: 1, Category: rankings.SpeedrunCategoryBosses},

		// Trash Requirements
		{Name: "Firesworn", EntryIDs: []uint32{12099}, Count: 8, Category: rankings.SpeedrunCategoryTrash},
	}

	if fl.Has(database.FlavorTurtle, database.FlavorNightmareOfUrsol, database.FlavorOctoWoW) {
		mc = append(mc, []rankings.SpeedrunRequirement{
			{Name: "Incindis", EntryIDs: []uint32{52145}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			{Name: "Basalthar", EntryIDs: []uint32{65020}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			{Name: "Smoldaris", EntryIDs: []uint32{65021}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			{Name: "Sorcerer-Thane Thaurissan", EntryIDs: []uint32{57642}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		}...)
	} else {
		mc = append(mc, []rankings.SpeedrunRequirement{
			{Name: "Gehennas", EntryIDs: []uint32{12259}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		}...)
	}

	return mc
}

// BlackwingLairSpeedrunRequirements returns the boss kills required for a
// valid Blackwing Lair speedrun.
func BlackwingLairSpeedrunRequirements(flavor database.WoWFlavor) []rankings.SpeedrunRequirement {
	bwl := []rankings.SpeedrunRequirement{
		{Name: "Razorgore the Untamed", EntryIDs: []uint32{12435}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Vaelastrasz the Corrupt", EntryIDs: []uint32{13020}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Broodlord Lashlayer", EntryIDs: []uint32{12017}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Firemaw", EntryIDs: []uint32{11983}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Ebonroc", EntryIDs: []uint32{14601}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Flamegor", EntryIDs: []uint32{11981}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Chromaggus", EntryIDs: []uint32{14020}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Nefarian", EntryIDs: []uint32{11583}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}

	if flavor.Has(database.FlavorOctoWoW, database.FlavorTurtle, database.FlavorNightmareOfUrsol) {
		bwl = append(bwl, []rankings.SpeedrunRequirement{
			{Name: "Flameweaver Koegler", EntryIDs: []uint32{49017}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			{Name: "Ezzel Darkbrewer", EntryIDs: []uint32{65148}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		}...)
	}

	if flavor.Has(database.FlavorVanillaPlus) {
		bwl = append(bwl, []rankings.SpeedrunRequirement{
			{Name: "Master Elemental Shaper Krixix", EntryIDs: []uint32{14401}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		}...)
	}

	return bwl
}

// OnyxiasLairSpeedrunRequirements returns the boss kills required for a
// valid Onyxia's Lair speedrun.
func OnyxiasLairSpeedrunRequirements(flavor database.WoWFlavor) []rankings.SpeedrunRequirement {
	base := []rankings.SpeedrunRequirement{
		{Name: "Onyxia", EntryIDs: []uint32{10184, 45133}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}
	if flavor.Has(database.FlavorOctoWoW, database.FlavorTurtle, database.FlavorNightmareOfUrsol) {
		base = append(base, []rankings.SpeedrunRequirement{
			{Name: "Broodcommander Axelus", EntryIDs: []uint32{49018}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		}...)
	}
	if flavor.Has(database.FlavorEpoch) {
		base = append(base, []rankings.SpeedrunRequirement{
			{Name: "Onyxia", EntryIDs: []uint32{45133}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			{Name: "Ortorg the Ardent", EntryIDs: []uint32{45136}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
			{Name: "Ortorg the Atressian", EntryIDs: []uint32{45125}, Count: 1, Category: rankings.SpeedrunCategoryBosses},

			{Name: "Onyxian Honorguard/Warder/Flameweaver", EntryIDs: []uint32{45237, 45238, 12129}, Count: 1, Category: rankings.SpeedrunCategoryTrash},
			{Name: "Evorian", EntryIDs: []uint32{45131}, Count: 1, Category: rankings.SpeedrunCategoryTrash},
			{Name: "45132", EntryIDs: []uint32{45132}, Count: 1, Category: rankings.SpeedrunCategoryTrash},
		}...)
	}

	return base
}

// NaxxramasSpeedrunRequirements returns the boss kills required for a
// valid Naxxramas speedrun.
func NaxxramasSpeedrunRequirements() []rankings.SpeedrunRequirement {
	return []rankings.SpeedrunRequirement{
		// Arachnid Quarter
		{Name: "Anub'Rekhan", EntryIDs: []uint32{15956}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Grand Widow Faerlina", EntryIDs: []uint32{15953}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Maexxna", EntryIDs: []uint32{15952}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		// Plague Quarter
		{Name: "Noth the Plaguebringer", EntryIDs: []uint32{15954}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Heigan the Unclean", EntryIDs: []uint32{15936}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Loatheb", EntryIDs: []uint32{16011}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		// Military Quarter
		{Name: "Instructor Razuvious", EntryIDs: []uint32{16061}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Gothik the Harvester", EntryIDs: []uint32{16060}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Four Horsemen: Thane Korth'azz", EntryIDs: []uint32{16064}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Four Horsemen: Lady Blaumeux", EntryIDs: []uint32{16065}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Four Horsemen: Sir Zeliek", EntryIDs: []uint32{16063}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Four Horsemen: Highlord Mograine", EntryIDs: []uint32{16062}, Count: 1, Category: rankings.SpeedrunCategoryBosses},

		// Construct Quarter
		{Name: "Patchwerk", EntryIDs: []uint32{16028}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Grobbulus", EntryIDs: []uint32{15931}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Gluth", EntryIDs: []uint32{15932}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Thaddius", EntryIDs: []uint32{15928}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Stalagg", EntryIDs: []uint32{15929}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Feugen", EntryIDs: []uint32{15930}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		// Frostwyrm Lair
		{Name: "Sapphiron", EntryIDs: []uint32{15989}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Kel'Thuzad", EntryIDs: []uint32{15990}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}
}

// ZulGurubSpeedrunRequirements returns the boss kills required for a
// valid Zul'Gurub speedrun.
func ZulGurubSpeedrunRequirements(flavor database.WoWFlavor) []rankings.SpeedrunRequirement {
	base := []rankings.SpeedrunRequirement{
		{Name: "High Priestess Jeklik", EntryIDs: []uint32{14517}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "High Priest Venoxis", EntryIDs: []uint32{14507}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "High Priestess Mar'li", EntryIDs: []uint32{14510}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Bloodlord Mandokir", EntryIDs: []uint32{11382}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "High Priest Thekal", EntryIDs: []uint32{11348}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "High Priestess Arlokk", EntryIDs: []uint32{14515}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Jin'do the Hexxer", EntryIDs: []uint32{11380}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Hakkar", EntryIDs: []uint32{14834}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Gahz'ranka", EntryIDs: []uint32{15114}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Edge of Madness", EntryIDs: []uint32{15083, 15084, 15085, 15082}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}

	if flavor.Has(database.FlavorVanillaPlus) {
		base = append(base, rankings.SpeedrunRequirement{Name: "Azus the Bloodseeker", EntryIDs: []uint32{25031}, Count: 1, Category: rankings.SpeedrunCategoryBosses})
		base = append(base, rankings.SpeedrunRequirement{Name: "The Nameless Hermit", EntryIDs: []uint32{25030}, Count: 1, Category: rankings.SpeedrunCategoryBosses})
	}

	return base
}

// TempleOfAhnQirajSpeedrunRequirements returns the boss kills required for a
// valid Temple of Ahn'Qiraj (AQ40) speedrun.
func TempleOfAhnQirajSpeedrunRequirements() []rankings.SpeedrunRequirement {
	return []rankings.SpeedrunRequirement{
		{Name: "The Prophet Skeram", EntryIDs: []uint32{15263}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Bug Family: Princess Yauj", EntryIDs: []uint32{15543}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Bug Family: Lord Kri", EntryIDs: []uint32{15511}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Bug Family: Vem", EntryIDs: []uint32{15544}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Battleguard Sartura", EntryIDs: []uint32{15516}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Fankriss the Unyielding", EntryIDs: []uint32{15510}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Viscidus", EntryIDs: []uint32{15299}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Princess Huhuran", EntryIDs: []uint32{15509}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Twin Emperors: Vek'nilash", EntryIDs: []uint32{15275}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Twin Emperors: Vek'lor", EntryIDs: []uint32{15276}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Ouro", EntryIDs: []uint32{15517}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "C'Thun", EntryIDs: []uint32{15727}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Eye of C'Thun", EntryIDs: []uint32{15589}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}
}

// RuinsOfAhnQirajSpeedrunRequirements returns the boss kills required for a
// valid Ruins of Ahn'Qiraj (AQ20) speedrun.
func RuinsOfAhnQirajSpeedrunRequirements() []rankings.SpeedrunRequirement {
	return []rankings.SpeedrunRequirement{
		{Name: "Kurinnaxx", EntryIDs: []uint32{15348}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "General Rajaxx", EntryIDs: []uint32{15341}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Moam", EntryIDs: []uint32{15340}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Buru the Gorger", EntryIDs: []uint32{15370}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Ayamiss the Hunter", EntryIDs: []uint32{15369}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Ossirian the Unscarred", EntryIDs: []uint32{15339}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}
}

// TimbermawHoldSpeedrunRequirements returns the boss kills required for a
// valid Timbermaw Hold speedrun.
func TimbermawHoldSpeedrunRequirements() []rankings.SpeedrunRequirement {
	return []rankings.SpeedrunRequirement{
		{Name: "Kodiak", EntryIDs: []uint32{62937}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Rotgrowl", EntryIDs: []uint32{62936}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Trioch the Devourer", EntryIDs: []uint32{62946}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Karrsh the Sentinel", EntryIDs: []uint32{62934}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Chieftain Partath", EntryIDs: []uint32{62941}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Archdruid Kronn", EntryIDs: []uint32{62938}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Selenaxx Foulheart", EntryIDs: []uint32{62940}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Loktanag the Vile", EntryIDs: []uint32{2139}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Ormanos the Cracked", EntryIDs: []uint32{62935}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Ursol", EntryIDs: []uint32{62947}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
		{Name: "Peroth'arn", EntryIDs: []uint32{60686}, Count: 1, Category: rankings.SpeedrunCategoryBosses},
	}
}
