package wdb

import "github.com/Emyrk/chronicle/database"

// maskEquivalent returns true if the difference is just a "select all"
// representation mismatch. WoW servers use -1 as a shorthand for "all
// classes/races allowed", while the client cache sends the actual bitmask
// of all valid options. We skip the diff when either side is -1.
func maskEquivalent(a, b any) bool {
	return isMaskNeg1(a) || isMaskNeg1(b)
}

func isMaskNeg1(v any) bool {
	switch n := v.(type) {
	case int32:
		return n == -1
	case uint32:
		return n == 0xFFFFFFFF
	default:
		return false
	}
}

// FieldDiff describes a single changed field.
type FieldDiff struct {
	Field      string `json:"field"`
	Old        any    `json:"old"`
	New        any    `json:"new"`
	Unreliable bool   `json:"unreliable,omitempty"`
}

// unreliableFields are WDB fields that the client cache does not reliably
// populate (e.g. spell cooldowns/triggers may be zeroed out). These are
// still shown in diffs but excluded from upserts.
var unreliableFields = map[string]bool{
	"spelltrigger_1": true, "spellcharges_1": true,
	"spellcooldown_1": true, "spellcategory_1": true, "spellcategorycooldown_1": true,
	"spelltrigger_2": true, "spellcharges_2": true,
	"spellcooldown_2": true, "spellcategory_2": true, "spellcategorycooldown_2": true,
	"spelltrigger_3": true, "spellcharges_3": true,
	"spellcooldown_3": true, "spellcategory_3": true, "spellcategorycooldown_3": true,
	"spelltrigger_4": true, "spellcharges_4": true,
	"spellcooldown_4": true, "spellcategory_4": true, "spellcategorycooldown_4": true,
	"spelltrigger_5": true, "spellcharges_5": true,
	"spellcooldown_5": true, "spellcategory_5": true, "spellcategorycooldown_5": true,
}

// ItemDiff describes changes for one item entry.
type ItemDiff struct {
	Entry  int32       `json:"entry"`
	Name   string      `json:"name"`
	Status string      `json:"status"` // "new", "changed", "unchanged"
	Fields []FieldDiff `json:"fields,omitempty"`
}

// CompareItems compares WDB-sourced fields between a WDB row and a DB row.
// Only fields that come from the WDB cache are compared; server-only fields
// (buy_count, spellppmrate, disenchant_id, food_type, etc.) are ignored.
func CompareItems(wdbRow, dbRow database.WorldItemTemplate) []FieldDiff {
	type check struct {
		name string
		wdb  any
		db   any
	}

	checks := []check{
		{"class", wdbRow.Class, dbRow.Class},
		{"subclass", wdbRow.Subclass, dbRow.Subclass},
		{"name", wdbRow.Name, dbRow.Name},
		{"description", wdbRow.Description, dbRow.Description},
		{"display_id", wdbRow.DisplayID, dbRow.DisplayID},
		{"quality", wdbRow.Quality, dbRow.Quality},
		{"flags", wdbRow.Flags, dbRow.Flags},
		{"buy_price", wdbRow.BuyPrice, dbRow.BuyPrice},
		{"sell_price", wdbRow.SellPrice, dbRow.SellPrice},
		{"inventory_type", wdbRow.InventoryType, dbRow.InventoryType},
		{"allowable_class", wdbRow.AllowableClass, dbRow.AllowableClass},
		{"allowable_race", wdbRow.AllowableRace, dbRow.AllowableRace},
		{"item_level", wdbRow.ItemLevel, dbRow.ItemLevel},
		{"required_level", wdbRow.RequiredLevel, dbRow.RequiredLevel},
		{"required_skill", wdbRow.RequiredSkill, dbRow.RequiredSkill},
		{"required_skill_rank", wdbRow.RequiredSkillRank, dbRow.RequiredSkillRank},
		{"required_spell", wdbRow.RequiredSpell, dbRow.RequiredSpell},
		{"required_honor_rank", wdbRow.RequiredHonorRank, dbRow.RequiredHonorRank},
		{"required_city_rank", wdbRow.RequiredCityRank, dbRow.RequiredCityRank},
		{"required_reputation_faction", wdbRow.RequiredReputationFaction, dbRow.RequiredReputationFaction},
		{"required_reputation_rank", wdbRow.RequiredReputationRank, dbRow.RequiredReputationRank},
		{"max_count", wdbRow.MaxCount, dbRow.MaxCount},
		{"stackable", wdbRow.Stackable, dbRow.Stackable},
		{"container_slots", wdbRow.ContainerSlots, dbRow.ContainerSlots},
		{"stat_type1", wdbRow.StatType1, dbRow.StatType1},
		{"stat_value1", wdbRow.StatValue1, dbRow.StatValue1},
		{"stat_type2", wdbRow.StatType2, dbRow.StatType2},
		{"stat_value2", wdbRow.StatValue2, dbRow.StatValue2},
		{"stat_type3", wdbRow.StatType3, dbRow.StatType3},
		{"stat_value3", wdbRow.StatValue3, dbRow.StatValue3},
		{"stat_type4", wdbRow.StatType4, dbRow.StatType4},
		{"stat_value4", wdbRow.StatValue4, dbRow.StatValue4},
		{"stat_type5", wdbRow.StatType5, dbRow.StatType5},
		{"stat_value5", wdbRow.StatValue5, dbRow.StatValue5},
		{"stat_type6", wdbRow.StatType6, dbRow.StatType6},
		{"stat_value6", wdbRow.StatValue6, dbRow.StatValue6},
		{"stat_type7", wdbRow.StatType7, dbRow.StatType7},
		{"stat_value7", wdbRow.StatValue7, dbRow.StatValue7},
		{"stat_type8", wdbRow.StatType8, dbRow.StatType8},
		{"stat_value8", wdbRow.StatValue8, dbRow.StatValue8},
		{"stat_type9", wdbRow.StatType9, dbRow.StatType9},
		{"stat_value9", wdbRow.StatValue9, dbRow.StatValue9},
		{"stat_type10", wdbRow.StatType10, dbRow.StatType10},
		{"stat_value10", wdbRow.StatValue10, dbRow.StatValue10},
		{"delay", wdbRow.Delay, dbRow.Delay},
		{"range_mod", wdbRow.RangeMod, dbRow.RangeMod},
		{"ammo_type", wdbRow.AmmoType, dbRow.AmmoType},
		{"dmg_min1", wdbRow.DmgMin1, dbRow.DmgMin1},
		{"dmg_max1", wdbRow.DmgMax1, dbRow.DmgMax1},
		{"dmg_type1", wdbRow.DmgType1, dbRow.DmgType1},
		{"dmg_min2", wdbRow.DmgMin2, dbRow.DmgMin2},
		{"dmg_max2", wdbRow.DmgMax2, dbRow.DmgMax2},
		{"dmg_type2", wdbRow.DmgType2, dbRow.DmgType2},
		{"block", wdbRow.Block, dbRow.Block},
		{"armor", wdbRow.Armor, dbRow.Armor},
		{"holy_res", wdbRow.HolyRes, dbRow.HolyRes},
		{"fire_res", wdbRow.FireRes, dbRow.FireRes},
		{"nature_res", wdbRow.NatureRes, dbRow.NatureRes},
		{"frost_res", wdbRow.FrostRes, dbRow.FrostRes},
		{"shadow_res", wdbRow.ShadowRes, dbRow.ShadowRes},
		{"arcane_res", wdbRow.ArcaneRes, dbRow.ArcaneRes},
		{"spellid_1", wdbRow.Spellid1, dbRow.Spellid1},
		{"spelltrigger_1", wdbRow.Spelltrigger1, dbRow.Spelltrigger1},
		{"spellcharges_1", wdbRow.Spellcharges1, dbRow.Spellcharges1},
		{"spellcooldown_1", wdbRow.Spellcooldown1, dbRow.Spellcooldown1},
		{"spellcategory_1", wdbRow.Spellcategory1, dbRow.Spellcategory1},
		{"spellcategorycooldown_1", wdbRow.Spellcategorycooldown1, dbRow.Spellcategorycooldown1},
		{"spellid_2", wdbRow.Spellid2, dbRow.Spellid2},
		{"spelltrigger_2", wdbRow.Spelltrigger2, dbRow.Spelltrigger2},
		{"spellcharges_2", wdbRow.Spellcharges2, dbRow.Spellcharges2},
		{"spellcooldown_2", wdbRow.Spellcooldown2, dbRow.Spellcooldown2},
		{"spellcategory_2", wdbRow.Spellcategory2, dbRow.Spellcategory2},
		{"spellcategorycooldown_2", wdbRow.Spellcategorycooldown2, dbRow.Spellcategorycooldown2},
		{"spellid_3", wdbRow.Spellid3, dbRow.Spellid3},
		{"spelltrigger_3", wdbRow.Spelltrigger3, dbRow.Spelltrigger3},
		{"spellcharges_3", wdbRow.Spellcharges3, dbRow.Spellcharges3},
		{"spellcooldown_3", wdbRow.Spellcooldown3, dbRow.Spellcooldown3},
		{"spellcategory_3", wdbRow.Spellcategory3, dbRow.Spellcategory3},
		{"spellcategorycooldown_3", wdbRow.Spellcategorycooldown3, dbRow.Spellcategorycooldown3},
		{"spellid_4", wdbRow.Spellid4, dbRow.Spellid4},
		{"spelltrigger_4", wdbRow.Spelltrigger4, dbRow.Spelltrigger4},
		{"spellcharges_4", wdbRow.Spellcharges4, dbRow.Spellcharges4},
		{"spellcooldown_4", wdbRow.Spellcooldown4, dbRow.Spellcooldown4},
		{"spellcategory_4", wdbRow.Spellcategory4, dbRow.Spellcategory4},
		{"spellcategorycooldown_4", wdbRow.Spellcategorycooldown4, dbRow.Spellcategorycooldown4},
		{"spellid_5", wdbRow.Spellid5, dbRow.Spellid5},
		{"spelltrigger_5", wdbRow.Spelltrigger5, dbRow.Spelltrigger5},
		{"spellcharges_5", wdbRow.Spellcharges5, dbRow.Spellcharges5},
		{"spellcooldown_5", wdbRow.Spellcooldown5, dbRow.Spellcooldown5},
		{"spellcategory_5", wdbRow.Spellcategory5, dbRow.Spellcategory5},
		{"spellcategorycooldown_5", wdbRow.Spellcategorycooldown5, dbRow.Spellcategorycooldown5},
		{"bonding", wdbRow.Bonding, dbRow.Bonding},
		{"page_text", wdbRow.PageText, dbRow.PageText},
		{"page_language", wdbRow.PageLanguage, dbRow.PageLanguage},
		{"page_material", wdbRow.PageMaterial, dbRow.PageMaterial},
		{"start_quest", wdbRow.StartQuest, dbRow.StartQuest},
		{"lock_id", wdbRow.LockID, dbRow.LockID},
		{"material", wdbRow.Material, dbRow.Material},
		{"sheath", wdbRow.Sheath, dbRow.Sheath},
		{"random_property", wdbRow.RandomProperty, dbRow.RandomProperty},
		{"set_id", wdbRow.SetID, dbRow.SetID},
		{"max_durability", wdbRow.MaxDurability, dbRow.MaxDurability},
		{"area_bound", wdbRow.AreaBound, dbRow.AreaBound},
		{"map_bound", wdbRow.MapBound, dbRow.MapBound},
		{"duration", wdbRow.Duration, dbRow.Duration},
		{"bag_family", wdbRow.BagFamily, dbRow.BagFamily},
	}

	// Bitmask fields where signed/unsigned representation differences
	// (e.g. -1 vs 2147483647) should not count as a diff.
	maskFields := map[string]bool{
		"flags": true, "allowable_class": true, "allowable_race": true,
	}

	var diffs []FieldDiff
	for _, c := range checks {
		if c.wdb != c.db && maskFields[c.name] {
			if maskEquivalent(c.wdb, c.db) {
				continue
			}
		}
		if c.wdb != c.db {
			diffs = append(diffs, FieldDiff{
				Field:      c.name,
				Old:        c.db,
				New:        c.wdb,
				Unreliable: unreliableFields[c.name],
			})
		}
	}
	return diffs
}

// CompareCreatures compares WDB-sourced fields between two WorldCreatureTemplate rows.
// Only compares fields available in the creature cache (name, subname, display IDs).
func CompareCreatures(wdbRow, dbRow database.WorldCreatureTemplate) []FieldDiff {
	// For subname, compare the string value (treat NULL as "").
	wdbSub := ""
	if wdbRow.Subname.Valid {
		wdbSub = wdbRow.Subname.String
	}
	dbSub := ""
	if dbRow.Subname.Valid {
		dbSub = dbRow.Subname.String
	}

	checks := []struct {
		name string
		wdb  any
		db   any
	}{
		{"name", wdbRow.Name, dbRow.Name},
		{"subname", wdbSub, dbSub},
		{"display_id1", wdbRow.DisplayId1, dbRow.DisplayId1},
		{"display_id2", wdbRow.DisplayId2, dbRow.DisplayId2},
		{"display_id3", wdbRow.DisplayId3, dbRow.DisplayId3},
		{"display_id4", wdbRow.DisplayId4, dbRow.DisplayId4},
	}

	var diffs []FieldDiff
	for _, c := range checks {
		if c.wdb != c.db {
			diffs = append(diffs, FieldDiff{Field: c.name, Old: c.db, New: c.wdb})
		}
	}
	return diffs
}

// CompareCreaturesFull compares all overlapping fields between two WorldCreatureTemplate rows.
// Used for SQL dump imports where all fields are available (unlike WDB which only has a subset).
func CompareCreaturesFull(newRow, dbRow database.WorldCreatureTemplate) []FieldDiff {
	newSub := ""
	if newRow.Subname.Valid {
		newSub = newRow.Subname.String
	}
	dbSub := ""
	if dbRow.Subname.Valid {
		dbSub = dbRow.Subname.String
	}

	checks := []struct {
		name string
		a    any
		b    any
	}{
		{"name", newRow.Name, dbRow.Name},
		{"subname", newSub, dbSub},
		{"display_id1", newRow.DisplayId1, dbRow.DisplayId1},
		{"display_id2", newRow.DisplayId2, dbRow.DisplayId2},
		{"display_id3", newRow.DisplayId3, dbRow.DisplayId3},
		{"display_id4", newRow.DisplayId4, dbRow.DisplayId4},
		{"level_min", newRow.LevelMin, dbRow.LevelMin},
		{"level_max", newRow.LevelMax, dbRow.LevelMax},
		{"dmg_min", newRow.DmgMin, dbRow.DmgMin},
		{"dmg_max", newRow.DmgMax, dbRow.DmgMax},
		{"dmg_school", newRow.DmgSchool, dbRow.DmgSchool},
		{"attack_power", newRow.AttackPower, dbRow.AttackPower},
		{"dmg_multiplier", newRow.DmgMultiplier, dbRow.DmgMultiplier},
		{"base_attack_time", newRow.BaseAttackTime, dbRow.BaseAttackTime},
		{"ranged_attack_time", newRow.RangedAttackTime, dbRow.RangedAttackTime},
		{"unit_class", newRow.UnitClass, dbRow.UnitClass},
		{"unit_flags", newRow.UnitFlags, dbRow.UnitFlags},
		{"ranged_dmg_min", newRow.RangedDmgMin, dbRow.RangedDmgMin},
		{"ranged_dmg_max", newRow.RangedDmgMax, dbRow.RangedDmgMax},
		{"holy_res", newRow.HolyRes, dbRow.HolyRes},
		{"fire_res", newRow.FireRes, dbRow.FireRes},
		{"nature_res", newRow.NatureRes, dbRow.NatureRes},
		{"frost_res", newRow.FrostRes, dbRow.FrostRes},
		{"shadow_res", newRow.ShadowRes, dbRow.ShadowRes},
		{"arcane_res", newRow.ArcaneRes, dbRow.ArcaneRes},
		{"mechanic_immune_mask", newRow.MechanicImmuneMask, dbRow.MechanicImmuneMask},
	}

	var diffs []FieldDiff
	for _, c := range checks {
		if c.a != c.b {
			diffs = append(diffs, FieldDiff{Field: c.name, Old: c.b, New: c.a})
		}
	}
	return diffs
}
