package gamedataapi

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/wdb"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func (h *Handler) handleItemUpload(ctx context.Context, w http.ResponseWriter, mode string, wdbHeader wdb.Header, records []wdb.Record, datasetID uuid.UUID) {
	// Parse all records.
	items := make([]wdb.Item, 0, len(records))
	for _, rec := range records {
		item, err := wdb.ParseItem(rec, wdbHeader.Version)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: fmt.Sprintf("Failed to parse item entry %d", rec.EntryID),
				Detail:  err.Error(),
			})
			return
		}
		items = append(items, item)
	}

	// Batch-fetch existing rows from DB.
	entries := make([]int32, len(items))
	for i, it := range items {
		entries[i] = int32(it.Entry)
	}
	existingRows, err := h.zed.GetItemTemplatesByEntries(ctx, database.GetItemTemplatesByEntriesParams{DatasetID: datasetID, Entries: entries})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to fetch existing items from database",
			Detail:  err.Error(),
		})
		return
	}
	existingByEntry := make(map[int32]database.WorldItemTemplate, len(existingRows))
	for _, row := range existingRows {
		existingByEntry[row.Entry] = row
	}

	// Compare each WDB item against DB.
	var (
		diffs     []chroniclesdk.WDBItemDiff
		newCount  int
		changed   int
		unchanged int
	)
	var toUpsert []database.WorldItemTemplate

	for _, item := range items {
		wdbRow := wdb.ItemToWorldTemplate(item)
		dbRow, exists := existingByEntry[int32(item.Entry)]

		if !exists {
			newCount++
			diffs = append(diffs, chroniclesdk.WDBItemDiff{
				Entry:  int32(item.Entry),
				Name:   item.Name,
				Status: "new",
			})
			if mode == "upsert" || mode == "insert" {
				toUpsert = append(toUpsert, wdbRow)
			}
			continue
		}

		fieldDiffs := wdb.CompareItems(wdbRow, dbRow)
		if len(fieldDiffs) == 0 {
			unchanged++
			continue
		}

		// Check if any reliable (non-unreliable) fields changed.
		hasReliableDiff := false
		for _, fd := range fieldDiffs {
			if !fd.Unreliable {
				hasReliableDiff = true
				break
			}
		}
		if !hasReliableDiff {
			unchanged++
		} else {
			changed++
		}
		sdkFields := make([]chroniclesdk.WDBFieldDiff, len(fieldDiffs))
		for i, fd := range fieldDiffs {
			sdkFields[i] = chroniclesdk.WDBFieldDiff{
				Field:      fd.Field,
				Old:        fd.Old,
				New:        fd.New,
				Unreliable: fd.Unreliable,
			}
		}
		status := "changed"
		if !hasReliableDiff {
			status = "unchanged"
		}
		diffs = append(diffs, chroniclesdk.WDBItemDiff{
			Entry:  int32(item.Entry),
			Name:   item.Name,
			Status: status,
			Fields: sdkFields,
		})
		if mode == "upsert" && hasReliableDiff {
			toUpsert = append(toUpsert, wdbRow)
		}
	}

	// Perform upserts if requested.
	if (mode == "upsert" || mode == "insert") && len(toUpsert) > 0 {
		if err := upsertItems(ctx, h.pool, datasetID, toUpsert); err != nil {
			httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
				Message: "Failed to upsert items",
				Detail:  err.Error(),
			})
			return
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.WDBUploadResponse{
		Signature:   wdbHeader.Signature.String(),
		Version:     wdbHeader.Version,
		RecordCount: len(records),
		Mode:        mode,
		NewItems:    newCount,
		Changed:     changed,
		Unchanged:   unchanged,
		Diffs:       diffs,
	})
}

// wdbUpsertColumns are the columns set from WDB data during upsert.
// Server-only columns (buy_count, spellppmrate_*, disenchant_id, food_type,
// min/max_money_loot, wrapped_gift, extra_flags, other_team_entry,
// script_name, patch) are intentionally excluded to avoid clobbering.
var wdbUpsertColumns = []string{
	"dataset_id", "entry", "class", "subclass", "name", "description", "display_id",
	"quality", "flags", "buy_price", "sell_price",
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
	"block", "armor", "holy_res", "fire_res", "nature_res",
	"frost_res", "shadow_res", "arcane_res",
	"spellid_1", "spellid_2", "spellid_3", "spellid_4", "spellid_5",
	"bonding", "page_text", "page_language", "page_material",
	"start_quest", "lock_id", "material", "sheath", "random_property",
	"set_id", "max_durability", "area_bound", "map_bound", "duration",
	"bag_family", "totem_category",
	"socket_color_1", "socket_content_1",
	"socket_color_2", "socket_content_2",
	"socket_color_3", "socket_content_3",
	"socket_bonus", "gem_properties",
	"required_disenchant_skill", "armor_damage_modifier",
	"scaling_stat_distribution", "scaling_stat_value",
	"item_limit_category", "holiday_id", "random_suffix",
}

var upsertItemSQL string

func init() {
	placeholders := make([]string, len(wdbUpsertColumns))
	for i := range wdbUpsertColumns {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
	}

	var setClauses []string
	for _, col := range wdbUpsertColumns[2:] { // skip "dataset_id" and "entry" (composite PK)
		setClauses = append(setClauses, fmt.Sprintf("%s = EXCLUDED.%s", col, col))
	}

	upsertItemSQL = fmt.Sprintf(
		"INSERT INTO world_item_template (%s) VALUES (%s) ON CONFLICT (dataset_id, entry) DO UPDATE SET %s",
		strings.Join(wdbUpsertColumns, ", "),
		strings.Join(placeholders, ", "),
		strings.Join(setClauses, ", "),
	)
}

// rowArgs returns the parameter values for a WorldItemTemplate in the same
// order as wdbUpsertColumns.
func itemRowArgs(datasetID uuid.UUID, r database.WorldItemTemplate) []any {
	return []any{
		datasetID,
		r.Entry, r.Class, r.Subclass, r.Name, r.Description, r.DisplayID,
		r.Quality, r.Flags, r.BuyPrice, r.SellPrice,
		r.InventoryType, r.AllowableClass, r.AllowableRace, r.ItemLevel,
		r.RequiredLevel, r.RequiredSkill, r.RequiredSkillRank,
		r.RequiredSpell, r.RequiredHonorRank, r.RequiredCityRank,
		r.RequiredReputationFaction, r.RequiredReputationRank,
		r.MaxCount, r.Stackable, r.ContainerSlots,
		r.StatType1, r.StatValue1, r.StatType2, r.StatValue2,
		r.StatType3, r.StatValue3, r.StatType4, r.StatValue4,
		r.StatType5, r.StatValue5, r.StatType6, r.StatValue6,
		r.StatType7, r.StatValue7, r.StatType8, r.StatValue8,
		r.StatType9, r.StatValue9, r.StatType10, r.StatValue10,
		r.Delay, r.RangeMod, r.AmmoType,
		r.DmgMin1, r.DmgMax1, r.DmgType1,
		r.DmgMin2, r.DmgMax2, r.DmgType2,
		r.Block, r.Armor, r.HolyRes, r.FireRes, r.NatureRes,
		r.FrostRes, r.ShadowRes, r.ArcaneRes,
		r.Spellid1, r.Spellid2, r.Spellid3, r.Spellid4, r.Spellid5,
		r.Bonding, r.PageText, r.PageLanguage, r.PageMaterial,
		r.StartQuest, r.LockID, r.Material, r.Sheath, r.RandomProperty,
		r.SetID, r.MaxDurability, r.AreaBound, r.MapBound, r.Duration,
		r.BagFamily, r.TotemCategory,
		r.SocketColor1, r.SocketContent1,
		r.SocketColor2, r.SocketContent2,
		r.SocketColor3, r.SocketContent3,
		r.SocketBonus, r.GemProperties,
		r.RequiredDisenchantSkill, r.ArmorDamageModifier,
		r.ScalingStatDistribution, r.ScalingStatValue,
		r.ItemLimitCategory, r.HolidayID, r.RandomSuffix,
	}
}

// upsertItems batch-upserts WorldItemTemplate rows using pgx batch.
func upsertItems(ctx context.Context, pool *pgxpool.Pool, datasetID uuid.UUID, rows []database.WorldItemTemplate) error {
	const batchSize = 500
	for i := 0; i < len(rows); i += batchSize {
		end := min(i+batchSize, len(rows))
		batch := &pgx.Batch{}
		for _, r := range rows[i:end] {
			batch.Queue(upsertItemSQL, itemRowArgs(datasetID, r)...)
		}
		br := pool.SendBatch(ctx, batch)
		for range rows[i:end] {
			if _, err := br.Exec(); err != nil {
				_ = br.Close()
				return fmt.Errorf("upsert item batch: %w", err)
			}
		}
		if err := br.Close(); err != nil {
			return fmt.Errorf("close batch: %w", err)
		}
	}
	return nil
}
