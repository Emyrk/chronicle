package gamedataapi

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/google/uuid"
)

func (h *Handler) persistLegacySpells(ctx context.Context, datasetID uuid.UUID, rows []spelldb.SpellRow, spells []*chrondbc.Spell) error {
	store := database.New(h.pool)
	return store.InTx(ctx, func(tx database.Store) error {
		const batchSize = 500
		for i := 0; i < len(rows); i += batchSize {
			end := min(i+batchSize, len(rows))
			if err := spelldb.UpsertBatch(ctx, tx, rows[i:end]); err != nil {
				return fmt.Errorf("upsert spells at %d: %w", i, err)
			}
		}
		if err := persistLegacyNormalizedSpells(ctx, tx, datasetID, spells); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE datasets SET spells_imported_at=now(), spells_count=$2, updated_at=now() WHERE id=$1`, datasetID, len(rows)); err != nil {
			return fmt.Errorf("update dataset metadata: %w", err)
		}
		return nil
	}, nil)
}

func persistLegacyNormalizedSpells(ctx context.Context, store database.Store, datasetID uuid.UUID, spells []*chrondbc.Spell) error {
	if err := store.ClearSpellEffectsForDataset(ctx, datasetID); err != nil {
		return fmt.Errorf("clear spell effects: %w", err)
	}
	if err := store.ClearSpellPowersForDataset(ctx, datasetID); err != nil {
		return fmt.Errorf("clear spell powers: %w", err)
	}
	if err := store.ClearSpellVariantsForDataset(ctx, datasetID); err != nil {
		return fmt.Errorf("clear spell variants: %w", err)
	}

	effectRows := make([]database.CopyLegacySpellEffectsParams, 0, len(spells)*3)
	powerRows := make([]database.CopyLegacySpellPowersParams, 0, len(spells))
	variantRows := make([]database.CopyLegacySpellVariantsParams, 0, len(spells))
	for _, spell := range spells {
		for _, effect := range spell.Effects {
			effectRows = append(effectRows, database.CopyLegacySpellEffectsParams{
				DatasetID: datasetID, SpellID: int32(spell.ID), DifficultyID: effect.DifficultyID,
				EffectIndex: effect.EffectIndex, SourceID: effect.SourceID,
				BonusCoefficientFromAp: effect.BonusCoefficientFromAP, Coefficient: effect.Coefficient,
				Effect: int32(effect.Effect), EffectAmplitude: effect.EffectAmplitude,
				EffectAttributes: effect.EffectAttributes, EffectAura: int32(effect.EffectAura),
				EffectAuraPeriod: effect.EffectAuraPeriod, EffectBasePointsF: effect.EffectiveBasePoints(),
				EffectDieSides: effect.EffectDieSides, EffectBasePoints: effect.EffectBasePoints,
				EffectPointsPerCombo: effect.EffectPointsPerCombo, EffectBaseDice: effect.EffectBaseDice,
				EffectDicePerLevel: effect.EffectDicePerLevel, EffectBonusCoefficient: effect.EffectBonusCoefficient,
				EffectChainAmplitude: effect.EffectChainAmplitude, EffectChainTargets: effect.EffectChainTargets,
				EffectItemType: int32(effect.EffectItemType), EffectMechanic: effect.EffectMechanic,
				EffectMiscValue: nonNilInts(effect.EffectMiscValue), EffectPointsPerResource: effect.EffectPointsPerResource,
				EffectPosFacing: effect.EffectPosFacing, EffectRadiusIndex: nonNilInts(effect.EffectRadiusIndex),
				EffectRealPointsPerLevel:       effect.EffectRealPointsPerLevel,
				EffectSpellClassMask:           nonNilInts(effect.EffectSpellClassMask),
				EffectTriggerSpell:             int32(effect.EffectTriggerSpell),
				GroupSizeBasePointsCoefficient: effect.GroupSizeBasePointsCoefficient,
				NodeField120063534001:          effect.NodeField120063534001, PvpMultiplier: effect.PVPMultiplier,
				ResourceCoefficient: effect.ResourceCoefficient, ScalingClass: effect.ScalingClass,
				ImplicitTarget: nonNilInts(effect.ImplicitTarget), Variance: effect.Variance,
			})
		}
		for _, power := range spell.Powers {
			powerRows = append(powerRows, database.CopyLegacySpellPowersParams{
				DatasetID: datasetID, SpellID: int32(spell.ID), OrderIndex: power.OrderIndex,
				SourceID: power.SourceID, AltPowerBarID: power.AltPowerBarID, ManaCost: power.ManaCost,
				ManaCostPerLevel: power.ManaCostPerLevel, ManaPerSecond: power.ManaPerSecond,
				OptionalCost: power.OptionalCost, OptionalCostPct: power.OptionalCostPct,
				PowerCostMaxPct: power.PowerCostMaxPct, PowerCostPct: power.PowerCostPct,
				PowerDisplayID: power.PowerDisplayID, PowerPctPerSecond: power.PowerPctPerSecond,
				PowerType: power.PowerType, RequiredAuraSpellID: power.RequiredAuraSpellID,
			})
		}
		variantRows = append(variantRows, database.CopyLegacySpellVariantsParams{
			DatasetID: datasetID, SpellID: int32(spell.ID), DifficultyID: 0,
		})
	}
	const batchSize = 500
	for i := 0; i < len(effectRows); i += batchSize {
		var batchErr error
		store.CopyLegacySpellEffects(ctx, effectRows[i:min(i+batchSize, len(effectRows))]).Exec(func(_ int, err error) {
			if batchErr == nil && err != nil {
				batchErr = err
			}
		})
		if batchErr != nil {
			return fmt.Errorf("insert legacy spell effects at %d: %w", i, batchErr)
		}
	}
	for i := 0; i < len(powerRows); i += batchSize {
		var batchErr error
		store.CopyLegacySpellPowers(ctx, powerRows[i:min(i+batchSize, len(powerRows))]).Exec(func(_ int, err error) {
			if batchErr == nil && err != nil {
				batchErr = err
			}
		})
		if batchErr != nil {
			return fmt.Errorf("insert legacy spell powers at %d: %w", i, batchErr)
		}
	}
	for i := 0; i < len(variantRows); i += batchSize {
		var batchErr error
		store.CopyLegacySpellVariants(ctx, variantRows[i:min(i+batchSize, len(variantRows))]).Exec(func(_ int, err error) {
			if batchErr == nil && err != nil {
				batchErr = err
			}
		})
		if batchErr != nil {
			return fmt.Errorf("insert legacy spell variants at %d: %w", i, batchErr)
		}
	}
	return nil
}
