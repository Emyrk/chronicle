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

// ImportWorldOptions holds options passed to server importers.
type ImportWorldOptions struct {
	DryRun bool
}

// ServerWorldImporter defines the import function for a specific server.
// Each server can have its own data format and import logic.
// pool is nil when DryRun is true.
type ServerWorldImporter func(ctx context.Context, pool *pgxpool.Pool, inv *serpent.Invocation, opts ImportWorldOptions) error

// serverWorldImporters maps server names to their import functions.
var serverWorldImporters = map[string]ServerWorldImporter{
	"turtle": importWorldTurtle,
}

func ImportWorldCmd() *serpent.Command {
	cmd := &serpent.Command{
		Use:   "import-world",
		Short: "Import world data into PostgreSQL for a specific server",
	}

	var dbURL, server string
	var dryRun, truncate bool
	cmd.Options = serpent.OptionSet{
		{
			Name:        "db-url",
			Description: "PostgreSQL connection URL.",
			Flag:        "db-url",
			Env:         "DATABASE_URL",
			Value:       serpent.StringOf(&dbURL),
		},
		{
			Name:        "server",
			Description: "WoW server name (turtle, epoch, etc.). Determines import format.",
			Flag:        "server",
			Env:         "SERVER",
			Default:     "turtle",
			Value:       serpent.StringOf(&server),
		},
		{
			Name:        "dry-run",
			Description: "Read and dump data to stdout without writing to the database.",
			Flag:        "dry-run",
			Default:     "false",
			Value:       serpent.BoolOf(&dryRun),
		},
	}
	cmd.Options = append(cmd.Options, serpent.Option{
		Name:        "truncate",
		Description: "Truncate all world and DBC tables before importing.",
		Flag:        "truncate",
		Default:     "false",
		Value:       serpent.BoolOf(&truncate),
	})


	cmd.Handler = func(inv *serpent.Invocation) error {
		ctx := inv.Context()

		importer, ok := serverWorldImporters[server]
		if !ok {
			known := make([]string, 0, len(serverWorldImporters))
			for k := range serverWorldImporters {
				known = append(known, k)
			}
			return fmt.Errorf("unknown server %q, known servers: %s", server, strings.Join(known, ", "))
		}

		opts := ImportWorldOptions{DryRun: dryRun}

		var pool *pgxpool.Pool
		if !dryRun {
			if dbURL == "" {
				return fmt.Errorf("--db-url is required (or set DATABASE_URL)")
			}
			var err error
			pool, err = pgxpool.New(ctx, dbURL)
			if err != nil {
				return fmt.Errorf("connecting to database: %w", err)
			}
			defer pool.Close()

			if err := migrations.Up(pool); err != nil {
				return fmt.Errorf("running migrations: %w", err)
			}

			err = pool.Ping(ctx)
			if err != nil {
				return fmt.Errorf("pinging database: %w", err)
			}
		}

		_, _ = fmt.Fprintf(inv.Stderr, "importing world data for server %q (dry-run=%v)\n", server, dryRun)

		if truncate && !dryRun {
			if err := truncateWorldTables(ctx, pool, inv); err != nil {
				return fmt.Errorf("truncating world tables: %w", err)
			}
		}

		if err := importer(ctx, pool, inv, opts); err != nil {
			return fmt.Errorf("importing world data for %s: %w", server, err)
		}

		_, _ = fmt.Fprintf(inv.Stderr, "import complete\n")
		return nil
	}

	return cmd
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
	//nolint:errcheck
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

// dbcTables lists the DBC-sourced tables populated by importDBCTables.
var dbcTables = []string{
	"dbc_item_random_properties",
	"dbc_spell_item_enchantment",
	"dbc_item_set",
	"dbc_item_set_bonus",
	"dbc_item_set_item",
	"dbc_item_display_info",
}

// truncateWorldTables clears all world and DBC data tables before a fresh import.
func truncateWorldTables(ctx context.Context, pool *pgxpool.Pool, inv *serpent.Invocation) error {
	for table := range tableSchemas {
		_, err := pool.Exec(ctx, fmt.Sprintf("TRUNCATE TABLE %s", table))
		if err != nil {
			return fmt.Errorf("truncating %s: %w", table, err)
		}
		_, _ = fmt.Fprintf(inv.Stderr, "truncated %s\n", table)
	}
	for _, table := range dbcTables {
		_, err := pool.Exec(ctx, fmt.Sprintf("TRUNCATE TABLE %s CASCADE", table))
		if err != nil {
			return fmt.Errorf("truncating %s: %w", table, err)
		}
		_, _ = fmt.Fprintf(inv.Stderr, "truncated %s\n", table)
	}
	return nil
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
	//nolint:errcheck
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
				v, ok := row[jsonKey]
				if !ok {
					// Default missing keys to zero value rather than NULL.
					if schema.TextColumns[col] {
						v = ""
					} else {
						v = 0
					}
				} else if schema.TextColumns[col] {
					// Coerce to string for TEXT columns (JSON may have numeric values).
					v = fmt.Sprintf("%v", v)
				}
				args[j] = v
			}
			batch.Queue(upsertSQL, args...)
		}

		br := pool.SendBatch(ctx, batch)
		for range chunk {
			if _, err := br.Exec(); err != nil {
				_ = br.Close()
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

	const isSQL = `INSERT INTO dbc_item_set (id, name_lang, required_skill, required_skill_rank, item_ids)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (id) DO UPDATE SET name_lang=EXCLUDED.name_lang,
			required_skill=EXCLUDED.required_skill, required_skill_rank=EXCLUDED.required_skill_rank,
			item_ids=EXCLUDED.item_ids`

	const isBonusSQL = `INSERT INTO dbc_item_set_bonus (set_id, threshold, spell_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (set_id, threshold, spell_id) DO NOTHING`

	const isItemSQL = `INSERT INTO dbc_item_set_item (set_id, item_entry)
		VALUES ($1, $2)
		ON CONFLICT (set_id, item_entry) DO NOTHING`

	isCount := 0
	isBonusCount := 0
	isItemCount := 0
	batch = &pgx.Batch{}
	for i := 0; i < isTable.Len(); i++ {
		row, err := isTable.Index(i)
		if err != nil {
			return fmt.Errorf("reading ItemSet row %d: %w", i, err)
		}
		// Collect non-zero item IDs from the DBC ItemID array.
		itemIDs := make([]int32, 0)
		for _, id := range row.ItemID {
			if id != 0 {
				itemIDs = append(itemIDs, id)
			}
		}
		batch.Queue(isSQL, row.ID, row.Name_lang.String(), row.RequiredSkill, row.RequiredSkillRank, itemIDs)
		isCount++

		// Insert set bonuses (spell + threshold pairs)
		for j := 0; j < len(row.SetSpellID) && j < len(row.SetThreshold); j++ {
			if row.SetSpellID[j] != 0 && row.SetThreshold[j] != 0 {
				batch.Queue(isBonusSQL, row.ID, row.SetThreshold[j], row.SetSpellID[j])
				isBonusCount++
			}
		}

		// Insert set item membership from DBC ItemID array
		for _, itemID := range row.ItemID {
			if itemID != 0 {
				batch.Queue(isItemSQL, row.ID, itemID)
				isItemCount++
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
	_, _ = fmt.Fprintf(inv.Stderr, "imported dbc_item_set: %d sets, %d bonuses, %d items\n", isCount, isBonusCount, isItemCount)

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

// fixupMultiTierSets splits multi-tier item sets into synthetic per-tier sets.
// WotLK PvP sets share a single set_id across tiers (Savage, Hateful, Deadly, etc.).
// This creates synthetic dbc_item_set rows (negative IDs) for each tier and sets
// tooltip_set_id on world_item_template to point to the tier-specific row.
// The original set_id is left untouched for cross-tier eligibility.
func fixupMultiTierSets(ctx context.Context, pool *pgxpool.Pool, inv *serpent.Invocation) error {
	// Find sets where items have multiple distinct first-word prefixes.
	rows, err := pool.Query(ctx, `
		SELECT s.id, s.name_lang
		FROM dbc_item_set s
		JOIN world_item_template t ON t.set_id = s.id
		GROUP BY s.id, s.name_lang
		HAVING count(DISTINCT split_part(t.name, ' ', 1)) > 1`)
	if err != nil {
		return fmt.Errorf("querying multi-tier sets: %w", err)
	}

	type multiTierSet struct {
		id   int32
		name string
	}
	var multiSets []multiTierSet
	for rows.Next() {
		var s multiTierSet
		if err := rows.Scan(&s.id, &s.name); err != nil {
			rows.Close()
			return fmt.Errorf("scanning multi-tier set: %w", err)
		}
		multiSets = append(multiSets, s)
	}
	rows.Close()

	if len(multiSets) == 0 {
		_, _ = fmt.Fprintf(inv.Stderr, "fixup: no multi-tier sets found\n")
	}

	syntheticID := int32(-1)
	totalSynthetic := 0

	for _, ms := range multiSets {
		// Get items grouped by first-word prefix.
		itemRows, err := pool.Query(ctx, `
			SELECT entry, name, split_part(name, ' ', 1) as prefix
			FROM world_item_template WHERE set_id = $1
			ORDER BY name`, ms.id)
		if err != nil {
			return fmt.Errorf("querying items for set %d: %w", ms.id, err)
		}

		type itemInfo struct {
			entry int32
			name  string
		}
		groups := make(map[string][]itemInfo)
		for itemRows.Next() {
			var entry int32
			var name, prefix string
			if err := itemRows.Scan(&entry, &name, &prefix); err != nil {
				itemRows.Close()
				return fmt.Errorf("scanning item for set %d: %w", ms.id, err)
			}
			groups[prefix] = append(groups[prefix], itemInfo{entry: entry, name: name})
		}
		itemRows.Close()

		for prefix, items := range groups {
			// Derive tier-specific set name.
			tierName := prefix + " " + ms.name

			// Collect entry IDs.
			entryIDs := make([]int32, len(items))
			for i, item := range items {
				entryIDs[i] = item.entry
			}

			// Create synthetic dbc_item_set row.
			_, err := pool.Exec(ctx, `
				INSERT INTO dbc_item_set (id, name_lang, required_skill, required_skill_rank, item_ids)
				VALUES ($1, $2, 0, 0, $3)
				ON CONFLICT (id) DO UPDATE SET name_lang=EXCLUDED.name_lang, item_ids=EXCLUDED.item_ids`,
				syntheticID, tierName, entryIDs)
			if err != nil {
				return fmt.Errorf("inserting synthetic set for %q (set %d): %w", tierName, ms.id, err)
			}

			// Copy bonuses from original set.
			_, err = pool.Exec(ctx, `
				INSERT INTO dbc_item_set_bonus (set_id, threshold, spell_id)
				SELECT $1, threshold, spell_id FROM dbc_item_set_bonus WHERE set_id = $2
				ON CONFLICT (set_id, threshold, spell_id) DO NOTHING`,
				syntheticID, ms.id)
			if err != nil {
				return fmt.Errorf("copying bonuses for synthetic set %d: %w", syntheticID, err)
			}

			// Point items to synthetic set via tooltip_set_id.
			_, err = pool.Exec(ctx, `
				UPDATE world_item_template
				SET tooltip_set_id = $1
				WHERE entry = ANY($2)`, syntheticID, entryIDs)
			if err != nil {
				return fmt.Errorf("updating tooltip_set_id for synthetic set %d: %w", syntheticID, err)
			}

			totalSynthetic++
			syntheticID--
		}
	}

	// For single-tier sets (and any items not yet assigned), set tooltip_set_id = set_id.
	_, err = pool.Exec(ctx, `
		UPDATE world_item_template
		SET tooltip_set_id = set_id
		WHERE set_id != 0 AND tooltip_set_id = 0`)
	if err != nil {
		return fmt.Errorf("setting default tooltip_set_id: %w", err)
	}

	_, _ = fmt.Fprintf(inv.Stderr, "fixup: split %d multi-tier sets into %d synthetic sets\n",
		len(multiSets), totalSynthetic)
	return nil
}

func flushBatch(ctx context.Context, pool *pgxpool.Pool, batch *pgx.Batch) error {
	br := pool.SendBatch(ctx, batch)
	for i := 0; i < batch.Len(); i++ {
		if _, err := br.Exec(); err != nil {
			_ = br.Close()
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
