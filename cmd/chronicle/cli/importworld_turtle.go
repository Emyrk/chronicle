package cli

import (
	"context"
	"fmt"
	"path/filepath"

	dbcdatacli "github.com/Emyrk/chronicle/scripts/dbcdata/cli"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/coder/serpent"
)

// tableDetector identifies a JSON file's table by checking for unique key fingerprints.
type tableDetector struct {
	Table    string
	Required []string // keys that must be present
}

// tableDetectors is used by the shared detectFiles/detectTable helpers.
var tableDetectors = []tableDetector{
	{"world_display_info", []string{"ID", "icon"}},
	{"world_creature_spawn", []string{"guid", "map"}},
	{"world_creature_template", []string{"entry", "display_id1", "subname"}},
	{"world_item_template", []string{"entry", "inventory_type"}},
	{"world_item_enchantment", []string{"entry", "ench", "chance"}},
	{"world_spell_area", []string{"spell", "area", "autocast"}},
	{"world_spell_chain", []string{"spell_id", "prev_spell"}},
	{"world_spell_group", []string{"group_id", "group_spell_id"}},
	{"world_spell_threat", []string{"Threat"}},
}

// tableColumnMap defines the ordered columns and primary key for each table.
// JSON keys are mapped to DB column names here.
type tableSchema struct {
	Columns     []string          // DB column names in order
	PKColumns   []string          // primary key columns for ON CONFLICT
	JSONToDB    map[string]string // JSON key -> DB column name (only non-trivial mappings)
	TextColumns map[string]bool   // columns that are TEXT type (for zero-value defaulting)
}

// tableSchemas is used by the shared detectFiles/importTable helpers.
var tableSchemas = map[string]*tableSchema{
	"world_display_info": {
		Columns:   []string{"id", "icon"},
		PKColumns: []string{"id"},
		JSONToDB:  map[string]string{"ID": "id"},
	},
	"world_creature_spawn": {
		Columns:   []string{"guid", "id", "id2", "id3", "id4", "map"},
		PKColumns: []string{"guid"},
	},
	"world_creature_template": {
		Columns: []string{
			"entry", "display_id1", "display_id2", "display_id3", "display_id4",
			"mount_display_id", "name", "subname", "level_min", "level_max",
			"health_min", "health_max", "mana_min", "mana_max", "armor",
			"dmg_min", "dmg_max", "dmg_school", "attack_power", "dmg_multiplier",
			"base_attack_time", "ranged_attack_time", "unit_class", "unit_flags",
			"ranged_dmg_min", "ranged_dmg_max", "holy_res", "fire_res", "nature_res",
			"frost_res", "shadow_res", "arcane_res", "mechanic_immune_mask",
			"school_immune_mask", "immunity_flags",
		},
		PKColumns: []string{"entry"},
	},
	"world_item_enchantment": {
		Columns:   []string{"entry", "ench", "chance"},
		PKColumns: []string{"entry", "ench"},
	},
	"world_item_template": {
		TextColumns: map[string]bool{"name": true, "description": true, "script_name": true, "patch": true},
		Columns: []string{
			"entry", "class", "subclass", "name", "description", "display_id",
			"quality", "flags", "buy_count", "buy_price", "sell_price",
			"inventory_type", "allowable_class", "allowable_race", "item_level",
			"required_level", "required_skill", "required_skill_rank",
			"required_spell", "required_honor_rank", "required_city_rank",
			"required_reputation_faction", "required_reputation_rank",
			"max_count", "stackable", "container_slots",
			"stat_type1", "stat_value1", "stat_type2", "stat_value2",
			"stat_type3", "stat_value3", "stat_type4", "stat_value4",
			"stat_type5", "stat_value5", "stat_type6", "stat_value6",
			"stat_type7", "stat_value7", "stat_type8", "stat_value8",
			"stat_type9", "stat_value9", "stat_type10", "stat_value10",
			"delay", "range_mod", "ammo_type",
			"dmg_min1", "dmg_max1", "dmg_type1",
			"dmg_min2", "dmg_max2", "dmg_type2",
			"dmg_min3", "dmg_max3", "dmg_type3",
			"dmg_min4", "dmg_max4", "dmg_type4",
			"dmg_min5", "dmg_max5", "dmg_type5",
			"block", "armor", "holy_res", "fire_res", "nature_res",
			"frost_res", "shadow_res", "arcane_res",
			"spellid_1", "spelltrigger_1", "spellcharges_1", "spellppmrate_1",
			"spellcooldown_1", "spellcategory_1", "spellcategorycooldown_1",
			"spellid_2", "spelltrigger_2", "spellcharges_2", "spellppmrate_2",
			"spellcooldown_2", "spellcategory_2", "spellcategorycooldown_2",
			"spellid_3", "spelltrigger_3", "spellcharges_3", "spellppmrate_3",
			"spellcooldown_3", "spellcategory_3", "spellcategorycooldown_3",
			"spellid_4", "spelltrigger_4", "spellcharges_4", "spellppmrate_4",
			"spellcooldown_4", "spellcategory_4", "spellcategorycooldown_4",
			"spellid_5", "spelltrigger_5", "spellcharges_5", "spellppmrate_5",
			"spellcooldown_5", "spellcategory_5", "spellcategorycooldown_5",
			"bonding", "page_text", "page_language", "page_material",
			"start_quest", "lock_id", "material", "sheath", "random_property",
			"set_id", "max_durability", "area_bound", "map_bound", "duration",
			"bag_family", "disenchant_id", "food_type", "min_money_loot",
			"max_money_loot", "wrapped_gift", "extra_flags", "other_team_entry",
			"script_name", "patch", "tooltip_set_id",
		},
		PKColumns: []string{"entry"},
	},
	"world_spell_area": {
		Columns:   []string{"spell", "area", "quest_start", "quest_start_active", "quest_end", "aura_spell", "racemask", "gender", "autocast"},
		PKColumns: []string{"spell", "area"},
	},
	"world_spell_chain": {
		Columns:   []string{"spell_id", "prev_spell", "first_spell", "rank", "req_spell"},
		PKColumns: []string{"spell_id"},
	},
	"world_spell_group": {
		Columns:   []string{"group_id", "group_spell_id", "spell_id"},
		PKColumns: []string{"group_id", "spell_id"},
	},
	"world_spell_threat": {
		Columns:   []string{"entry", "threat", "multiplier", "ap_bonus"},
		PKColumns: []string{"entry"},
		JSONToDB:  map[string]string{"Threat": "threat"},
	},
}

const turtleDataDir = "importdata/world/turtle"

// importWorldTurtle imports world data for the Turtle WoW server.
// It reads JSON files from importdata/world/turtle/ and DBC data from the WoW client.
func importWorldTurtle(ctx context.Context, pool *pgxpool.Pool, inv *serpent.Invocation, _ ImportWorldOptions) error {
	dataDir := turtleDataDir

	detected, err := detectFiles(dataDir)
	if err != nil {
		return fmt.Errorf("detecting files: %w", err)
	}
	if len(detected) == 0 {
		return fmt.Errorf("no world data JSON files detected in %s", dataDir)
	}

	for file, table := range detected {
		_, _ = fmt.Fprintf(inv.Stderr, "detected: %s -> %s\n", file, table)
	}

	for file, table := range detected {
		filePath := filepath.Join(dataDir, file)
		n, err := importTable(ctx, pool, table, filePath)
		if err != nil {
			return fmt.Errorf("importing %s: %w", table, err)
		}
		_, _ = fmt.Fprintf(inv.Stderr, "imported %s: %d rows\n", table, n)
	}

	wowDir := dbcdatacli.DefaultClientPath("turtle")
	_, _ = fmt.Fprintf(inv.Stderr, "importing DBC data from %s\n", wowDir)
	if err := importDBCData(ctx, pool, wowDir, inv); err != nil {
		return fmt.Errorf("importing DBC data: %w", err)
	}

	// Not needed for turtle
	//if err := fixupMultiTierSets(ctx, pool, inv); err != nil {
	//	return fmt.Errorf("fixing up multi-tier sets: %w", err)
	//}

	return nil
}
