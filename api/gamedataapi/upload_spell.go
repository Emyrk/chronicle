package gamedataapi

import (
	"context"
	"fmt"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/Gophercraft/core/format/dbc"
	"github.com/google/uuid"
)

func (h *Handler) handleSpellUpload(ctx context.Context, w http.ResponseWriter, mode string, table *dbc.Table, datasetID uuid.UUID) {
	spellDBC := chrondbc.NewSpells(table)

	var spells []spelldb.SpellRow
	err := spellDBC.Range(func(cursor *chrondbc.Spell) bool {
		if cursor == nil {
			return true
		}
		spells = append(spells, spelldb.FromSpell(datasetID, cursor))
		return true
	})
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to read Spell.dbc",
			Detail:  err.Error(),
		})
		return
	}

	resp := chroniclesdk.DBCUploadResponse{
		DBCName:     "Spell",
		RecordCount: len(spells),
		Mode:        mode,
	}

	if mode == "compare" {
		resp.Inserted = len(spells)
		httpapi.Write(ctx, w, http.StatusOK, resp)
		return
	}

	// Batch upsert spells.
	const batchSize = 500
	for i := 0; i < len(spells); i += batchSize {
		end := i + batchSize
		if end > len(spells) {
			end = len(spells)
		}
		if err := spelldb.UpsertBatch(ctx, h.pool, spells[i:end]); err != nil {
			httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
				Message: fmt.Sprintf("Failed to upsert spells (batch starting at %d)", i),
				Detail:  err.Error(),
			})
			return
		}
	}

	// Update dataset import metadata.
	_, err = h.pool.Exec(ctx,
		`UPDATE datasets SET spells_imported_at = now(), spells_count = $2, updated_at = now() WHERE id = $1`,
		datasetID, len(spells),
	)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Spells imported but failed to update dataset metadata",
			Detail:  err.Error(),
		})
		return
	}

	// Invalidate the spell cache so subsequent lookups for this dataset
	// hit the freshly-imported DB data instead of stale cache entries.
	if h.wowDB != nil {
		h.wowDB.InvalidateSpellCache(datasetID)
	}

	resp.Inserted = len(spells)
	httpapi.Write(ctx, w, http.StatusOK, resp)
}
