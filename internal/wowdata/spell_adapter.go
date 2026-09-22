package wowdata

import (
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/spelldb"
)

// projectNormalizedSpells makes chrondbc's normalized-to-legacy projection the
// final authority for the compatibility fields on imported spell rows.
func projectNormalizedSpells(rows []spelldb.SpellRow, effects []SpellEffect, powers []SpellPower, variants []SpellVariant) {
	effectsBySpell := make(map[int32][]chrondbc.SpellEffect)
	for _, effect := range effects {
		effectsBySpell[effect.SpellID] = append(effectsBySpell[effect.SpellID], toChrondbcSpellEffect(effect))
	}
	powersBySpell := make(map[int32][]chrondbc.SpellPower)
	for _, power := range powers {
		powersBySpell[power.SpellID] = append(powersBySpell[power.SpellID], toChrondbcSpellPower(power))
	}
	variantsBySpell := make(map[int32][]chrondbc.SpellVariant)
	for _, variant := range variants {
		variantsBySpell[variant.SpellID] = append(variantsBySpell[variant.SpellID], toChrondbcSpellVariant(variant))
	}

	for i := range rows {
		spell := rows[i].ToSpell()
		spell.Effects = effectsBySpell[rows[i].SpellID]
		spell.Powers = powersBySpell[rows[i].SpellID]
		spell.Variants = variantsBySpell[rows[i].SpellID]
		spell.ProjectNormalizedDifficultyZeroToLegacy()
		syncProjectedLookupIDs(&spell)
		rows[i] = spelldb.FromSpell(rows[i].DatasetID, &spell)
		normalizeSpellArrays(&rows[i])
	}
}

// ProjectNormalizedDifficultyZeroToLegacy updates the canonical lookup IDs. The
// resolved lookup structs keep their existing metadata, so mirror only the IDs
// before spelldb.FromSpell reads them back into the row.
func syncProjectedLookupIDs(spell *chrondbc.Spell) {
	spell.SpellIcon.ID = spell.SpellIconID_
	spell.ActiveIcon.ID = spell.ActiveIconID_
	spell.Category.ID = spell.CategoryID_
	spell.CastTime.ID = spell.CastingTimeIndex_
	spell.Duration.ID = spell.DurationIndex_
	spell.Range.ID = spell.RangeIndex_
	for i := range spell.EffectRadius {
		spell.EffectRadius[i].ID = spell.EffectRadiusIndex_[i]
	}
}

func toChrondbcSpellEffect(effect SpellEffect) chrondbc.SpellEffect {
	return chrondbc.SpellEffect{
		SpellID:                        chrondbc.SpellID(effect.SpellID),
		DifficultyID:                   effect.DifficultyID,
		EffectIndex:                    effect.EffectIndex,
		SourceID:                       effect.SourceID,
		BonusCoefficientFromAP:         effect.BonusCoefficientFromAP,
		Coefficient:                    effect.Coefficient,
		Effect:                         effect.Effect,
		EffectAmplitude:                effect.EffectAmplitude,
		EffectAttributes:               effect.EffectAttributes,
		EffectAura:                     effect.EffectAura,
		EffectAuraPeriod:               effect.EffectAuraPeriod,
		EffectBasePointsF:              effect.EffectBasePointsF,
		EffectBonusCoefficient:         effect.EffectBonusCoefficient,
		EffectChainAmplitude:           effect.EffectChainAmplitude,
		EffectChainTargets:             effect.EffectChainTargets,
		EffectItemType:                 effect.EffectItemType,
		EffectMechanic:                 effect.EffectMechanic,
		EffectMiscValue:                append([]int32(nil), effect.EffectMiscValue...),
		EffectPointsPerResource:        effect.EffectPointsPerResource,
		EffectPosFacing:                effect.EffectPosFacing,
		EffectRadiusIndex:              append([]int32(nil), effect.EffectRadiusIndex...),
		EffectRealPointsPerLevel:       effect.EffectRealPointsPerLevel,
		EffectSpellClassMask:           append([]int32(nil), effect.EffectSpellClassMask...),
		EffectTriggerSpell:             effect.EffectTriggerSpell,
		GroupSizeBasePointsCoefficient: effect.GroupSizeBasePointsCoefficient,
		NodeField120063534001:          effect.NodeField120063534001,
		PVPMultiplier:                  effect.PvpMultiplier,
		ResourceCoefficient:            effect.ResourceCoefficient,
		ScalingClass:                   effect.ScalingClass,
		ImplicitTarget:                 append([]int32(nil), effect.ImplicitTarget...),
		Variance:                       effect.Variance,
	}
}

func toChrondbcSpellPower(power SpellPower) chrondbc.SpellPower {
	return chrondbc.SpellPower{
		SpellID:             chrondbc.SpellID(power.SpellID),
		OrderIndex:          power.OrderIndex,
		SourceID:            power.SourceID,
		AltPowerBarID:       power.AltPowerBarID,
		ManaCost:            power.ManaCost,
		ManaCostPerLevel:    power.ManaCostPerLevel,
		ManaPerSecond:       power.ManaPerSecond,
		OptionalCost:        power.OptionalCost,
		OptionalCostPct:     power.OptionalCostPct,
		PowerCostMaxPct:     power.PowerCostMaxPct,
		PowerCostPct:        power.PowerCostPct,
		PowerDisplayID:      power.PowerDisplayID,
		PowerPctPerSecond:   power.PowerPctPerSecond,
		PowerType:           power.PowerType,
		RequiredAuraSpellID: power.RequiredAuraSpellID,
	}
}

func toChrondbcSpellVariant(variant SpellVariant) chrondbc.SpellVariant {
	return chrondbc.SpellVariant{
		SpellID:            chrondbc.SpellID(variant.SpellID),
		DifficultyID:       variant.DifficultyID,
		Misc:               toChrondbcSpellMisc(variant.Misc),
		AuraOptions:        toChrondbcSpellAuraOptions(variant.AuraOptions),
		AuraRestrictions:   toChrondbcSpellAuraRestrictions(variant.AuraRestrictions),
		ClassOptions:       toChrondbcSpellClassOptions(variant.ClassOptions),
		Interrupts:         toChrondbcSpellInterrupts(variant.Interrupts),
		Categories:         toChrondbcSpellCategories(variant.Categories),
		Cooldowns:          toChrondbcSpellCooldowns(variant.Cooldowns),
		Levels:             toChrondbcSpellLevels(variant.Levels),
		TargetRestrictions: toChrondbcSpellTargetRestrictions(variant.TargetRestrictions),
	}
}

func toChrondbcSpellMisc(x *SpellMisc) *chrondbc.SpellMisc {
	if x == nil {
		return nil
	}
	return &chrondbc.SpellMisc{
		ID: x.SourceID, ActiveIconFileDataID: x.ActiveIconFileDataID, ActiveSpellVisualScript: x.ActiveSpellVisualScript,
		Attributes: append([]int32(nil), x.Attributes...), CastingTimeIndex: x.CastingTimeIndex, ContentTuningID: x.ContentTuningID,
		DurationIndex: x.DurationIndex, LaunchDelay: x.LaunchDelay, MinDuration: x.MinDuration, PVPDurationIndex: x.PvPDurationIndex,
		RangeIndex: x.RangeIndex, SchoolMask: x.SchoolMask, ShowFutureSpellPlayerConditionID: x.ShowFutureSpellPlayerConditionID,
		Speed: x.Speed, SpellIconFileDataID: x.SpellIconFileDataID, SpellVisualScript: x.SpellVisualScript,
	}
}

func toChrondbcSpellAuraOptions(x *SpellAuraOptions) *chrondbc.SpellAuraOptions {
	if x == nil {
		return nil
	}
	return &chrondbc.SpellAuraOptions{ID: x.SourceID, CumulativeAura: x.CumulativeAura, ProcCategoryRecovery: x.ProcCategoryRecovery, ProcChance: x.ProcChance, ProcCharges: x.ProcCharges, ProcTypeMask: append([]int32(nil), x.ProcTypeMask...), SpellProcsPerMinuteID: x.SpellProcsPerMinuteID}
}

func toChrondbcSpellAuraRestrictions(x *SpellAuraRestrictions) *chrondbc.SpellAuraRestrictions {
	if x == nil {
		return nil
	}
	return &chrondbc.SpellAuraRestrictions{ID: x.SourceID, CasterAuraSpell: x.CasterAuraSpell, CasterAuraState: x.CasterAuraState, CasterAuraType: x.CasterAuraType, ExcludeCasterAuraSpell: x.ExcludeCasterAuraSpell, ExcludeCasterAuraState: x.ExcludeCasterAuraState, ExcludeCasterAuraType: x.ExcludeCasterAuraType, ExcludeTargetAuraSpell: x.ExcludeTargetAuraSpell, ExcludeTargetAuraState: x.ExcludeTargetAuraState, ExcludeTargetAuraType: x.ExcludeTargetAuraType, TargetAuraSpell: x.TargetAuraSpell, TargetAuraState: x.TargetAuraState, TargetAuraType: x.TargetAuraType}
}

func toChrondbcSpellClassOptions(x *SpellClassOptions) *chrondbc.SpellClassOptions {
	if x == nil {
		return nil
	}
	return &chrondbc.SpellClassOptions{ID: x.SourceID, ModalNextSpell: x.ModalNextSpell, SpellClassSet: x.SpellClassSet, SpellClassMask: append([]int32(nil), x.SpellClassMask...)}
}

func toChrondbcSpellInterrupts(x *SpellInterrupts) *chrondbc.SpellInterrupts {
	if x == nil {
		return nil
	}
	return &chrondbc.SpellInterrupts{ID: x.SourceID, InterruptFlags: x.InterruptFlags, AuraInterruptFlags: append([]int32(nil), x.AuraInterruptFlags...), ChannelInterruptFlags: append([]int32(nil), x.ChannelInterruptFlags...)}
}

func toChrondbcSpellCategories(x *SpellCategories) *chrondbc.SpellCategories {
	if x == nil {
		return nil
	}
	return &chrondbc.SpellCategories{ID: x.SourceID, Category: x.Category, ChargeCategory: x.ChargeCategory, DefenseType: x.DefenseType, DiminishType: x.DiminishType, DispelType: x.DispelType, Mechanic: x.Mechanic, PreventionType: x.PreventionType, StartRecoveryCategory: x.StartRecoveryCategory}
}

func toChrondbcSpellCooldowns(x *SpellCooldowns) *chrondbc.SpellCooldowns {
	if x == nil {
		return nil
	}
	return &chrondbc.SpellCooldowns{ID: x.SourceID, AuraSpellID: x.AuraSpellID, CategoryRecoveryTime: x.CategoryRecoveryTime, RecoveryTime: x.RecoveryTime, StartRecoveryTime: x.StartRecoveryTime}
}

func toChrondbcSpellLevels(x *SpellLevels) *chrondbc.SpellLevels {
	if x == nil {
		return nil
	}
	return &chrondbc.SpellLevels{ID: x.SourceID, BaseLevel: x.BaseLevel, MaxLevel: x.MaxLevel, MaxPassiveAuraLevel: x.MaxPassiveAuraLevel, SpellLevel: x.SpellLevel}
}

func toChrondbcSpellTargetRestrictions(x *SpellTargetRestrictions) *chrondbc.SpellTargetRestrictions {
	if x == nil {
		return nil
	}
	return &chrondbc.SpellTargetRestrictions{ID: x.SourceID, ConeDegrees: x.ConeDegrees, MaxTargetLevel: x.MaxTargetLevel, MaxTargets: x.MaxTargets, TargetCreatureType: x.TargetCreatureType, Targets: x.Targets, Width: x.Width}
}
