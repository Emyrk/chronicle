package gamedataapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Gophercraft/core/format/dbc"
	"github.com/Gophercraft/core/format/dbc/dbdefs"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// cutIconPrefix strips the "Interface\Icons\" DBC path prefix case-insensitively.
func (h *Handler) handleSpellDescriptionVariablesUpload(ctx context.Context, w http.ResponseWriter, mode string, table *dbc.Table, datasetID uuid.UUID) {
	var rows []dbdefs.Ent_SpellDescriptionVariables
	err := table.Range(func(cursor *dbdefs.Ent_SpellDescriptionVariables) bool {
		rows = append(rows, *cursor)
		return true
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to iterate SpellDescriptionVariables.dbc rows",
			Detail:  err.Error(),
		})
		return
	}

	resp := chroniclesdk.DBCUploadResponse{
		DBCName:     "SpellDescriptionVariables",
		RecordCount: len(rows),
		Mode:        mode,
	}
	if mode == "compare" {
		resp.Inserted = len(rows)
		httpapi.Write(ctx, w, http.StatusOK, resp)
		return
	}

	if _, err := h.pool.Exec(ctx, `DELETE FROM dbc_spell_description_variables WHERE dataset_id = $1`, datasetID); err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to clear existing description variables",
			Detail:  err.Error(),
		})
		return
	}

	const batchSize = 500
	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(`INSERT INTO dbc_spell_description_variables (dataset_id, id, variables) VALUES ($1,$2,$3)`,
			datasetID, row.ID, row.Variables,
		)
		if batch.Len() >= batchSize {
			if err := flushBatch(ctx, h.pool, batch); err != nil {
				httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
					Message: "Failed to insert description variables",
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
				Message: "Failed to insert description variables (final batch)",
				Detail:  err.Error(),
			})
			return
		}
	}

	resp.Inserted = len(rows)
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func cutIconPrefix(s string) string {
	const prefix = `Interface\Icons\`
	if len(s) >= len(prefix) && strings.EqualFold(s[:len(prefix)], prefix) {
		return s[len(prefix):]
	}
	return s
}

func (h *Handler) handleSpellCastTimesUpload(ctx context.Context, w http.ResponseWriter, mode string, table *dbc.Table, datasetID uuid.UUID) {
	var rows []dbdefs.Ent_SpellCastTimes
	err := table.Range(func(cursor *dbdefs.Ent_SpellCastTimes) bool {
		rows = append(rows, *cursor)
		return true
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to iterate SpellCastTimes rows",
			Detail:  err.Error(),
		})
		return
	}

	resp := chroniclesdk.DBCUploadResponse{
		DBCName:     "SpellCastTimes",
		RecordCount: len(rows),
		Mode:        mode,
	}

	if mode == "compare" {
		resp.Inserted = len(rows)
		httpapi.Write(ctx, w, http.StatusOK, resp)
		return
	}

	if _, err := h.pool.Exec(ctx, `DELETE FROM dbc_spell_cast_times WHERE dataset_id = $1`, datasetID); err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to clear existing spell cast times",
			Detail:  err.Error(),
		})
		return
	}

	const batchSize = 500
	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(`INSERT INTO dbc_spell_cast_times (dataset_id, id, base, per_level, minimum) VALUES ($1,$2,$3,$4,$5)`,
			datasetID, row.ID, row.Base, row.PerLevel, row.Minimum,
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

func (h *Handler) handleSpellDurationsUpload(ctx context.Context, w http.ResponseWriter, mode string, table *dbc.Table, datasetID uuid.UUID) {
	var rows []dbdefs.Ent_SpellDuration
	err := table.Range(func(cursor *dbdefs.Ent_SpellDuration) bool {
		rows = append(rows, *cursor)
		return true
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to iterate SpellDuration rows",
			Detail:  err.Error(),
		})
		return
	}

	resp := chroniclesdk.DBCUploadResponse{
		DBCName:     "SpellDuration",
		RecordCount: len(rows),
		Mode:        mode,
	}

	if mode == "compare" {
		resp.Inserted = len(rows)
		httpapi.Write(ctx, w, http.StatusOK, resp)
		return
	}

	if _, err := h.pool.Exec(ctx, `DELETE FROM dbc_spell_durations WHERE dataset_id = $1`, datasetID); err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to clear existing spell durations",
			Detail:  err.Error(),
		})
		return
	}

	const batchSize = 500
	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(`INSERT INTO dbc_spell_durations (dataset_id, id, duration, duration_per_level, max_duration) VALUES ($1,$2,$3,$4,$5)`,
			datasetID, row.ID, row.Duration, row.DurationPerLevel, row.MaxDuration,
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

	if err := h.deriveAffectedAuraDurations(ctx, datasetID); err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Spell durations imported but affected aura duration generation failed",
			Detail:  err.Error(),
		})
		return
	}
	if h.wowDB != nil {
		h.wowDB.InvalidateSpellCache(datasetID)
	}

	resp.Inserted = len(rows)
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func (h *Handler) handleSpellRangesUpload(ctx context.Context, w http.ResponseWriter, mode string, table *dbc.Table, datasetID uuid.UUID) {
	var rows []dbdefs.Ent_SpellRange
	err := table.Range(func(cursor *dbdefs.Ent_SpellRange) bool {
		rows = append(rows, *cursor)
		return true
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to iterate SpellRange rows",
			Detail:  err.Error(),
		})
		return
	}

	resp := chroniclesdk.DBCUploadResponse{
		DBCName:     "SpellRange",
		RecordCount: len(rows),
		Mode:        mode,
	}

	if mode == "compare" {
		resp.Inserted = len(rows)
		httpapi.Write(ctx, w, http.StatusOK, resp)
		return
	}

	if _, err := h.pool.Exec(ctx, `DELETE FROM dbc_spell_ranges WHERE dataset_id = $1`, datasetID); err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to clear existing spell ranges",
			Detail:  err.Error(),
		})
		return
	}

	const batchSize = 500
	batch := &pgx.Batch{}
	for _, row := range rows {
		var rangeMin, rangeMax float32
		if len(row.RangeMin) > 0 {
			rangeMin = row.RangeMin[0]
		}
		if len(row.RangeMax) > 0 {
			rangeMax = row.RangeMax[0]
		}
		batch.Queue(`INSERT INTO dbc_spell_ranges (dataset_id, id, range_min, range_max, flags, name) VALUES ($1,$2,$3,$4,$5,$6)`,
			datasetID, row.ID, rangeMin, rangeMax, row.Flags, row.DisplayName_lang.String(),
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

func (h *Handler) handleSpellIconsUpload(ctx context.Context, w http.ResponseWriter, mode string, table *dbc.Table, datasetID uuid.UUID) {
	var rows []dbdefs.Ent_SpellIcon
	err := table.Range(func(cursor *dbdefs.Ent_SpellIcon) bool {
		rows = append(rows, *cursor)
		return true
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to iterate SpellIcon rows",
			Detail:  err.Error(),
		})
		return
	}

	resp := chroniclesdk.DBCUploadResponse{
		DBCName:     "SpellIcon",
		RecordCount: len(rows),
		Mode:        mode,
	}

	if mode == "compare" {
		resp.Inserted = len(rows)
		httpapi.Write(ctx, w, http.StatusOK, resp)
		return
	}

	if _, err := h.pool.Exec(ctx, `DELETE FROM dbc_spell_icons WHERE dataset_id = $1`, datasetID); err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to clear existing spell icons",
			Detail:  err.Error(),
		})
		return
	}

	const batchSize = 500
	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(`INSERT INTO dbc_spell_icons (dataset_id, id, texture_filename) VALUES ($1,$2,$3)`,
			datasetID, row.ID, cutIconPrefix(row.TextureFilename),
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

func (h *Handler) handleSpellCategoriesUpload(ctx context.Context, w http.ResponseWriter, mode string, table *dbc.Table, datasetID uuid.UUID) {
	var rows []dbdefs.Ent_SpellCategory
	err := table.Range(func(cursor *dbdefs.Ent_SpellCategory) bool {
		rows = append(rows, *cursor)
		return true
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to iterate SpellCategory rows",
			Detail:  err.Error(),
		})
		return
	}

	resp := chroniclesdk.DBCUploadResponse{
		DBCName:     "SpellCategory",
		RecordCount: len(rows),
		Mode:        mode,
	}

	if mode == "compare" {
		resp.Inserted = len(rows)
		httpapi.Write(ctx, w, http.StatusOK, resp)
		return
	}

	if _, err := h.pool.Exec(ctx, `DELETE FROM dbc_spell_categories WHERE dataset_id = $1`, datasetID); err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to clear existing spell categories",
			Detail:  err.Error(),
		})
		return
	}

	const batchSize = 500
	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(`INSERT INTO dbc_spell_categories (dataset_id, id, flags, uses_per_week, name, max_charges, charge_recovery_time, type_mask) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			datasetID, row.ID, row.Flags, row.UsesPerWeek, row.Name_lang.String(), row.MaxCharges, row.ChargeRecoveryTime, row.TypeMask,
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

func (h *Handler) handleSpellRadiiUpload(ctx context.Context, w http.ResponseWriter, mode string, table *dbc.Table, datasetID uuid.UUID) {
	var rows []dbdefs.Ent_SpellRadius
	err := table.Range(func(cursor *dbdefs.Ent_SpellRadius) bool {
		rows = append(rows, *cursor)
		return true
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to iterate SpellRadius rows",
			Detail:  err.Error(),
		})
		return
	}

	resp := chroniclesdk.DBCUploadResponse{
		DBCName:     "SpellRadius",
		RecordCount: len(rows),
		Mode:        mode,
	}

	if mode == "compare" {
		resp.Inserted = len(rows)
		httpapi.Write(ctx, w, http.StatusOK, resp)
		return
	}

	if _, err := h.pool.Exec(ctx, `DELETE FROM dbc_spell_radii WHERE dataset_id = $1`, datasetID); err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to clear existing spell radii",
			Detail:  err.Error(),
		})
		return
	}

	const batchSize = 500
	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(`INSERT INTO dbc_spell_radii (dataset_id, id, radius, radius_per_level, radius_min, radius_max) VALUES ($1,$2,$3,$4,$5,$6)`,
			datasetID, row.ID, row.Radius, row.RadiusPerLevel, row.RadiusMin, row.RadiusMax,
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

func (h *Handler) handleSpellFocusObjectsUpload(ctx context.Context, w http.ResponseWriter, mode string, table *dbc.Table, datasetID uuid.UUID) {
	var rows []dbdefs.Ent_SpellFocusObject
	err := table.Range(func(cursor *dbdefs.Ent_SpellFocusObject) bool {
		rows = append(rows, *cursor)
		return true
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to iterate SpellFocusObject rows",
			Detail:  err.Error(),
		})
		return
	}

	resp := chroniclesdk.DBCUploadResponse{
		DBCName:     "SpellFocusObject",
		RecordCount: len(rows),
		Mode:        mode,
	}

	if mode == "compare" {
		resp.Inserted = len(rows)
		httpapi.Write(ctx, w, http.StatusOK, resp)
		return
	}

	if _, err := h.pool.Exec(ctx, `DELETE FROM dbc_spell_focus_objects WHERE dataset_id = $1`, datasetID); err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to clear existing spell focus objects",
			Detail:  err.Error(),
		})
		return
	}

	const batchSize = 500
	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(`INSERT INTO dbc_spell_focus_objects (dataset_id, id, name) VALUES ($1,$2,$3)`,
			datasetID, row.ID, row.Name_lang.String(),
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
