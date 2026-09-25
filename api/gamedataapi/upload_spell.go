package gamedataapi

import (
	"context"
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
	var canonicalSpells []*chrondbc.Spell
	err := spellDBC.Range(func(cursor *chrondbc.Spell) bool {
		if cursor == nil {
			return true
		}
		spells = append(spells, spelldb.FromSpell(datasetID, cursor))
		canonicalSpells = append(canonicalSpells, cursor)
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

	if err := h.persistLegacySpells(ctx, datasetID, spells, canonicalSpells); err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to persist spells",
			Detail:  err.Error(),
		})
		return
	}

	// Derive extra_attacks, duration_modifiers, periodic_spells from the
	// imported spell data after the canonical and compatibility rows commit.
	if err := h.deriveSpellMetadata(ctx, datasetID, spellDBC); err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Spells imported but derived table generation failed",
			Detail:  err.Error(),
		})
		return
	}
	if err := h.deriveAffectedAuraDurations(ctx, datasetID); err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Spells imported but affected aura duration generation failed",
			Detail:  err.Error(),
		})
		return
	}
	if err := h.deriveConsumables(ctx, datasetID); err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Spells imported but consumable generation failed",
			Detail:  err.Error(),
		})
		return
	}

	// Invalidate the spell cache so subsequent lookups for this dataset
	// hit the freshly-imported DB data instead of stale cache entries.
	if h.wowDB != nil {
		h.wowDB.InvalidateSpellCache(datasetID)
		h.wowDB.InvalidateExtraAttacks(datasetID)
		h.wowDB.InvalidateDurationModifiers(datasetID)
		h.wowDB.InvalidatePeriodicSpells(datasetID)
	}

	resp.Inserted = len(spells)
	httpapi.Write(ctx, w, http.StatusOK, resp)
}
