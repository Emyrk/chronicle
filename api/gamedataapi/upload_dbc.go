package gamedataapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Gophercraft/core/format/dbc"
	"github.com/Gophercraft/core/format/dbc/dbdefs"
	"github.com/Gophercraft/core/vsn"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const maxDBCFileSize = 50 * 1024 * 1024 // 50 MB

// knownBuilds lists builds to try when auto-detecting the DBC layout.
// Order: vanilla (1.12.x), TBC (2.4.3), WotLK (3.3.5a).
var knownBuilds = []vsn.Build{vsn.V1_12_1, vsn.V2_4_3, vsn.V3_3_5a}

func (h *Handler) UploadDBC(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	mode := r.URL.Query().Get("mode")
	if mode == "" {
		mode = "compare"
	}
	if mode != "compare" && mode != "upsert" && mode != "insert" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid mode, must be 'compare', 'upsert', or 'insert'",
		})
		return
	}

	// dataset_id selects which dataset to write into. Defaults to the
	// server's default dataset for backwards compatibility.
	datasetID, ok := datasetIDFromQuery(ctx, w, r)
	if !ok {
		return
	}

	file, header, err := r.FormFile("dbc_file")
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Failed to get dbc_file from form",
			Detail:  err.Error(),
		})
		return
	}
	defer func() { _ = file.Close() }()

	if header.Size > maxDBCFileSize {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: fmt.Sprintf("File too large (%d bytes), maximum is %d bytes", header.Size, maxDBCFileSize),
		})
		return
	}

	data, err := io.ReadAll(file)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Failed to read uploaded file",
			Detail:  err.Error(),
		})
		return
	}

	dbcType := r.URL.Query().Get("dbc_type")
	if dbcType == "" {
		dbcType = "ItemDisplayInfo" // backwards compat
	}

	// Determine which build(s) to use for parsing the DBC layout.
	// If the target dataset has a build_version, use that directly (and for
	// Spell.dbc, also try the extended layout variant at build+1).
	// Otherwise fall back to auto-detection across known builds.
	builds := knownBuilds
	var dsRow struct{ BuildVersion int32 }
	if err := h.pool.QueryRow(ctx,
		`SELECT build_version FROM datasets WHERE id = $1`, datasetID,
	).Scan(&dsRow.BuildVersion); err == nil && dsRow.BuildVersion > 0 {
		dsBuild := vsn.Build(dsRow.BuildVersion)
		if dbcType == "Spell" {
			// Also try the extended layout (build+1) used by
			// AzerothCore/Ascension for non-standard Spell columns.
			builds = []vsn.Build{dsBuild, vsn.Build(dsRow.BuildVersion + 1)}
		} else {
			builds = []vsn.Build{dsBuild}
		}
	}

	var table *dbc.Table
	var triedErrs []string
	for _, build := range builds {
		d := dbc.NewDB(build)
		t, err := d.Open(dbcType, bytes.NewReader(data))
		if err != nil {
			triedErrs = append(triedErrs, fmt.Sprintf("%s: %v", build, err))
			continue
		}
		// For Spell.dbc, validate the parse by checking a known spell.SpellBuildOverride
		// Renew (Rank 1) = ID 139 should exist in all WoW versions.
		if dbcType == "Spell" {
			spDBC := chrondbc.NewSpells(t)
			sp, spErr := spDBC.ID(139)
			if spErr != nil {
				triedErrs = append(triedErrs, fmt.Sprintf("%s: spell 139 lookup failed: %v", build, spErr))
				continue
			}
			if !strings.Contains(strings.ToLower(sp.Name()), "renew") {
				triedErrs = append(triedErrs, fmt.Sprintf("%s: spell 139 expected 'Renew', got name=%q subtext=%q", build, sp.Name(), sp.Subtext()))
				continue
			}
		}
		table = t
		break
	}
	if table == nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: fmt.Sprintf("Failed to parse DBC file as %s", dbcType),
			Detail:  strings.Join(triedErrs, "; "),
		})
		return
	}

	switch dbcType {
	case "ItemDisplayInfo":
		h.handleItemDisplayInfoUpload(ctx, w, mode, table, datasetID)
	case "SpellItemEnchantment":
		h.handleSpellItemEnchantmentUpload(ctx, w, mode, table, datasetID)
	case "ItemRandomProperties":
		h.handleItemRandomPropertiesUpload(ctx, w, mode, table, datasetID)
	case "ItemSet":
		h.handleItemSetUpload(ctx, w, mode, table, datasetID)
	case "Spell":
		h.handleSpellUpload(ctx, w, mode, table, datasetID)
	case "SpellCastTimes":
		h.handleSpellCastTimesUpload(ctx, w, mode, table, datasetID)
	case "SpellDuration":
		h.handleSpellDurationsUpload(ctx, w, mode, table, datasetID)
	case "SpellRange":
		h.handleSpellRangesUpload(ctx, w, mode, table, datasetID)
	case "SpellIcon":
		h.handleSpellIconsUpload(ctx, w, mode, table, datasetID)
	case "SpellCategory":
		h.handleSpellCategoriesUpload(ctx, w, mode, table, datasetID)
	case "SpellRadius":
		h.handleSpellRadiiUpload(ctx, w, mode, table, datasetID)
	case "SpellFocusObject":
		h.handleSpellFocusObjectsUpload(ctx, w, mode, table, datasetID)
	default:
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: fmt.Sprintf("Unsupported DBC type: %s", dbcType),
		})
	}
}

func (h *Handler) handleItemDisplayInfoUpload(ctx context.Context, w http.ResponseWriter, mode string, table *dbc.Table, datasetID uuid.UUID) {
	var rows []dbdefs.Ent_ItemDisplayInfo
	var x dbdefs.Ent_ItemDisplayInfo
	_ = table.ID(50182, &x)
	err := table.Range(func(cursor *dbdefs.Ent_ItemDisplayInfo) bool {
		// Copy the struct so we own the data.
		rows = append(rows, *cursor)
		return true
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to iterate DBC rows",
			Detail:  err.Error(),
		})
		return
	}

	resp := chroniclesdk.DBCUploadResponse{
		DBCName:     "ItemDisplayInfo",
		RecordCount: len(rows),
		Mode:        mode,
	}

	if mode == "compare" {
		// Just count — no DB writes.
		resp.Inserted = len(rows)
		httpapi.Write(ctx, w, http.StatusOK, resp)
		return
	}

	// Batch upsert into dbc_item_display_info and world_display_info.
	const batchSize = 500

	const idiSQL = `INSERT INTO dbc_item_display_info (
			id, model_name, model_texture, geoset_group, flags, spell_visual_id,
			helmet_geoset_vis, texture, item_visual, particle_color_id,
			attachment_geoset_group, item_ranged_display_info_id,
			model_material_resources_id, model_resources_id, model_type_1,
			override_swoosh_sound_kit_id, sheathe_transform_matrix_id,
			sheathed_spell_visual_kit_id, state_spell_visual_kit_id,
			unsheathed_spell_visual_kit_id, inventory_icon, group_sound_index,
			ground_model, item_size, helmet_geoset_vis_id, dataset_id
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
		ON CONFLICT (dataset_id, id) DO UPDATE SET
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

	const wdiSQL = `INSERT INTO world_display_info (id, icon, dataset_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (dataset_id, id) DO UPDATE SET icon=EXCLUDED.icon`

	batch := &pgx.Batch{}
	for _, row := range rows {
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
			datasetID,
		)

		// Also populate world_display_info with the first inventory icon.
		icon := ""
		if len(row.InventoryIcon) > 0 {
			icon = row.InventoryIcon[0]
		}
		batch.Queue(wdiSQL, row.ID, icon, datasetID)

		if batch.Len() >= batchSize {
			if err := flushBatch(ctx, h.pool, batch); err != nil {
				httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
					Message: "Failed to write batch",
					Detail:  err.Error(),
				})
				return
			}
			batch = &pgx.Batch{}
		}
	}
	if batch.Len() > 0 {
		if err := flushBatch(ctx, h.pool, batch); err != nil {
			httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
				Message: "Failed to write final batch",
				Detail:  err.Error(),
			})
			return
		}
	}

	resp.Inserted = len(rows) // Simplified — upsert doesn't distinguish insert vs update here.
	httpapi.Write(ctx, w, http.StatusOK, resp)
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
func (h *Handler) handleSpellItemEnchantmentUpload(ctx context.Context, w http.ResponseWriter, mode string, table *dbc.Table, datasetID uuid.UUID) {
	var rows []dbdefs.Ent_SpellItemEnchantment
	err := table.Range(func(cursor *dbdefs.Ent_SpellItemEnchantment) bool {
		rows = append(rows, *cursor)
		return true
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to iterate DBC rows",
			Detail:  err.Error(),
		})
		return
	}

	resp := chroniclesdk.DBCUploadResponse{
		DBCName:     "SpellItemEnchantment",
		RecordCount: len(rows),
		Mode:        mode,
	}

	if mode == "compare" {
		resp.Inserted = len(rows)
		httpapi.Write(ctx, w, http.StatusOK, resp)
		return
	}

	const batchSize = 500

	const sieSQL = `INSERT INTO dbc_spell_item_enchantment (
			id, charges, effect_1, effect_2, effect_3,
			effect_points_min_1, effect_points_min_2, effect_points_min_3,
			effect_arg_1, effect_arg_2, effect_arg_3,
			name_lang, item_visual, flags, src_item_id,
			condition_id, required_skill_id, required_skill_rank,
			min_level, max_level, dataset_id
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
		ON CONFLICT (dataset_id, id) DO UPDATE SET
			charges=EXCLUDED.charges,
			effect_1=EXCLUDED.effect_1, effect_2=EXCLUDED.effect_2, effect_3=EXCLUDED.effect_3,
			effect_points_min_1=EXCLUDED.effect_points_min_1, effect_points_min_2=EXCLUDED.effect_points_min_2,
			effect_points_min_3=EXCLUDED.effect_points_min_3,
			effect_arg_1=EXCLUDED.effect_arg_1, effect_arg_2=EXCLUDED.effect_arg_2, effect_arg_3=EXCLUDED.effect_arg_3,
			name_lang=EXCLUDED.name_lang, item_visual=EXCLUDED.item_visual, flags=EXCLUDED.flags,
			src_item_id=EXCLUDED.src_item_id, condition_id=EXCLUDED.condition_id,
			required_skill_id=EXCLUDED.required_skill_id, required_skill_rank=EXCLUDED.required_skill_rank,
			min_level=EXCLUDED.min_level, max_level=EXCLUDED.max_level`

	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(sieSQL,
			row.ID, row.Charges,
			int32At(row.Effect, 0), int32At(row.Effect, 1), int32At(row.Effect, 2),
			int32At(row.EffectPointsMin, 0), int32At(row.EffectPointsMin, 1), int32At(row.EffectPointsMin, 2),
			int32At(row.EffectArg, 0), int32At(row.EffectArg, 1), int32At(row.EffectArg, 2),
			row.Name_lang.String(), row.ItemVisual, row.Flags, row.Src_itemID,
			row.Condition_ID, row.RequiredSkillID, row.RequiredSkillRank,
			row.MinLevel, row.MaxLevel,
			datasetID,
		)

		if batch.Len() >= batchSize {
			if err := flushBatch(ctx, h.pool, batch); err != nil {
				httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
					Message: "Failed to write batch",
					Detail:  err.Error(),
				})
				return
			}
			batch = &pgx.Batch{}
		}
	}
	if batch.Len() > 0 {
		if err := flushBatch(ctx, h.pool, batch); err != nil {
			httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
				Message: "Failed to write final batch",
				Detail:  err.Error(),
			})
			return
		}
	}

	resp.Inserted = len(rows)
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func (h *Handler) handleItemRandomPropertiesUpload(ctx context.Context, w http.ResponseWriter, mode string, table *dbc.Table, datasetID uuid.UUID) {
	var rows []dbdefs.Ent_ItemRandomProperties
	err := table.Range(func(cursor *dbdefs.Ent_ItemRandomProperties) bool {
		rows = append(rows, *cursor)
		return true
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to iterate DBC rows",
			Detail:  err.Error(),
		})
		return
	}

	resp := chroniclesdk.DBCUploadResponse{
		DBCName:     "ItemRandomProperties",
		RecordCount: len(rows),
		Mode:        mode,
	}

	if mode == "compare" {
		resp.Inserted = len(rows)
		httpapi.Write(ctx, w, http.StatusOK, resp)
		return
	}

	const batchSize = 500
	const irpSQL = `INSERT INTO dbc_item_random_properties (
			id, name, name_lang, enchantment_1, enchantment_2, enchantment_3, enchantment_4, enchantment_5, dataset_id
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		ON CONFLICT (dataset_id, id) DO UPDATE SET
			name=EXCLUDED.name, name_lang=EXCLUDED.name_lang,
			enchantment_1=EXCLUDED.enchantment_1, enchantment_2=EXCLUDED.enchantment_2,
			enchantment_3=EXCLUDED.enchantment_3, enchantment_4=EXCLUDED.enchantment_4,
			enchantment_5=EXCLUDED.enchantment_5`

	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(irpSQL,
			row.ID, row.Name, row.Name_lang.String(),
			int32At(row.Enchantment, 0), int32At(row.Enchantment, 1),
			int32At(row.Enchantment, 2), int32At(row.Enchantment, 3),
			int32At(row.Enchantment, 4),
			datasetID,
		)
		if batch.Len() >= batchSize {
			if err := flushBatch(ctx, h.pool, batch); err != nil {
				httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
					Message: "Failed to write batch",
					Detail:  err.Error(),
				})
				return
			}
			batch = &pgx.Batch{}
		}
	}
	if batch.Len() > 0 {
		if err := flushBatch(ctx, h.pool, batch); err != nil {
			httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
				Message: "Failed to write final batch",
				Detail:  err.Error(),
			})
			return
		}
	}

	resp.Inserted = len(rows)
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func (h *Handler) handleItemSetUpload(ctx context.Context, w http.ResponseWriter, mode string, table *dbc.Table, datasetID uuid.UUID) {
	var rows []dbdefs.Ent_ItemSet
	err := table.Range(func(cursor *dbdefs.Ent_ItemSet) bool {
		rows = append(rows, *cursor)
		return true
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to iterate DBC rows",
			Detail:  err.Error(),
		})
		return
	}

	resp := chroniclesdk.DBCUploadResponse{
		DBCName:     "ItemSet",
		RecordCount: len(rows),
		Mode:        mode,
	}

	if mode == "compare" {
		resp.Inserted = len(rows)
		httpapi.Write(ctx, w, http.StatusOK, resp)
		return
	}

	const batchSize = 500

	// 1. Upsert dbc_item_set (set metadata)
	const setSQL = `INSERT INTO dbc_item_set (id, name_lang, required_skill, required_skill_rank, dataset_id)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (dataset_id, id) DO UPDATE SET
			name_lang=EXCLUDED.name_lang,
			required_skill=EXCLUDED.required_skill,
			required_skill_rank=EXCLUDED.required_skill_rank`

	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(setSQL, row.ID, row.Name_lang.String(), row.RequiredSkill, row.RequiredSkillRank, datasetID)
		if batch.Len() >= batchSize {
			if err := flushBatch(ctx, h.pool, batch); err != nil {
				httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
					Message: "Failed to write item set batch",
					Detail:  err.Error(),
				})
				return
			}
			batch = &pgx.Batch{}
		}
	}
	if batch.Len() > 0 {
		if err := flushBatch(ctx, h.pool, batch); err != nil {
			httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
				Message: "Failed to write item set final batch",
				Detail:  err.Error(),
			})
			return
		}
	}

	// 2. Upsert dbc_item_set_bonus (set bonus spells)
	const bonusSQL = `INSERT INTO dbc_item_set_bonus (set_id, threshold, spell_id, dataset_id)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (dataset_id, set_id, threshold, spell_id) DO NOTHING`

	batch = &pgx.Batch{}
	for _, row := range rows {
		for i := range row.SetSpellID {
			if i >= len(row.SetThreshold) {
				break
			}
			spellID := row.SetSpellID[i]
			threshold := row.SetThreshold[i]
			if spellID == 0 || threshold == 0 {
				continue
			}
			batch.Queue(bonusSQL, row.ID, threshold, spellID, datasetID)
			if batch.Len() >= batchSize {
				if err := flushBatch(ctx, h.pool, batch); err != nil {
					httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
						Message: "Failed to write set bonus batch",
						Detail:  err.Error(),
					})
					return
				}
				batch = &pgx.Batch{}
			}
		}
	}
	if batch.Len() > 0 {
		if err := flushBatch(ctx, h.pool, batch); err != nil {
			httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
				Message: "Failed to write set bonus final batch",
				Detail:  err.Error(),
			})
			return
		}
	}

	// 3. Upsert dbc_item_set_item (set membership)
	const itemSQL = `INSERT INTO dbc_item_set_item (set_id, item_entry, dataset_id)
		VALUES ($1,$2,$3)
		ON CONFLICT (dataset_id, set_id, item_entry) DO NOTHING`

	batch = &pgx.Batch{}
	for _, row := range rows {
		for _, itemID := range row.ItemID {
			if itemID == 0 {
				continue
			}
			batch.Queue(itemSQL, row.ID, itemID, datasetID)
			if batch.Len() >= batchSize {
				if err := flushBatch(ctx, h.pool, batch); err != nil {
					httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
						Message: "Failed to write set item batch",
						Detail:  err.Error(),
					})
					return
				}
				batch = &pgx.Batch{}
			}
		}
	}
	if batch.Len() > 0 {
		if err := flushBatch(ctx, h.pool, batch); err != nil {
			httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
				Message: "Failed to write set item final batch",
				Detail:  err.Error(),
			})
			return
		}
	}

	resp.Inserted = len(rows)
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

// int32At safely indexes an int32 slice, returning 0 if out of bounds.
func int32At(s []int32, i int) int32 {
	if i < len(s) {
		return s[i]
	}
	return 0
}
