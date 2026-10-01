package wowdata

import (
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
)

// CanonicalSpells reconstructs the canonical in-memory spells represented by
// an import. Base spell rows define the spell set; normalized components for
// component-only spell IDs remain persistence-only because they have no base
// spell identity to derive metadata from.
func (p *Import) CanonicalSpells() []*chrondbc.Spell {
	if p == nil {
		return nil
	}

	byID := make(map[int32]*chrondbc.Spell, len(p.Spells))
	datasetByID := make(map[int32]uuid.UUID, len(p.Spells))
	spells := make([]*chrondbc.Spell, 0, len(p.Spells))
	for i := range p.Spells {
		spell := p.Spells[i].ToSpell()
		spells = append(spells, &spell)
		byID[p.Spells[i].SpellID] = &spell
		datasetByID[p.Spells[i].SpellID] = p.Spells[i].DatasetID
	}

	for _, row := range p.SpellEffects {
		spell := byID[row.SpellID]
		if spell == nil {
			continue
		}
		basePoints := row.EffectBasePointsF
		spell.Effects = append(spell.Effects, chrondbc.SpellEffect{
			DatasetID:                      datasetByID[row.SpellID],
			SpellID:                        chrondbc.SpellID(row.SpellID),
			DifficultyID:                   row.DifficultyID,
			EffectIndex:                    row.EffectIndex,
			SourceID:                       row.SourceID,
			Effect:                         chrondbc.Effect(row.Effect),
			EffectRealPointsPerLevel:       row.EffectRealPointsPerLevel,
			EffectBasePointsF:              &basePoints,
			EffectMechanic:                 row.EffectMechanic,
			EffectRadiusIndex:              append([]int32(nil), row.EffectRadiusIndex...),
			EffectAura:                     chrondbc.AuraEffect(row.EffectAura),
			EffectAuraPeriod:               row.EffectAuraPeriod,
			EffectAmplitude:                row.EffectAmplitude,
			EffectChainTargets:             row.EffectChainTargets,
			EffectItemType:                 chrondbc.ItemID(row.EffectItemType),
			EffectMiscValue:                append([]int32(nil), row.EffectMiscValue...),
			EffectTriggerSpell:             chrondbc.SpellID(row.EffectTriggerSpell),
			EffectChainAmplitude:           row.EffectChainAmplitude,
			ImplicitTarget:                 append([]int32(nil), row.ImplicitTarget...),
			BonusCoefficientFromAP:         row.BonusCoefficientFromAP,
			Coefficient:                    row.Coefficient,
			EffectAttributes:               row.EffectAttributes,
			EffectBonusCoefficient:         row.EffectBonusCoefficient,
			EffectPointsPerResource:        row.EffectPointsPerResource,
			EffectPosFacing:                row.EffectPosFacing,
			EffectSpellClassMask:           append([]int32(nil), row.EffectSpellClassMask...),
			GroupSizeBasePointsCoefficient: row.GroupSizeBasePointsCoefficient,
			NodeField120063534001:          row.NodeField120063534001,
			PVPMultiplier:                  row.PvpMultiplier,
			ResourceCoefficient:            row.ResourceCoefficient,
			ScalingClass:                   row.ScalingClass,
			Variance:                       row.Variance,
		})
	}

	for _, row := range p.SpellPowers {
		spell := byID[row.SpellID]
		if spell == nil {
			continue
		}
		spell.Powers = append(spell.Powers, chrondbc.SpellPower{
			DatasetID:           datasetByID[row.SpellID],
			SpellID:             chrondbc.SpellID(row.SpellID),
			OrderIndex:          row.OrderIndex,
			SourceID:            row.SourceID,
			AltPowerBarID:       row.AltPowerBarID,
			ManaCost:            row.ManaCost,
			ManaCostPerLevel:    row.ManaCostPerLevel,
			ManaPerSecond:       row.ManaPerSecond,
			OptionalCost:        row.OptionalCost,
			OptionalCostPct:     row.OptionalCostPct,
			PowerCostMaxPct:     row.PowerCostMaxPct,
			PowerCostPct:        row.PowerCostPct,
			PowerDisplayID:      row.PowerDisplayID,
			PowerPctPerSecond:   row.PowerPctPerSecond,
			PowerType:           row.PowerType,
			RequiredAuraSpellID: row.RequiredAuraSpellID,
		})
	}

	for _, row := range p.SpellVariants {
		spell := byID[row.SpellID]
		if spell == nil {
			continue
		}
		spell.Variants = append(spell.Variants, canonicalSpellVariant(datasetByID[row.SpellID], row))
	}

	return spells
}

func canonicalSpellVariant(datasetID uuid.UUID, row SpellVariant) chrondbc.SpellVariant {
	variant := chrondbc.SpellVariant{DatasetID: datasetID, SpellID: chrondbc.SpellID(row.SpellID), DifficultyID: row.DifficultyID}
	if x := row.Misc; x != nil {
		variant.Misc = &chrondbc.ModernSpellMisc{ID: x.SourceID, ActiveIconFileDataID: x.ActiveIconFileDataID, ActiveSpellVisualScript: x.ActiveSpellVisualScript, Attributes: append([]int32(nil), x.Attributes...), CastingTimeIndex: x.CastingTimeIndex, ContentTuningID: x.ContentTuningID, DurationIndex: x.DurationIndex, LaunchDelay: x.LaunchDelay, MinDuration: x.MinDuration, PVPDurationIndex: x.PvPDurationIndex, RangeIndex: x.RangeIndex, SchoolMask: x.SchoolMask, ShowFutureSpellPlayerConditionID: x.ShowFutureSpellPlayerConditionID, Speed: x.Speed, SpellIconFileDataID: x.SpellIconFileDataID, SpellVisualScript: x.SpellVisualScript}
	}
	if x := row.AuraOptions; x != nil {
		variant.AuraOptions = &chrondbc.ModernSpellAuraOptions{ID: x.SourceID, CumulativeAura: x.CumulativeAura, ProcCategoryRecovery: x.ProcCategoryRecovery, ProcChance: x.ProcChance, ProcCharges: x.ProcCharges, ProcTypeMask: append([]int32(nil), x.ProcTypeMask...), SpellProcsPerMinuteID: x.SpellProcsPerMinuteID}
	}
	if x := row.AuraRestrictions; x != nil {
		variant.AuraRestrictions = &chrondbc.ModernSpellAuraRestrictions{ID: x.SourceID, CasterAuraSpell: x.CasterAuraSpell, CasterAuraState: x.CasterAuraState, CasterAuraType: x.CasterAuraType, ExcludeCasterAuraSpell: x.ExcludeCasterAuraSpell, ExcludeCasterAuraState: x.ExcludeCasterAuraState, ExcludeCasterAuraType: x.ExcludeCasterAuraType, ExcludeTargetAuraSpell: x.ExcludeTargetAuraSpell, ExcludeTargetAuraState: x.ExcludeTargetAuraState, ExcludeTargetAuraType: x.ExcludeTargetAuraType, TargetAuraSpell: x.TargetAuraSpell, TargetAuraState: x.TargetAuraState, TargetAuraType: x.TargetAuraType}
	}
	if x := row.ClassOptions; x != nil {
		variant.ClassOptions = &chrondbc.ModernSpellClassOptions{ID: x.SourceID, ModalNextSpell: x.ModalNextSpell, SpellClassSet: x.SpellClassSet, SpellClassMask: append([]int32(nil), x.SpellClassMask...)}
	}
	if x := row.Interrupts; x != nil {
		variant.Interrupts = &chrondbc.ModernSpellInterrupts{ID: x.SourceID, AuraInterruptFlags: append([]int32(nil), x.AuraInterruptFlags...), ChannelInterruptFlags: append([]int32(nil), x.ChannelInterruptFlags...), InterruptFlags: x.InterruptFlags}
	}
	if x := row.Categories; x != nil {
		variant.Categories = &chrondbc.ModernSpellCategories{ID: x.SourceID, Category: x.Category, ChargeCategory: x.ChargeCategory, DefenseType: x.DefenseType, DiminishType: x.DiminishType, DispelType: x.DispelType, Mechanic: x.Mechanic, PreventionType: x.PreventionType, StartRecoveryCategory: x.StartRecoveryCategory}
	}
	if x := row.Cooldowns; x != nil {
		variant.Cooldowns = &chrondbc.ModernSpellCooldowns{ID: x.SourceID, AuraSpellID: x.AuraSpellID, CategoryRecoveryTime: x.CategoryRecoveryTime, RecoveryTime: x.RecoveryTime, StartRecoveryTime: x.StartRecoveryTime}
	}
	if x := row.Levels; x != nil {
		variant.Levels = &chrondbc.ModernSpellLevels{ID: x.SourceID, BaseLevel: x.BaseLevel, MaxLevel: x.MaxLevel, MaxPassiveAuraLevel: x.MaxPassiveAuraLevel, SpellLevel: x.SpellLevel}
	}
	if x := row.TargetRestrictions; x != nil {
		variant.TargetRestrictions = &chrondbc.ModernSpellTargetRestrictions{ID: x.SourceID, ConeDegrees: x.ConeDegrees, MaxTargetLevel: x.MaxTargetLevel, MaxTargets: x.MaxTargets, TargetCreatureType: x.TargetCreatureType, Targets: x.Targets, Width: x.Width}
	}
	return variant
}
