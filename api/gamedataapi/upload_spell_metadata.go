package gamedataapi

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
)

// hydrateLegacySpellMetadata resolves the foreign-key indexes in Spell.dbc
// against companion tables already imported for the same dataset.
func (h *Handler) hydrateLegacySpellMetadata(ctx context.Context, datasetID uuid.UUID, spells []*chrondbc.Spell) error {
	store := database.New(h.pool)

	castRows, err := store.ListSpellCastTimesByDataset(ctx, datasetID)
	if err != nil {
		return fmt.Errorf("list spell cast times: %w", err)
	}
	castTimes := make(map[int32]chrondbc.SpellCastTime, len(castRows))
	for _, row := range castRows {
		castTimes[row.ID] = chrondbc.SpellCastTime{ID: row.ID, Base: row.Base, PerLevel: row.PerLevel, Minimum: row.Minimum}
	}

	durationRows, err := store.ListSpellDurationsByDataset(ctx, datasetID)
	if err != nil {
		return fmt.Errorf("list spell durations: %w", err)
	}
	durations := make(map[int32]chrondbc.SpellDuration, len(durationRows))
	for _, row := range durationRows {
		durations[row.ID] = chrondbc.SpellDuration{ID: row.ID, Duration: row.Duration, DurationPerLevel: row.DurationPerLevel, MaxDuration: row.MaxDuration}
	}

	rangeRows, err := store.ListSpellRangesByDataset(ctx, datasetID)
	if err != nil {
		return fmt.Errorf("list spell ranges: %w", err)
	}
	ranges := make(map[int32]chrondbc.SpellRange, len(rangeRows))
	for _, row := range rangeRows {
		ranges[row.ID] = chrondbc.SpellRange{ID: row.ID, RangeMin: row.RangeMin, RangeMax: row.RangeMax, Flags: row.Flags, Name: row.Name}
	}

	iconRows, err := store.ListSpellIconsByDataset(ctx, datasetID)
	if err != nil {
		return fmt.Errorf("list spell icons: %w", err)
	}
	icons := make(map[int32]chrondbc.SpellIcon, len(iconRows))
	for _, row := range iconRows {
		icons[row.ID] = chrondbc.SpellIcon{ID: row.ID, TextureFilename: row.TextureFilename}
	}

	categoryRows, err := store.ListSpellCategoriesByDataset(ctx, datasetID)
	if err != nil {
		return fmt.Errorf("list spell categories: %w", err)
	}
	categories := make(map[int32]chrondbc.SpellCategory, len(categoryRows))
	for _, row := range categoryRows {
		categories[row.ID] = chrondbc.SpellCategory{ID: row.ID, Flags: row.Flags, UsesPerWeek: row.UsesPerWeek, Name: row.Name, MaxCharges: row.MaxCharges, ChargeRecoveryTime: row.ChargeRecoveryTime, TypeMask: row.TypeMask}
	}

	radiusRows, err := store.ListSpellRadiiByDataset(ctx, datasetID)
	if err != nil {
		return fmt.Errorf("list spell radii: %w", err)
	}
	radii := make(map[int32]chrondbc.SpellRadius, len(radiusRows))
	for _, row := range radiusRows {
		radii[row.ID] = chrondbc.SpellRadius{ID: row.ID, Radius: row.Radius, RadiusPerLevel: row.RadiusPerLevel, RadiusMin: row.RadiusMin, RadiusMax: row.RadiusMax}
	}

	focusRows, err := store.ListSpellFocusObjectsByDataset(ctx, datasetID)
	if err != nil {
		return fmt.Errorf("list spell focus objects: %w", err)
	}
	focusObjects := make(map[int32]chrondbc.SpellFocusObject, len(focusRows))
	for _, row := range focusRows {
		focusObjects[row.ID] = chrondbc.SpellFocusObject{ID: row.ID, Name: row.Name}
	}

	descriptionRows, err := store.ListSpellDescriptionVariablesByDataset(ctx, datasetID)
	if err != nil {
		return fmt.Errorf("list spell description variables: %w", err)
	}
	descriptionVariables := make(map[int32]string, len(descriptionRows))
	for _, row := range descriptionRows {
		descriptionVariables[row.ID] = row.Variables
	}

	for _, spell := range spells {
		if value, ok := castTimes[spell.CastingTimeIndex_]; ok {
			spell.CastTime = value
		}
		if value, ok := durations[spell.DurationIndex_]; ok {
			spell.Duration = value
		}
		if value, ok := ranges[spell.RangeIndex_]; ok {
			spell.Range = value
		}
		if value, ok := icons[spell.SpellIconID_]; ok {
			spell.SpellIcon = value
		}
		if value, ok := icons[spell.ActiveIconID_]; ok {
			spell.ActiveIcon = value
		}
		if value, ok := categories[spell.CategoryID_]; ok {
			spell.Category = value
		}
		if value, ok := focusObjects[spell.SpellFocusID_]; ok {
			spell.SpellFocus = value
		}
		if value, ok := descriptionVariables[spell.DescriptionVariablesID]; ok {
			spell.DescriptionVariables = value
		}
		for i := range spell.Effects {
			if len(spell.Effects[i].EffectRadiusIndex) == 0 {
				continue
			}
			if value, ok := radii[spell.Effects[i].EffectRadiusIndex[0]]; ok {
				spell.Effects[i].EffectRadius = value
			}
		}
	}
	return nil
}
