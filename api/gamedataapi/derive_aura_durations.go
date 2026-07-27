package gamedataapi

import (
	"context"
	"fmt"
	"sort"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/google/uuid"
)

// deriveAffectedAuraDurations rebuilds the affected-spell and modifier
// cross-reference for a dataset. It is safe to call after either Spell.dbc or
// SpellDuration.dbc is uploaded; whichever upload happens second will populate
// the complete result.
func (h *Handler) deriveAffectedAuraDurations(ctx context.Context, datasetID uuid.UUID) error {
	return h.zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		return deriveAffectedAuraDurations(ctx, tx, datasetID)
	}, nil)
}

func deriveAffectedAuraDurations(ctx context.Context, tx database.Store, datasetID uuid.UUID) error {
	if err := tx.DeleteAffectedAuraDurationsByDataset(ctx, datasetID); err != nil {
		return fmt.Errorf("clear affected aura durations: %w", err)
	}

	modifierRows, err := tx.ListAuraDurationModifiersForDerivation(ctx, datasetID)
	if err != nil {
		return fmt.Errorf("list aura duration modifiers: %w", err)
	}
	candidateRows, err := tx.ListAffectedAuraDurationCandidates(ctx, datasetID)
	if err != nil {
		return fmt.Errorf("list affected aura duration candidates: %w", err)
	}

	modifierSet := &chrondbc.DurationModifierSet{
		ByID:       make(map[int32]dbcmem.DurationModifier, len(modifierRows)),
		ByClassBit: make(map[int32]map[uint64][]int32),
	}
	for _, row := range modifierRows {
		modifierSet.ByID[row.SpellID] = dbcmem.DurationModifier{
			SpellID:    row.SpellID,
			Name:       row.Name,
			Percent:    row.Percent,
			Flat:       row.Flat,
			Deprecated: row.Deprecated,
		}

		mask := uint64(row.SpellClassMask)
		if modifierSet.ByClassBit[row.SpellClassSet] == nil {
			modifierSet.ByClassBit[row.SpellClassSet] = make(map[uint64][]int32)
		}
		for bit := uint64(0); bit < 64; bit++ {
			value := uint64(1) << bit
			if mask&value != 0 {
				modifierSet.ByClassBit[row.SpellClassSet][value] = append(
					modifierSet.ByClassBit[row.SpellClassSet][value],
					row.SpellID,
				)
			}
		}
	}

	affected := make([]database.InsertAffectedAuraDurationsParams, 0, len(candidateRows))
	links := make([]database.InsertAffectedAuraDurationModifiersParams, 0)
	for _, row := range candidateRows {
		spell := &chrondbc.Spell{
			ID:             chrondbc.SpellID(row.SpellID),
			Duration:       dbcmem.SpellDuration{MaxDuration: row.BaseDurationMs},
			SpellClassSet:  chrondbc.SpellClassSet(row.SpellClassSet),
			SpellClassMask: chrondbc.SpellClassMask(row.SpellClassMask),
		}
		matched := chrondbc.DurationModifiersForSpell(spell, modifierSet)
		if len(matched) == 0 {
			continue
		}

		affected = append(affected, database.InsertAffectedAuraDurationsParams{
			DatasetID:      datasetID,
			SpellID:        row.SpellID,
			SpellName:      row.Name,
			SpellClassSet:  row.SpellClassSet,
			BaseDurationMs: row.BaseDurationMs,
			MaxDurationMs:  chrondbc.MaxAuraDuration(spell, modifierSet).Milliseconds(),
			Deprecated:     row.Deprecated,
		})

		sort.Slice(matched, func(i, j int) bool { return matched[i].SpellID < matched[j].SpellID })
		for _, modifier := range matched {
			links = append(links, database.InsertAffectedAuraDurationModifiersParams{
				DatasetID:       datasetID,
				SpellID:         row.SpellID,
				ModifierSpellID: modifier.SpellID,
			})
		}
	}

	if len(affected) > 0 {
		results := tx.InsertAffectedAuraDurations(ctx, affected)
		if err := results.Close(); err != nil {
			return fmt.Errorf("insert affected aura durations: %w", err)
		}
	}
	if len(links) > 0 {
		results := tx.InsertAffectedAuraDurationModifiers(ctx, links)
		if err := results.Close(); err != nil {
			return fmt.Errorf("insert affected aura duration modifiers: %w", err)
		}
	}
	return nil
}
