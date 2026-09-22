package gamedataapi

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/Emyrk/chronicle/internal/wowdata"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const maxWowdataCompressedSize = 128 * 1024 * 1024
const maxWowdataJSONSize = 512 * 1024 * 1024

// UploadWowdataSnapshot persists a converted modern-DB2 snapshot. Conversion is
// deliberately performed by dbcdata so this endpoint never treats JSONL as a
// legacy DBC and can return the converter's explicit loss report.
func (h *Handler) UploadWowdataSnapshot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	datasetID, err := uuid.Parse(chi.URLParam(r, "datasetID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid datasetID", Detail: err.Error()})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxWowdataCompressedSize)
	var reader io.Reader = r.Body
	if r.Header.Get("Content-Encoding") == "gzip" {
		gz, err := gzip.NewReader(r.Body)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid gzip body", Detail: err.Error()})
			return
		}
		defer func() { _ = gz.Close() }()
		reader = gz
	} else if r.Header.Get("Content-Encoding") != "" {
		httpapi.Write(ctx, w, http.StatusUnsupportedMediaType, chroniclesdk.Response{Message: "Content-Encoding must be gzip or empty"})
		return
	}
	var payload wowdata.Import
	dec := json.NewDecoder(io.LimitReader(reader, maxWowdataJSONSize+1))
	if err := dec.Decode(&payload); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Failed to decode wowdata snapshot", Detail: err.Error()})
		return
	}
	if payload.Format != wowdata.SnapshotFormat || payload.Product == "" || payload.Build == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid wowdata snapshot metadata"})
		return
	}
	if err := h.persistWowdata(ctx, datasetID, &payload); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.Response{
		Message: fmt.Sprintf(
			"wowdata snapshot imported: %s %s (%d spells, %d items, %d enchantments, %d item sets)",
			payload.Product, payload.Build, len(payload.Spells), len(payload.Items), len(payload.Enchantments), len(payload.ItemSets),
		),
	})
}

func (h *Handler) persistWowdata(ctx context.Context, datasetID uuid.UUID, p *wowdata.Import) error {
	const batchSize = 500
	for i := range p.Spells {
		p.Spells[i].DatasetID = datasetID
	}
	for i := 0; i < len(p.Spells); i += batchSize {
		end := min(i+batchSize, len(p.Spells))
		if err := spelldb.UpsertBatch(ctx, h.pool, p.Spells[i:end]); err != nil {
			return fmt.Errorf("upsert spells at %d: %w", i, err)
		}
	}
	for i := range p.Items {
		p.Items[i].DatasetID = datasetID
	}
	if err := upsertItems(ctx, h.pool, datasetID, p.Items); err != nil {
		return err
	}
	if err := h.upsertWowdataMetadata(ctx, datasetID, p); err != nil {
		return err
	}
	if err := h.upsertWowdataEnchantments(ctx, datasetID, p.Enchantments); err != nil {
		return err
	}
	if err := h.upsertWowdataItemSets(ctx, datasetID, p.ItemSets); err != nil {
		return err
	}
	if len(p.TalentTrees) > 0 {
		if err := h.zed.UpsertDatasetTalentTrees(ctx, database.UpsertDatasetTalentTreesParams{DatasetID: datasetID, Data: p.TalentTrees}); err != nil {
			return fmt.Errorf("upsert talent trees: %w", err)
		}
	}
	if _, err := h.pool.Exec(ctx, `UPDATE datasets SET spells_imported_at=now(), spells_count=$2, updated_at=now() WHERE id=$1`, datasetID, len(p.Spells)); err != nil {
		return fmt.Errorf("update dataset metadata: %w", err)
	}
	if err := h.deriveAffectedAuraDurations(ctx, datasetID); err != nil {
		return fmt.Errorf("derive affected aura durations: %w", err)
	}
	if err := h.deriveConsumables(ctx, datasetID); err != nil {
		return fmt.Errorf("derive consumables: %w", err)
	}
	if h.wowDB != nil {
		h.wowDB.InvalidateSpellCache(datasetID)
		h.wowDB.InvalidateExtraAttacks(datasetID)
		h.wowDB.InvalidateDurationModifiers(datasetID)
		h.wowDB.InvalidatePeriodicSpells(datasetID)
	}
	return nil
}

func (h *Handler) upsertWowdataMetadata(ctx context.Context, datasetID uuid.UUID, p *wowdata.Import) error {
	statements := []struct {
		clear, insert string
		rows          [][]any
	}{
		{`DELETE FROM dbc_spell_cast_times WHERE dataset_id=$1`, `INSERT INTO dbc_spell_cast_times(dataset_id,id,base,per_level,minimum) VALUES($1,$2,$3,0,$4)`, mapRows(p.SpellCastTimes, func(x wowdata.SpellCastTime) []any { return []any{x.ID, x.Base, x.Minimum} })},
		{`DELETE FROM dbc_spell_durations WHERE dataset_id=$1`, `INSERT INTO dbc_spell_durations(dataset_id,id,duration,duration_per_level,max_duration) VALUES($1,$2,$3,0,$4)`, mapRows(p.SpellDurations, func(x wowdata.SpellDuration) []any { return []any{x.ID, x.Duration, x.MaxDuration} })},
		{`DELETE FROM dbc_spell_ranges WHERE dataset_id=$1`, `INSERT INTO dbc_spell_ranges(dataset_id,id,range_min,range_max,flags,name) VALUES($1,$2,$3,$4,$5,$6)`, mapRows(p.SpellRanges, func(x wowdata.SpellRange) []any { return []any{x.ID, x.RangeMin, x.RangeMax, x.Flags, x.Name} })},
		{`DELETE FROM dbc_spell_categories WHERE dataset_id=$1`, `INSERT INTO dbc_spell_categories(dataset_id,id,flags,uses_per_week,name,max_charges,charge_recovery_time,type_mask) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, mapRows(p.SpellCategories, func(x wowdata.SpellCategory) []any {
			return []any{x.ID, x.Flags, x.UsesPerWeek, x.Name, x.MaxCharges, x.ChargeRecoveryTime, x.TypeMask}
		})},
		{`DELETE FROM dbc_spell_radii WHERE dataset_id=$1`, `INSERT INTO dbc_spell_radii(dataset_id,id,radius,radius_per_level,radius_min,radius_max) VALUES($1,$2,$3,$4,$5,$6)`, mapRows(p.SpellRadii, func(x wowdata.SpellRadius) []any {
			return []any{x.ID, x.Radius, x.RadiusPerLevel, x.RadiusMin, x.RadiusMax}
		})},
		{`DELETE FROM dbc_spell_focus_objects WHERE dataset_id=$1`, `INSERT INTO dbc_spell_focus_objects(dataset_id,id,name) VALUES($1,$2,$3)`, mapRows(p.SpellFocusObjects, func(x wowdata.SpellFocusObject) []any { return []any{x.ID, x.Name} })},
		{`DELETE FROM dbc_spell_description_variables WHERE dataset_id=$1`, `INSERT INTO dbc_spell_description_variables(dataset_id,id,variables) VALUES($1,$2,$3)`, mapRows(p.SpellDescriptionVariables, func(x wowdata.SpellDescriptionVariables) []any { return []any{x.ID, x.Variables} })},
	}
	for _, s := range statements {
		if _, err := h.pool.Exec(ctx, s.clear, datasetID); err != nil {
			return err
		}
		if err := batchRows(ctx, h, datasetID, s.insert, s.rows); err != nil {
			return err
		}
	}
	return nil
}
func mapRows[T any](in []T, fn func(T) []any) [][]any {
	out := make([][]any, 0, len(in))
	for _, x := range in {
		out = append(out, fn(x))
	}
	return out
}
func batchRows(ctx context.Context, h *Handler, datasetID uuid.UUID, sql string, rows [][]any) error {
	batch := &pgx.Batch{}
	for _, row := range rows {
		args := append([]any{datasetID}, row...)
		batch.Queue(sql, args...)
		if batch.Len() >= 500 {
			if err := flushBatch(ctx, h.pool, batch); err != nil {
				return err
			}
			batch = &pgx.Batch{}
		}
	}
	if batch.Len() > 0 {
		return flushBatch(ctx, h.pool, batch)
	}
	return nil
}

func (h *Handler) upsertWowdataEnchantments(ctx context.Context, datasetID uuid.UUID, rows []wowdata.Enchantment) error {
	const sql = `INSERT INTO dbc_spell_item_enchantment(id,charges,effect_1,effect_2,effect_3,effect_points_min_1,effect_points_min_2,effect_points_min_3,effect_arg_1,effect_arg_2,effect_arg_3,name_lang,item_visual,flags,src_item_id,condition_id,required_skill_id,required_skill_rank,min_level,max_level,dataset_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,0,0,$15,$16,$17,$18,$19) ON CONFLICT(dataset_id,id) DO UPDATE SET charges=EXCLUDED.charges,effect_1=EXCLUDED.effect_1,effect_2=EXCLUDED.effect_2,effect_3=EXCLUDED.effect_3,effect_points_min_1=EXCLUDED.effect_points_min_1,effect_points_min_2=EXCLUDED.effect_points_min_2,effect_points_min_3=EXCLUDED.effect_points_min_3,effect_arg_1=EXCLUDED.effect_arg_1,effect_arg_2=EXCLUDED.effect_arg_2,effect_arg_3=EXCLUDED.effect_arg_3,name_lang=EXCLUDED.name_lang,item_visual=EXCLUDED.item_visual,flags=EXCLUDED.flags,required_skill_id=EXCLUDED.required_skill_id,required_skill_rank=EXCLUDED.required_skill_rank,min_level=EXCLUDED.min_level,max_level=EXCLUDED.max_level`
	b := &pgx.Batch{}
	for _, x := range rows {
		b.Queue(sql, x.ID, x.Charges, x.Effect[0], x.Effect[1], x.Effect[2], x.EffectPointsMin[0], x.EffectPointsMin[1], x.EffectPointsMin[2], x.EffectArg[0], x.EffectArg[1], x.EffectArg[2], x.Name, x.ItemVisual, x.Flags, x.RequiredSkillID, x.RequiredSkillRank, x.MinLevel, x.MaxLevel, datasetID)
		if b.Len() >= 500 {
			if err := flushBatch(ctx, h.pool, b); err != nil {
				return err
			}
			b = &pgx.Batch{}
		}
	}
	if b.Len() > 0 {
		return flushBatch(ctx, h.pool, b)
	}
	return nil
}
func (h *Handler) upsertWowdataItemSets(ctx context.Context, datasetID uuid.UUID, rows []wowdata.ItemSet) error {
	setSQL := `INSERT INTO dbc_item_set(id,name_lang,required_skill,required_skill_rank,item_ids,dataset_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(dataset_id,id) DO UPDATE SET name_lang=EXCLUDED.name_lang,required_skill=EXCLUDED.required_skill,required_skill_rank=EXCLUDED.required_skill_rank,item_ids=EXCLUDED.item_ids`
	itemSQL := `INSERT INTO dbc_item_set_item(set_id,item_entry,dataset_id) VALUES($1,$2,$3) ON CONFLICT(dataset_id,set_id,item_entry) DO NOTHING`
	if _, err := h.pool.Exec(ctx, `DELETE FROM dbc_item_set_item WHERE dataset_id=$1`, datasetID); err != nil {
		return err
	}
	b := &pgx.Batch{}
	for _, x := range rows {
		b.Queue(setSQL, x.ID, x.Name, x.RequiredSkill, x.RequiredSkillRank, nonNilItemIDs(x.ItemIDs), datasetID)
		for _, item := range x.ItemIDs {
			b.Queue(itemSQL, x.ID, item, datasetID)
		}
		if b.Len() >= 500 {
			if err := flushBatch(ctx, h.pool, b); err != nil {
				return err
			}
			b = &pgx.Batch{}
		}
	}
	if b.Len() > 0 {
		return flushBatch(ctx, h.pool, b)
	}
	return nil
}

func nonNilItemIDs(itemIDs []int32) []int32 {
	if itemIDs == nil {
		return []int32{}
	}
	return itemIDs
}
