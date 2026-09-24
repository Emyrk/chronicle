package spelldb

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GetModernSpellComponents loads the normalized modern rows attached to a spell.
func GetModernSpellComponents(ctx context.Context, pool *pgxpool.Pool, datasetID uuid.UUID, spellID int32) ([]chrondbc.SpellEffect, []chrondbc.SpellPower, []chrondbc.SpellVariant, error) {
	effects, err := getModernSpellEffects(ctx, pool, datasetID, spellID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("get modern spell effects: %w", err)
	}
	powers, err := getModernSpellPowers(ctx, pool, datasetID, spellID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("get modern spell powers: %w", err)
	}
	variants, err := getModernSpellVariants(ctx, pool, datasetID, spellID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("get modern spell variants: %w", err)
	}
	return effects, powers, variants, nil
}

func getModernSpellEffects(ctx context.Context, pool *pgxpool.Pool, datasetID uuid.UUID, spellID int32) ([]chrondbc.SpellEffect, error) {
	rows, err := pool.Query(ctx, `
		SELECT dataset_id, spell_id, difficulty_id, effect_index, source_id,
			bonus_coefficient_from_ap, coefficient, effect, effect_amplitude,
			effect_attributes, effect_aura, effect_aura_period, effect_base_points_f,
			effect_bonus_coefficient, effect_chain_amplitude, effect_chain_targets,
			effect_item_type, effect_mechanic, effect_misc_value,
			effect_points_per_resource, effect_pos_facing, effect_radius_index,
			effect_real_points_per_level, effect_spell_class_mask,
			effect_trigger_spell, group_size_base_points_coefficient,
			node_field_12_0_0_63534_001, pvp_multiplier, resource_coefficient,
			scaling_class, implicit_target, variance
		FROM dbc_spell_effects
		WHERE dataset_id = $1 AND spell_id = $2
		ORDER BY difficulty_id, effect_index, source_id
	`, datasetID, spellID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []chrondbc.SpellEffect
	for rows.Next() {
		var effect chrondbc.SpellEffect
		if err := rows.Scan(
			&effect.DatasetID, &effect.SpellID,
			&effect.DifficultyID, &effect.EffectIndex, &effect.SourceID,
			&effect.BonusCoefficientFromAP, &effect.Coefficient, &effect.Effect,
			&effect.EffectAmplitude, &effect.EffectAttributes, &effect.EffectAura,
			&effect.EffectAuraPeriod, &effect.EffectBasePointsF,
			&effect.EffectBonusCoefficient, &effect.EffectChainAmplitude,
			&effect.EffectChainTargets, &effect.EffectItemType, &effect.EffectMechanic,
			&effect.EffectMiscValue, &effect.EffectPointsPerResource,
			&effect.EffectPosFacing, &effect.EffectRadiusIndex,
			&effect.EffectRealPointsPerLevel, &effect.EffectSpellClassMask,
			&effect.EffectTriggerSpell, &effect.GroupSizeBasePointsCoefficient,
			&effect.NodeField120063534001, &effect.PVPMultiplier,
			&effect.ResourceCoefficient, &effect.ScalingClass,
			&effect.ImplicitTarget, &effect.Variance,
		); err != nil {
			return nil, err
		}
		result = append(result, effect)
	}
	return result, rows.Err()
}

func getModernSpellPowers(ctx context.Context, pool *pgxpool.Pool, datasetID uuid.UUID, spellID int32) ([]chrondbc.SpellPower, error) {
	rows, err := pool.Query(ctx, `
		SELECT dataset_id, spell_id, order_index, source_id, alt_power_bar_id, mana_cost,
			mana_cost_per_level, mana_per_second, optional_cost,
			optional_cost_pct, power_cost_max_pct, power_cost_pct,
			power_display_id, power_pct_per_second, power_type,
			required_aura_spell_id
		FROM dbc_spell_powers
		WHERE dataset_id = $1 AND spell_id = $2
		ORDER BY order_index, source_id
	`, datasetID, spellID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []chrondbc.SpellPower
	for rows.Next() {
		var power chrondbc.SpellPower
		if err := rows.Scan(
			&power.DatasetID, &power.SpellID,
			&power.OrderIndex, &power.SourceID, &power.AltPowerBarID,
			&power.ManaCost, &power.ManaCostPerLevel, &power.ManaPerSecond,
			&power.OptionalCost, &power.OptionalCostPct, &power.PowerCostMaxPct,
			&power.PowerCostPct, &power.PowerDisplayID, &power.PowerPctPerSecond,
			&power.PowerType, &power.RequiredAuraSpellID,
		); err != nil {
			return nil, err
		}
		result = append(result, power)
	}
	return result, rows.Err()
}

type modernSpellVariantRow struct {
	DatasetID    uuid.UUID
	SpellID      int32
	DifficultyID int32

	MiscID                           *int32
	ActiveIconFileDataID             *int32
	ActiveSpellVisualScript          *int32
	Attributes                       []int32
	CastingTimeIndex                 *int32
	ContentTuningID                  *int32
	DurationIndex                    *int32
	LaunchDelay                      *float32
	MinDuration                      *float32
	PVPDurationIndex                 *int32
	RangeIndex                       *int32
	SchoolMask                       *int32
	ShowFutureSpellPlayerConditionID *int32
	Speed                            *float32
	SpellIconFileDataID              *int32
	SpellVisualScript                *int32

	AuraOptionsID         *int32
	CumulativeAura        *int32
	ProcCategoryRecovery  *int32
	ProcChance            *int32
	ProcCharges           *int32
	ProcTypeMask          []int32
	SpellProcsPerMinuteID *int32

	AuraRestrictionsID     *int32
	CasterAuraSpell        *int32
	CasterAuraState        *int32
	CasterAuraType         *int32
	ExcludeCasterAuraSpell *int32
	ExcludeCasterAuraState *int32
	ExcludeCasterAuraType  *int32
	ExcludeTargetAuraSpell *int32
	ExcludeTargetAuraState *int32
	ExcludeTargetAuraType  *int32
	TargetAuraSpell        *int32
	TargetAuraState        *int32
	TargetAuraType         *int32

	ClassOptionsID *int32
	ModalNextSpell *int32
	SpellClassSet  *int32
	SpellClassMask []int32

	InterruptsID          *int32
	AuraInterruptFlags    []int32
	ChannelInterruptFlags []int32
	InterruptFlags        *int32

	CategoriesID          *int32
	Category              *int32
	ChargeCategory        *int32
	DefenseType           *int32
	DiminishType          *int32
	DispelType            *int32
	Mechanic              *int32
	PreventionType        *int32
	StartRecoveryCategory *int32

	CooldownsID          *int32
	AuraSpellID          *int32
	CategoryRecoveryTime *int32
	RecoveryTime         *int32
	StartRecoveryTime    *int32

	LevelsID            *int32
	BaseLevel           *int32
	MaxLevel            *int32
	MaxPassiveAuraLevel *int32
	SpellLevel          *int32

	TargetRestrictionsID *int32
	ConeDegrees          *float32
	MaxTargetLevel       *int32
	MaxTargets           *int32
	TargetCreatureType   *int32
	Targets              *int32
	Width                *float32
}

func getModernSpellVariants(ctx context.Context, pool *pgxpool.Pool, datasetID uuid.UUID, spellID int32) ([]chrondbc.SpellVariant, error) {
	rows, err := pool.Query(ctx, `
		SELECT dataset_id, spell_id, difficulty_id,
			misc_id, active_icon_file_data_id, active_spell_visual_script,
			attributes, casting_time_index, content_tuning_id, duration_index,
			launch_delay, min_duration, pvp_duration_index, range_index,
			school_mask, show_future_spell_player_condition_id, speed,
			spell_icon_file_data_id, spell_visual_script,
			aura_options_id, cumulative_aura, proc_category_recovery,
			proc_chance, proc_charges, proc_type_mask, spell_procs_per_minute_id,
			aura_restrictions_id, caster_aura_spell, caster_aura_state,
			caster_aura_type, exclude_caster_aura_spell,
			exclude_caster_aura_state, exclude_caster_aura_type,
			exclude_target_aura_spell, exclude_target_aura_state,
			exclude_target_aura_type, target_aura_spell, target_aura_state,
			target_aura_type,
			class_options_id, modal_next_spell, spell_class_set, spell_class_mask,
			interrupts_id, aura_interrupt_flags, channel_interrupt_flags,
			interrupt_flags,
			categories_id, category, charge_category, defense_type, diminish_type,
			dispel_type, mechanic, prevention_type, start_recovery_category,
			cooldowns_id, aura_spell_id, category_recovery_time, recovery_time,
			start_recovery_time,
			levels_id, base_level, max_level, max_passive_aura_level, spell_level,
			target_restrictions_id, cone_degrees, max_target_level, max_targets,
			target_creature_type, targets, width
		FROM dbc_spell_variants
		WHERE dataset_id = $1 AND spell_id = $2
		ORDER BY difficulty_id
	`, datasetID, spellID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []chrondbc.SpellVariant
	for rows.Next() {
		var row modernSpellVariantRow
		if err := rows.Scan(
			&row.DatasetID, &row.SpellID, &row.DifficultyID,
			&row.MiscID, &row.ActiveIconFileDataID, &row.ActiveSpellVisualScript,
			&row.Attributes, &row.CastingTimeIndex, &row.ContentTuningID,
			&row.DurationIndex, &row.LaunchDelay, &row.MinDuration,
			&row.PVPDurationIndex, &row.RangeIndex, &row.SchoolMask,
			&row.ShowFutureSpellPlayerConditionID, &row.Speed,
			&row.SpellIconFileDataID, &row.SpellVisualScript,
			&row.AuraOptionsID, &row.CumulativeAura, &row.ProcCategoryRecovery,
			&row.ProcChance, &row.ProcCharges, &row.ProcTypeMask,
			&row.SpellProcsPerMinuteID,
			&row.AuraRestrictionsID, &row.CasterAuraSpell, &row.CasterAuraState,
			&row.CasterAuraType, &row.ExcludeCasterAuraSpell,
			&row.ExcludeCasterAuraState, &row.ExcludeCasterAuraType,
			&row.ExcludeTargetAuraSpell, &row.ExcludeTargetAuraState,
			&row.ExcludeTargetAuraType, &row.TargetAuraSpell, &row.TargetAuraState,
			&row.TargetAuraType,
			&row.ClassOptionsID, &row.ModalNextSpell, &row.SpellClassSet,
			&row.SpellClassMask,
			&row.InterruptsID, &row.AuraInterruptFlags, &row.ChannelInterruptFlags,
			&row.InterruptFlags,
			&row.CategoriesID, &row.Category, &row.ChargeCategory, &row.DefenseType,
			&row.DiminishType, &row.DispelType, &row.Mechanic,
			&row.PreventionType, &row.StartRecoveryCategory,
			&row.CooldownsID, &row.AuraSpellID, &row.CategoryRecoveryTime,
			&row.RecoveryTime, &row.StartRecoveryTime,
			&row.LevelsID, &row.BaseLevel, &row.MaxLevel,
			&row.MaxPassiveAuraLevel, &row.SpellLevel,
			&row.TargetRestrictionsID, &row.ConeDegrees, &row.MaxTargetLevel,
			&row.MaxTargets, &row.TargetCreatureType, &row.Targets, &row.Width,
		); err != nil {
			return nil, err
		}
		result = append(result, row.toModernSpellVariant())
	}
	return result, rows.Err()
}

func (r modernSpellVariantRow) toModernSpellVariant() chrondbc.SpellVariant {
	variant := chrondbc.SpellVariant{
		DatasetID:    r.DatasetID,
		SpellID:      chrondbc.SpellID(r.SpellID),
		DifficultyID: r.DifficultyID,
	}
	if r.MiscID != nil {
		variant.Misc = &chrondbc.ModernSpellMisc{
			ID: *r.MiscID, ActiveIconFileDataID: valueOrZero(r.ActiveIconFileDataID),
			ActiveSpellVisualScript: valueOrZero(r.ActiveSpellVisualScript), Attributes: r.Attributes,
			CastingTimeIndex: valueOrZero(r.CastingTimeIndex), ContentTuningID: valueOrZero(r.ContentTuningID),
			DurationIndex: valueOrZero(r.DurationIndex), LaunchDelay: valueOrZero(r.LaunchDelay),
			MinDuration: valueOrZero(r.MinDuration), PVPDurationIndex: valueOrZero(r.PVPDurationIndex),
			RangeIndex: valueOrZero(r.RangeIndex), SchoolMask: valueOrZero(r.SchoolMask),
			ShowFutureSpellPlayerConditionID: valueOrZero(r.ShowFutureSpellPlayerConditionID), Speed: valueOrZero(r.Speed),
			SpellIconFileDataID: valueOrZero(r.SpellIconFileDataID), SpellVisualScript: valueOrZero(r.SpellVisualScript),
		}
	}
	if r.AuraOptionsID != nil {
		variant.AuraOptions = &chrondbc.ModernSpellAuraOptions{
			ID: *r.AuraOptionsID, CumulativeAura: valueOrZero(r.CumulativeAura),
			ProcCategoryRecovery: valueOrZero(r.ProcCategoryRecovery), ProcChance: valueOrZero(r.ProcChance),
			ProcCharges: valueOrZero(r.ProcCharges), ProcTypeMask: r.ProcTypeMask,
			SpellProcsPerMinuteID: valueOrZero(r.SpellProcsPerMinuteID),
		}
	}
	if r.AuraRestrictionsID != nil {
		variant.AuraRestrictions = &chrondbc.ModernSpellAuraRestrictions{
			ID: *r.AuraRestrictionsID, CasterAuraSpell: valueOrZero(r.CasterAuraSpell),
			CasterAuraState: valueOrZero(r.CasterAuraState), CasterAuraType: valueOrZero(r.CasterAuraType),
			ExcludeCasterAuraSpell: valueOrZero(r.ExcludeCasterAuraSpell), ExcludeCasterAuraState: valueOrZero(r.ExcludeCasterAuraState),
			ExcludeCasterAuraType: valueOrZero(r.ExcludeCasterAuraType), ExcludeTargetAuraSpell: valueOrZero(r.ExcludeTargetAuraSpell),
			ExcludeTargetAuraState: valueOrZero(r.ExcludeTargetAuraState), ExcludeTargetAuraType: valueOrZero(r.ExcludeTargetAuraType),
			TargetAuraSpell: valueOrZero(r.TargetAuraSpell), TargetAuraState: valueOrZero(r.TargetAuraState), TargetAuraType: valueOrZero(r.TargetAuraType),
		}
	}
	if r.ClassOptionsID != nil {
		variant.ClassOptions = &chrondbc.ModernSpellClassOptions{
			ID: *r.ClassOptionsID, ModalNextSpell: valueOrZero(r.ModalNextSpell),
			SpellClassSet: valueOrZero(r.SpellClassSet), SpellClassMask: r.SpellClassMask,
		}
	}
	if r.InterruptsID != nil {
		variant.Interrupts = &chrondbc.ModernSpellInterrupts{
			ID: *r.InterruptsID, AuraInterruptFlags: r.AuraInterruptFlags,
			ChannelInterruptFlags: r.ChannelInterruptFlags, InterruptFlags: valueOrZero(r.InterruptFlags),
		}
	}
	if r.CategoriesID != nil {
		variant.Categories = &chrondbc.ModernSpellCategories{
			ID: *r.CategoriesID, Category: valueOrZero(r.Category), ChargeCategory: valueOrZero(r.ChargeCategory),
			DefenseType: valueOrZero(r.DefenseType), DiminishType: valueOrZero(r.DiminishType),
			DispelType: valueOrZero(r.DispelType), Mechanic: valueOrZero(r.Mechanic),
			PreventionType: valueOrZero(r.PreventionType), StartRecoveryCategory: valueOrZero(r.StartRecoveryCategory),
		}
	}
	if r.CooldownsID != nil {
		variant.Cooldowns = &chrondbc.ModernSpellCooldowns{
			ID: *r.CooldownsID, AuraSpellID: valueOrZero(r.AuraSpellID),
			CategoryRecoveryTime: valueOrZero(r.CategoryRecoveryTime), RecoveryTime: valueOrZero(r.RecoveryTime),
			StartRecoveryTime: valueOrZero(r.StartRecoveryTime),
		}
	}
	if r.LevelsID != nil {
		variant.Levels = &chrondbc.ModernSpellLevels{
			ID: *r.LevelsID, BaseLevel: valueOrZero(r.BaseLevel), MaxLevel: valueOrZero(r.MaxLevel),
			MaxPassiveAuraLevel: valueOrZero(r.MaxPassiveAuraLevel), SpellLevel: valueOrZero(r.SpellLevel),
		}
	}
	if r.TargetRestrictionsID != nil {
		variant.TargetRestrictions = &chrondbc.ModernSpellTargetRestrictions{
			ID: *r.TargetRestrictionsID, ConeDegrees: valueOrZero(r.ConeDegrees),
			MaxTargetLevel: valueOrZero(r.MaxTargetLevel), MaxTargets: valueOrZero(r.MaxTargets),
			TargetCreatureType: valueOrZero(r.TargetCreatureType), Targets: valueOrZero(r.Targets),
			Width: valueOrZero(r.Width),
		}
	}
	return variant
}

func valueOrZero[T int32 | float32](value *T) T {
	if value == nil {
		return 0
	}
	return *value
}
