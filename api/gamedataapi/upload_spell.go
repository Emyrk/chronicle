package gamedataapi

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/Emyrk/chronicle/internal/gamedataoverrides"
	"github.com/Gophercraft/core/format/dbc"
	"github.com/google/uuid"
)

func (h *Handler) handleSpellUpload(ctx context.Context, w http.ResponseWriter, mode string, table *dbc.Table, datasetID uuid.UUID) {
	spellDBC := chrondbc.NewSpells(table)

	var canonicalSpells []*chrondbc.Spell
	err := spellDBC.Range(func(cursor *chrondbc.Spell) bool {
		if cursor != nil {
			canonicalSpells = append(canonicalSpells, cursor)
		}
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
		RecordCount: len(canonicalSpells),
		Mode:        mode,
	}

	if mode == "compare" {
		resp.Inserted = len(canonicalSpells)
		httpapi.Write(ctx, w, http.StatusOK, resp)
		return
	}

	flavor, err := h.flavorForDataset(ctx, datasetID)
	if err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Dataset flavor lookup failed",
			Detail:  err.Error(),
		})
		return
	}
	gamedataoverrides.ApplySpells(flavor, canonicalSpells)
	spells := make([]spelldb.SpellRow, 0, len(canonicalSpells))
	for _, spell := range canonicalSpells {
		spells = append(spells, spelldb.FromSpell(datasetID, spell))
	}

	if err := h.persistLegacySpells(ctx, datasetID, spells, canonicalSpells); err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Failed to persist spells",
			Detail:  err.Error(),
		})
		return
	}

	// Derive parser and technical-page spell metadata after the canonical and
	// compatibility rows commit.
	if err := h.deriveSpellMetadata(ctx, datasetID, flavor, canonicalSpells); err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Spells imported but derived table generation failed",
			Detail:  err.Error(),
		})
		return
	}
	if err := h.deriveClassBuffs(ctx, datasetID, canonicalSpells); err != nil {
		httpapi.Write(ctx, w, http.StatusInternalServerError, chroniclesdk.Response{
			Message: "Spells imported but class buff generation failed",
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
