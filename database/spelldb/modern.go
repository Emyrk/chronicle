package spelldb

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func decodeModernSpellComponents(row *SpellRow, effectsJSON, powersJSON, variantsJSON []byte) error {
	if err := json.Unmarshal(effectsJSON, &row.Effects); err != nil {
		return fmt.Errorf("decode spell effects: %w", err)
	}
	if err := json.Unmarshal(powersJSON, &row.Powers); err != nil {
		return fmt.Errorf("decode spell powers: %w", err)
	}
	var variantRows []modernSpellVariantRow
	if err := json.Unmarshal(variantsJSON, &variantRows); err != nil {
		return fmt.Errorf("decode spell variants: %w", err)
	}
	row.Variants = make([]chrondbc.SpellVariant, 0, len(variantRows))
	for _, variantRow := range variantRows {
		row.Variants = append(row.Variants, variantRow.toModernSpellVariant())
	}
	return nil
}

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
		SELECT se.dataset_id, spell_id, difficulty_id, effect_index, source_id,
			bonus_coefficient_from_ap, coefficient, effect, effect_amplitude,
			effect_attributes, effect_aura, effect_aura_period, effect_base_points_f,
			effect_die_sides, effect_base_points, effect_points_per_combo,
			effect_base_dice, effect_dice_per_level,
			effect_bonus_coefficient, effect_chain_amplitude, effect_chain_targets,
			effect_item_type, effect_mechanic, effect_misc_value,
			effect_points_per_resource, effect_pos_facing, effect_radius_index,
			effect_real_points_per_level, effect_spell_class_mask,
			effect_trigger_spell, group_size_base_points_coefficient,
			node_field_12_0_0_63534_001, pvp_multiplier, resource_coefficient,
			scaling_class, implicit_target, variance,
			r.radius, r.radius_per_level, r.radius_min, r.radius_max
		FROM dbc_spell_effects se
		LEFT JOIN dbc_spell_radii r
			ON r.dataset_id = se.dataset_id AND r.id = se.effect_radius_index[1]
		WHERE se.dataset_id = $1 AND se.spell_id = $2
		ORDER BY se.difficulty_id, se.effect_index, se.source_id
	`, datasetID, spellID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []chrondbc.SpellEffect
	for rows.Next() {
		var effect chrondbc.SpellEffect
		var radius, radiusPerLevel, radiusMin, radiusMax *float32
		if err := rows.Scan(
			&effect.DatasetID, &effect.SpellID,
			&effect.DifficultyID, &effect.EffectIndex, &effect.SourceID,
			&effect.BonusCoefficientFromAP, &effect.Coefficient, &effect.Effect,
			&effect.EffectAmplitude, &effect.EffectAttributes, &effect.EffectAura,
			&effect.EffectAuraPeriod, &effect.EffectBasePointsF,
			&effect.EffectDieSides, &effect.EffectBasePoints, &effect.EffectPointsPerCombo,
			&effect.EffectBaseDice, &effect.EffectDicePerLevel,
			&effect.EffectBonusCoefficient, &effect.EffectChainAmplitude,
			&effect.EffectChainTargets, &effect.EffectItemType, &effect.EffectMechanic,
			&effect.EffectMiscValue, &effect.EffectPointsPerResource,
			&effect.EffectPosFacing, &effect.EffectRadiusIndex,
			&effect.EffectRealPointsPerLevel, &effect.EffectSpellClassMask,
			&effect.EffectTriggerSpell, &effect.GroupSizeBasePointsCoefficient,
			&effect.NodeField120063534001, &effect.PVPMultiplier,
			&effect.ResourceCoefficient, &effect.ScalingClass,
			&effect.ImplicitTarget, &effect.Variance,
			&radius, &radiusPerLevel, &radiusMin, &radiusMax,
		); err != nil {
			return nil, err
		}
		if radius != nil && len(effect.EffectRadiusIndex) > 0 {
			effect.EffectRadius = dbcmem.SpellRadius{
				ID:             effect.EffectRadiusIndex[0],
				Radius:         *radius,
				RadiusPerLevel: derefOrF(radiusPerLevel),
				RadiusMin:      derefOrF(radiusMin),
				RadiusMax:      derefOrF(radiusMax),
			}
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
	DatasetID    uuid.UUID `json:"dataset_id"`
	SpellID      int32     `json:"spell_id"`
	DifficultyID int32     `json:"difficulty_id"`

	MiscID                           *int32   `json:"misc_id"`
	ActiveIconFileDataID             *int32   `json:"active_icon_file_data_id"`
	ActiveSpellVisualScript          *int32   `json:"active_spell_visual_script"`
	Attributes                       []int32  `json:"attributes"`
	CastingTimeIndex                 *int32   `json:"casting_time_index"`
	ContentTuningID                  *int32   `json:"content_tuning_id"`
	DurationIndex                    *int32   `json:"duration_index"`
	LaunchDelay                      *float32 `json:"launch_delay"`
	MinDuration                      *float32 `json:"min_duration"`
	PVPDurationIndex                 *int32   `json:"pvp_duration_index"`
	RangeIndex                       *int32   `json:"range_index"`
	SchoolMask                       *int32   `json:"school_mask"`
	ShowFutureSpellPlayerConditionID *int32   `json:"show_future_spell_player_condition_id"`
	Speed                            *float32 `json:"speed"`
	SpellIconFileDataID              *int32   `json:"spell_icon_file_data_id"`
	SpellVisualScript                *int32   `json:"spell_visual_script"`

	AuraOptionsID         *int32  `json:"aura_options_id"`
	CumulativeAura        *int32  `json:"cumulative_aura"`
	ProcCategoryRecovery  *int32  `json:"proc_category_recovery"`
	ProcChance            *int32  `json:"proc_chance"`
	ProcCharges           *int32  `json:"proc_charges"`
	ProcTypeMask          []int32 `json:"proc_type_mask"`
	SpellProcsPerMinuteID *int32  `json:"spell_procs_per_minute_id"`

	AuraRestrictionsID     *int32 `json:"aura_restrictions_id"`
	CasterAuraSpell        *int32 `json:"caster_aura_spell"`
	CasterAuraState        *int32 `json:"caster_aura_state"`
	CasterAuraType         *int32 `json:"caster_aura_type"`
	ExcludeCasterAuraSpell *int32 `json:"exclude_caster_aura_spell"`
	ExcludeCasterAuraState *int32 `json:"exclude_caster_aura_state"`
	ExcludeCasterAuraType  *int32 `json:"exclude_caster_aura_type"`
	ExcludeTargetAuraSpell *int32 `json:"exclude_target_aura_spell"`
	ExcludeTargetAuraState *int32 `json:"exclude_target_aura_state"`
	ExcludeTargetAuraType  *int32 `json:"exclude_target_aura_type"`
	TargetAuraSpell        *int32 `json:"target_aura_spell"`
	TargetAuraState        *int32 `json:"target_aura_state"`
	TargetAuraType         *int32 `json:"target_aura_type"`

	ClassOptionsID *int32  `json:"class_options_id"`
	ModalNextSpell *int32  `json:"modal_next_spell"`
	SpellClassSet  *int32  `json:"spell_class_set"`
	SpellClassMask []int32 `json:"spell_class_mask"`

	InterruptsID          *int32  `json:"interrupts_id"`
	AuraInterruptFlags    []int32 `json:"aura_interrupt_flags"`
	ChannelInterruptFlags []int32 `json:"channel_interrupt_flags"`
	InterruptFlags        *int32  `json:"interrupt_flags"`

	CategoriesID          *int32 `json:"categories_id"`
	Category              *int32 `json:"category"`
	ChargeCategory        *int32 `json:"charge_category"`
	DefenseType           *int32 `json:"defense_type"`
	DiminishType          *int32 `json:"diminish_type"`
	DispelType            *int32 `json:"dispel_type"`
	Mechanic              *int32 `json:"mechanic"`
	PreventionType        *int32 `json:"prevention_type"`
	StartRecoveryCategory *int32 `json:"start_recovery_category"`

	CooldownsID          *int32 `json:"cooldowns_id"`
	AuraSpellID          *int32 `json:"aura_spell_id"`
	CategoryRecoveryTime *int32 `json:"category_recovery_time"`
	RecoveryTime         *int32 `json:"recovery_time"`
	StartRecoveryTime    *int32 `json:"start_recovery_time"`

	LevelsID            *int32 `json:"levels_id"`
	BaseLevel           *int32 `json:"base_level"`
	MaxLevel            *int32 `json:"max_level"`
	MaxPassiveAuraLevel *int32 `json:"max_passive_aura_level"`
	SpellLevel          *int32 `json:"spell_level"`

	TargetRestrictionsID *int32   `json:"target_restrictions_id"`
	ConeDegrees          *float32 `json:"cone_degrees"`
	MaxTargetLevel       *int32   `json:"max_target_level"`
	MaxTargets           *int32   `json:"max_targets"`
	TargetCreatureType   *int32   `json:"target_creature_type"`
	Targets              *int32   `json:"targets"`
	Width                *float32 `json:"width"`
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
