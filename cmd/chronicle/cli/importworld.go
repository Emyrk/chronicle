package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"
	"github.com/Emyrk/chronicle/database/migrations"
	"github.com/coder/serpent"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// tableDetector identifies a JSON file's table by checking for unique key fingerprints.
type tableDetector struct {
	Table    string
	Required []string // keys that must be present
}

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
	Columns   []string          // DB column names in order
	PKColumns []string          // primary key columns for ON CONFLICT
	JSONToDB  map[string]string // JSON key -> DB column name (only non-trivial mappings)
}

// jsonKeyToDBCol returns the DB column name for a JSON key.
func (ts *tableSchema) jsonKeyToDBCol(jsonKey string) string {
	if mapped, ok := ts.JSONToDB[jsonKey]; ok {
		return mapped
	}
	return strings.ToLower(jsonKey)
}

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
			"script_name", "patch",
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

func ImportWorldCmd() *serpent.Command {
	cmd := &serpent.Command{
		Use:   "import-world",
		Short: "Import world data JSON files into PostgreSQL",
		Children: []*serpent.Command{
			importWorldDetectCmd(),
		},
	}

	var dbURL, dataDir, wowDir string
	cmd.Options = serpent.OptionSet{
		{
			Name:        "db-url",
			Description: "PostgreSQL connection URL.",
			Flag:        "db-url",
			Env:         "DATABASE_URL",
			Required:    true,
			Value:       serpent.StringOf(&dbURL),
		},
		{
			Name:        "data-dir",
			Description: "Directory containing world data JSON files.",
			Flag:        "data-dir",
			Default:     "./importdata/world",
			Value:       serpent.StringOf(&dataDir),
		},
		{
			Name:        "wow-dir",
			Description: "Path to WoW client directory for DBC extraction (optional).",
			Flag:        "wow-dir",
			Env:         "WOW_DIR",
			Default:     "/home/steven/Games/turtlewow/drive_c/Program Files (x86)/TurtleWoW",
			Value:       serpent.StringOf(&wowDir),
		},
	}

	cmd.Handler = func(inv *serpent.Invocation) error {
		ctx := inv.Context()

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

		pool, err := pgxpool.New(ctx, dbURL)
		if err != nil {
			return fmt.Errorf("connecting to database: %w", err)
		}
		defer pool.Close()

		err = migrations.Up(pool)
		if err != nil {
			return fmt.Errorf("running migrations: %w", err)
		}

		for file, table := range detected {
			filePath := filepath.Join(dataDir, file)
			n, err := importTable(ctx, pool, table, filePath)
			if err != nil {
				return fmt.Errorf("importing %s: %w", table, err)
			}
			_, _ = fmt.Fprintf(inv.Stderr, "imported %s: %d rows\n", table, n)
		}

		if wowDir != "" {
			_, _ = fmt.Fprintf(inv.Stderr, "importing DBC data from %s\n", wowDir)
			if err := importDBCData(ctx, pool, wowDir, inv); err != nil {
				return fmt.Errorf("importing DBC data: %w", err)
			}
		}

		_, _ = fmt.Fprintf(inv.Stderr, "import complete\n")
		return nil
	}

	return cmd
}

func importWorldDetectCmd() *serpent.Command {
	var dataDir string
	var rename bool
	return &serpent.Command{
		Use:   "detect",
		Short: "Detect world data JSON files and optionally rename them",
		Options: serpent.OptionSet{
			{
				Name:        "data-dir",
				Description: "Directory containing world data JSON files.",
				Flag:        "data-dir",
				Default:     "./importdata/world",
				Value:       serpent.StringOf(&dataDir),
			},
			{
				Name:        "rename",
				Description: "Rename detected files to <table_name>.json.",
				Flag:        "rename",
				Default:     "false",
				Value:       serpent.BoolOf(&rename),
			},
		},
		Handler: func(inv *serpent.Invocation) error {
			detected, err := detectFiles(dataDir)
			if err != nil {
				return fmt.Errorf("detecting files: %w", err)
			}
			if len(detected) == 0 {
				return fmt.Errorf("no world data JSON files detected in %s", dataDir)
			}

			for file, table := range detected {
				newName := table + ".json"
				if rename && file != newName {
					oldPath := filepath.Join(dataDir, file)
					newPath := filepath.Join(dataDir, newName)
					if err := os.Rename(oldPath, newPath); err != nil {
						return fmt.Errorf("renaming %s -> %s: %w", file, newName, err)
					}
					_, _ = fmt.Fprintf(inv.Stdout, "%s -> %s (renamed)\n", file, newName)
				} else {
					_, _ = fmt.Fprintf(inv.Stdout, "%s -> %s\n", file, table)
				}
			}
			return nil
		},
	}
}

// detectFiles scans dataDir for .json files and identifies their table by key fingerprinting.
func detectFiles(dataDir string) (map[string]string, error) {
	entries, err := os.ReadDir(dataDir)
	if err != nil {
		return nil, fmt.Errorf("reading directory %s: %w", dataDir, err)
	}

	result := make(map[string]string)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		// Check if filename already matches a known table name.
		baseName := strings.TrimSuffix(entry.Name(), ".json")
		if _, ok := tableSchemas[baseName]; ok {
			result[entry.Name()] = baseName
			continue
		}

		table, err := detectTable(filepath.Join(dataDir, entry.Name()))
		if err != nil {
			return nil, fmt.Errorf("detecting %s: %w", entry.Name(), err)
		}
		if table != "" {
			result[entry.Name()] = table
		}
	}
	return result, nil
}

// detectTable reads the first element of a JSON array file and matches its keys.
func detectTable(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	dec := json.NewDecoder(f)
	// Read opening bracket
	t, err := dec.Token()
	if err != nil {
		return "", fmt.Errorf("reading token: %w", err)
	}
	if delim, ok := t.(json.Delim); !ok || delim != '[' {
		return "", fmt.Errorf("expected JSON array, got %v", t)
	}

	// Read first object
	if !dec.More() {
		return "", nil // empty array
	}

	var first map[string]json.RawMessage
	if err := dec.Decode(&first); err != nil {
		return "", fmt.Errorf("decoding first element: %w", err)
	}

	keys := make(map[string]bool, len(first))
	for k := range first {
		keys[k] = true
	}

	for _, det := range tableDetectors {
		if matchesKeys(keys, det.Required) {
			return det.Table, nil
		}
	}
	return "", nil
}

func matchesKeys(keys map[string]bool, required []string) bool {
	for _, r := range required {
		if !keys[r] {
			return false
		}
	}
	return true
}

// importTable reads a JSON file and upserts all rows into the given table.
func importTable(ctx context.Context, pool *pgxpool.Pool, table, filePath string) (int, error) {
	schema, ok := tableSchemas[table]
	if !ok {
		return 0, fmt.Errorf("unknown table schema: %s", table)
	}

	f, err := os.Open(filePath)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	var rows []map[string]interface{}
	if err := json.NewDecoder(f).Decode(&rows); err != nil {
		return 0, fmt.Errorf("decoding JSON: %w", err)
	}

	if len(rows) == 0 {
		return 0, nil
	}

	// Build the upsert SQL once
	upsertSQL := buildUpsertSQL(table, schema)

	// Process in batches of 500
	const batchSize = 500
	total := 0
	for i := 0; i < len(rows); i += batchSize {
		end := i + batchSize
		if end > len(rows) {
			end = len(rows)
		}
		chunk := rows[i:end]

		batch := &pgx.Batch{}
		for _, row := range chunk {
			args := make([]interface{}, len(schema.Columns))
			for j, col := range schema.Columns {
				// Find the JSON key for this column
				jsonKey := col
				if schema.JSONToDB != nil {
					for jk, dc := range schema.JSONToDB {
						if dc == col {
							jsonKey = jk
							break
						}
					}
				}
				args[j] = row[jsonKey]
			}
			batch.Queue(upsertSQL, args...)
		}

		br := pool.SendBatch(ctx, batch)
		for range chunk {
			if _, err := br.Exec(); err != nil {
				br.Close()
				return total, fmt.Errorf("executing batch at row %d: %w", total, err)
			}
		}
		if err := br.Close(); err != nil {
			return total, fmt.Errorf("closing batch: %w", err)
		}
		total += len(chunk)
	}

	return total, nil
}

// importDBCData extracts ItemRandomProperties and SpellItemEnchantment from the WoW client
// and upserts them into PostgreSQL.
func importDBCData(ctx context.Context, pool *pgxpool.Pool, wowDir string, inv *serpent.Invocation) error {
	wc, err := dbcdb.New(wowDir)
	if err != nil {
		return fmt.Errorf("opening WoW client at %s: %w", wowDir, err)
	}

	return importDBCTables(ctx, pool, wc, inv)
}

func importDBCTables(ctx context.Context, pool *pgxpool.Pool, wc *dbcdb.WoWClient, inv *serpent.Invocation) error {
	// --- ItemRandomProperties ---
	irpTable, err := wc.ItemRandomProperties()
	if err != nil {
		return fmt.Errorf("reading ItemRandomProperties.dbc: %w", err)
	}

	const irpSQL = `INSERT INTO dbc_item_random_properties (id, name, name_lang, enchantment_1, enchantment_2, enchantment_3, enchantment_4, enchantment_5)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, name_lang=EXCLUDED.name_lang,
			enchantment_1=EXCLUDED.enchantment_1, enchantment_2=EXCLUDED.enchantment_2,
			enchantment_3=EXCLUDED.enchantment_3, enchantment_4=EXCLUDED.enchantment_4,
			enchantment_5=EXCLUDED.enchantment_5`

	irpCount := 0
	const batchSize = 500
	batch := &pgx.Batch{}
	for i := 0; i < irpTable.Len(); i++ {
		row, err := irpTable.Index(i)
		if err != nil {
			return fmt.Errorf("reading ItemRandomProperties row %d: %w", i, err)
		}
		enchs := make([]int32, 5)
		for j := 0; j < len(row.Enchantment) && j < 5; j++ {
			enchs[j] = row.Enchantment[j]
		}
		batch.Queue(irpSQL, row.ID, row.Name, row.Name_lang.String(), enchs[0], enchs[1], enchs[2], enchs[3], enchs[4])
		irpCount++

		if batch.Len() >= batchSize {
			if err := flushBatch(ctx, pool, batch); err != nil {
				return fmt.Errorf("flushing ItemRandomProperties batch: %w", err)
			}
			batch = &pgx.Batch{}
		}
	}
	if batch.Len() > 0 {
		if err := flushBatch(ctx, pool, batch); err != nil {
			return fmt.Errorf("flushing final ItemRandomProperties batch: %w", err)
		}
	}
	_, _ = fmt.Fprintf(inv.Stderr, "imported dbc_item_random_properties: %d rows\n", irpCount)

	// --- SpellItemEnchantment ---
	sieTable, err := wc.SpellItemEnchantment()
	if err != nil {
		return fmt.Errorf("reading SpellItemEnchantment.dbc: %w", err)
	}

	const sieSQL = `INSERT INTO dbc_spell_item_enchantment
		(id, charges, effect_1, effect_2, effect_3,
		 effect_points_min_1, effect_points_min_2, effect_points_min_3,
		 effect_arg_1, effect_arg_2, effect_arg_3,
		 name_lang, item_visual, flags, src_item_id, condition_id,
		 required_skill_id, required_skill_rank, min_level, max_level)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
		ON CONFLICT (id) DO UPDATE SET
			charges=EXCLUDED.charges, effect_1=EXCLUDED.effect_1, effect_2=EXCLUDED.effect_2, effect_3=EXCLUDED.effect_3,
			effect_points_min_1=EXCLUDED.effect_points_min_1, effect_points_min_2=EXCLUDED.effect_points_min_2, effect_points_min_3=EXCLUDED.effect_points_min_3,
			effect_arg_1=EXCLUDED.effect_arg_1, effect_arg_2=EXCLUDED.effect_arg_2, effect_arg_3=EXCLUDED.effect_arg_3,
			name_lang=EXCLUDED.name_lang, item_visual=EXCLUDED.item_visual, flags=EXCLUDED.flags,
			src_item_id=EXCLUDED.src_item_id, condition_id=EXCLUDED.condition_id,
			required_skill_id=EXCLUDED.required_skill_id, required_skill_rank=EXCLUDED.required_skill_rank,
			min_level=EXCLUDED.min_level, max_level=EXCLUDED.max_level`

	sieCount := 0
	batch = &pgx.Batch{}
	for i := 0; i < sieTable.Len(); i++ {
		row, err := sieTable.Index(i)
		if err != nil {
			return fmt.Errorf("reading SpellItemEnchantment row %d: %w", i, err)
		}
		effects := padSlice(row.Effect, 3)
		pointsMin := padSlice(row.EffectPointsMin, 3)
		args := padSlice(row.EffectArg, 3)

		batch.Queue(sieSQL,
			row.ID, row.Charges,
			effects[0], effects[1], effects[2],
			pointsMin[0], pointsMin[1], pointsMin[2],
			args[0], args[1], args[2],
			row.Name_lang.String(), row.ItemVisual, row.Flags,
			row.Src_itemID, row.Condition_ID,
			row.RequiredSkillID, row.RequiredSkillRank,
			row.MinLevel, row.MaxLevel,
		)
		sieCount++

		if batch.Len() >= batchSize {
			if err := flushBatch(ctx, pool, batch); err != nil {
				return fmt.Errorf("flushing SpellItemEnchantment batch: %w", err)
			}
			batch = &pgx.Batch{}
		}
	}
	if batch.Len() > 0 {
		if err := flushBatch(ctx, pool, batch); err != nil {
			return fmt.Errorf("flushing final SpellItemEnchantment batch: %w", err)
		}
	}
	_, _ = fmt.Fprintf(inv.Stderr, "imported dbc_spell_item_enchantment: %d rows\n", sieCount)

	// --- ItemSet ---
	isTable, err := wc.ItemSet()
	if err != nil {
		return fmt.Errorf("reading ItemSet.dbc: %w", err)
	}

	const isSQL = `INSERT INTO dbc_item_set (id, name_lang, required_skill, required_skill_rank)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (id) DO UPDATE SET name_lang=EXCLUDED.name_lang,
			required_skill=EXCLUDED.required_skill, required_skill_rank=EXCLUDED.required_skill_rank`

	const isBonusSQL = `INSERT INTO dbc_item_set_bonus (set_id, threshold, spell_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (set_id, threshold, spell_id) DO NOTHING`

	isCount := 0
	isBonusCount := 0
	batch = &pgx.Batch{}
	for i := 0; i < isTable.Len(); i++ {
		row, err := isTable.Index(i)
		if err != nil {
			return fmt.Errorf("reading ItemSet row %d: %w", i, err)
		}
		batch.Queue(isSQL, row.ID, row.Name_lang.String(), row.RequiredSkill, row.RequiredSkillRank)
		isCount++

		// Insert set bonuses (spell + threshold pairs)
		for j := 0; j < len(row.SetSpellID) && j < len(row.SetThreshold); j++ {
			if row.SetSpellID[j] != 0 && row.SetThreshold[j] != 0 {
				batch.Queue(isBonusSQL, row.ID, row.SetThreshold[j], row.SetSpellID[j])
				isBonusCount++
			}
		}

		if batch.Len() >= batchSize {
			if err := flushBatch(ctx, pool, batch); err != nil {
				return fmt.Errorf("flushing ItemSet batch: %w", err)
			}
			batch = &pgx.Batch{}
		}
	}
	if batch.Len() > 0 {
		if err := flushBatch(ctx, pool, batch); err != nil {
			return fmt.Errorf("flushing final ItemSet batch: %w", err)
		}
	}
	_, _ = fmt.Fprintf(inv.Stderr, "imported dbc_item_set: %d sets, %d bonuses\n", isCount, isBonusCount)

	// --- ItemDisplayInfo ---
	idiTable, err := wc.ItemDisplayInfo()
	if err != nil {
		return fmt.Errorf("reading ItemDisplayInfo.dbc: %w", err)
	}

	const idiSQL = `INSERT INTO dbc_item_display_info (
			id, model_name, model_texture, geoset_group, flags, spell_visual_id,
			helmet_geoset_vis, texture, item_visual, particle_color_id,
			attachment_geoset_group, item_ranged_display_info_id,
			model_material_resources_id, model_resources_id, model_type_1,
			override_swoosh_sound_kit_id, sheathe_transform_matrix_id,
			sheathed_spell_visual_kit_id, state_spell_visual_kit_id,
			unsheathed_spell_visual_kit_id, inventory_icon, group_sound_index,
			ground_model, item_size, helmet_geoset_vis_id
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
		ON CONFLICT (id) DO UPDATE SET
			model_name=EXCLUDED.model_name, model_texture=EXCLUDED.model_texture,
			geoset_group=EXCLUDED.geoset_group, flags=EXCLUDED.flags,
			spell_visual_id=EXCLUDED.spell_visual_id, helmet_geoset_vis=EXCLUDED.helmet_geoset_vis,
			texture=EXCLUDED.texture, item_visual=EXCLUDED.item_visual,
			particle_color_id=EXCLUDED.particle_color_id,
			attachment_geoset_group=EXCLUDED.attachment_geoset_group,
			item_ranged_display_info_id=EXCLUDED.item_ranged_display_info_id,
			model_material_resources_id=EXCLUDED.model_material_resources_id,
			model_resources_id=EXCLUDED.model_resources_id, model_type_1=EXCLUDED.model_type_1,
			override_swoosh_sound_kit_id=EXCLUDED.override_swoosh_sound_kit_id,
			sheathe_transform_matrix_id=EXCLUDED.sheathe_transform_matrix_id,
			sheathed_spell_visual_kit_id=EXCLUDED.sheathed_spell_visual_kit_id,
			state_spell_visual_kit_id=EXCLUDED.state_spell_visual_kit_id,
			unsheathed_spell_visual_kit_id=EXCLUDED.unsheathed_spell_visual_kit_id,
			inventory_icon=EXCLUDED.inventory_icon, group_sound_index=EXCLUDED.group_sound_index,
			ground_model=EXCLUDED.ground_model, item_size=EXCLUDED.item_size,
			helmet_geoset_vis_id=EXCLUDED.helmet_geoset_vis_id`

	idiCount := 0
	batch = &pgx.Batch{}
	for i := 0; i < idiTable.Len(); i++ {
		row, err := idiTable.Index(i)
		if err != nil {
			return fmt.Errorf("reading ItemDisplayInfo row %d: %w", i, err)
		}
		batch.Queue(idiSQL,
			row.ID,
			jsonSlice(row.ModelName), jsonSlice(row.ModelTexture),
			jsonSlice(row.GeosetGroup), row.Flags, row.SpellVisualID,
			jsonSlice(row.HelmetGeosetVis), jsonSlice(row.Texture),
			row.ItemVisual, row.ParticleColorID,
			jsonSlice(row.AttachmentGeosetGroup), row.ItemRangedDisplayInfoID,
			jsonSlice(row.ModelMaterialResourcesID), jsonSlice(row.ModelResourcesID),
			row.ModelType1, row.OverrideSwooshSoundKitID,
			row.SheatheTransformMatrixID, row.SheathedSpellVisualKitID,
			row.StateSpellVisualKitID, row.UnsheathedSpellVisualKitID,
			jsonSlice(row.InventoryIcon), row.GroupSoundIndex,
			row.GroundModel, row.ItemSize, jsonSlice(row.HelmetGeosetVisID),
		)
		idiCount++

		if batch.Len() >= batchSize {
			if err := flushBatch(ctx, pool, batch); err != nil {
				return fmt.Errorf("flushing ItemDisplayInfo batch: %w", err)
			}
			batch = &pgx.Batch{}
		}
	}
	if batch.Len() > 0 {
		if err := flushBatch(ctx, pool, batch); err != nil {
			return fmt.Errorf("flushing final ItemDisplayInfo batch: %w", err)
		}
	}
	_, _ = fmt.Fprintf(inv.Stderr, "imported dbc_item_display_info: %d rows\n", idiCount)

	return nil
}

func flushBatch(ctx context.Context, pool *pgxpool.Pool, batch *pgx.Batch) error {
	br := pool.SendBatch(ctx, batch)
	for i := 0; i < batch.Len(); i++ {
		if _, err := br.Exec(); err != nil {
			br.Close()
			return err
		}
	}
	return br.Close()
}

// jsonSlice marshals any slice to JSON for JSONB columns.
func jsonSlice(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return []byte("[]")
	}
	return b
}

func padSlice(s []int32, n int) []int32 {
	result := make([]int32, n)
	for i := 0; i < len(s) && i < n; i++ {
		result[i] = s[i]
	}
	return result
}

// buildUpsertSQL generates: INSERT INTO table (cols...) VALUES ($1, $2, ...) ON CONFLICT (pk) DO UPDATE SET col=EXCLUDED.col, ...
func buildUpsertSQL(table string, schema *tableSchema) string {
	cols := strings.Join(schema.Columns, ", ")
	placeholders := make([]string, len(schema.Columns))
	for i := range schema.Columns {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
	}
	vals := strings.Join(placeholders, ", ")
	pk := strings.Join(schema.PKColumns, ", ")

	// Build SET clause for non-PK columns
	pkSet := make(map[string]bool, len(schema.PKColumns))
	for _, p := range schema.PKColumns {
		pkSet[p] = true
	}
	var setClauses []string
	for _, col := range schema.Columns {
		if !pkSet[col] {
			setClauses = append(setClauses, fmt.Sprintf("%s = EXCLUDED.%s", col, col))
		}
	}

	sql := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s)", table, cols, vals, pk)
	if len(setClauses) > 0 {
		sql += " DO UPDATE SET " + strings.Join(setClauses, ", ")
	} else {
		sql += " DO NOTHING"
	}
	return sql
}
