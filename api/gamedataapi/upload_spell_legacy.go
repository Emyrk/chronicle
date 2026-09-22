package gamedataapi

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/google/uuid"
)

func persistLegacySpells(ctx context.Context, db database.DBTX, datasetID uuid.UUID, spells []chrondbc.Spell) error {
	rows := make([]spelldb.SpellRow, len(spells))
	for i := range spells {
		rows[i] = spelldb.FromSpell(datasetID, &spells[i])
	}

	const batchSize = 500
	for i := 0; i < len(rows); i += batchSize {
		end := min(i+batchSize, len(rows))
		if err := spelldb.UpsertBatch(ctx, db, rows[i:end]); err != nil {
			return fmt.Errorf("upsert spells at %d: %w", i, err)
		}
	}

	for _, table := range []string{"dbc_spell_effects", "dbc_spell_powers", "dbc_spell_variants"} {
		if _, err := db.Exec(ctx, "DELETE FROM "+table+" WHERE dataset_id=$1", datasetID); err != nil {
			return fmt.Errorf("clear %s: %w", table, err)
		}
	}

	effectSQL := insertSQL("dbc_spell_effects", []string{
		"dataset_id", "spell_id", "difficulty_id", "effect_index", "source_id", "bonus_coefficient_from_ap", "coefficient", "effect", "effect_amplitude", "effect_attributes", "effect_aura", "effect_aura_period", "effect_base_points_f", "effect_bonus_coefficient", "effect_chain_amplitude", "effect_chain_targets", "effect_item_type", "effect_mechanic", "effect_misc_value", "effect_points_per_resource", "effect_pos_facing", "effect_radius_index", "effect_die_sides", "effect_base_dice", "effect_dice_per_level", "effect_real_points_per_level", "effect_spell_class_mask", "effect_trigger_spell", "group_size_base_points_coefficient", "node_field_12_0_0_63534_001", "pvp_multiplier", "resource_coefficient", "scaling_class", "implicit_target", "variance",
	})
	var normalizedRows [][]any
	for _, spell := range spells {
		for _, x := range spell.Effects {
			normalizedRows = append(normalizedRows, []any{datasetID, x.SpellID, x.DifficultyID, x.EffectIndex, x.SourceID, x.BonusCoefficientFromAP, x.Coefficient, x.Effect, x.EffectAmplitude, x.EffectAttributes, x.EffectAura, x.EffectAuraPeriod, x.EffectBasePointsF, x.EffectBonusCoefficient, x.EffectChainAmplitude, x.EffectChainTargets, x.EffectItemType, x.EffectMechanic, nonNilInts(x.EffectMiscValue), x.EffectPointsPerResource, x.EffectPosFacing, nonNilInts(x.EffectRadiusIndex), x.EffectDieSides, x.EffectBaseDice, x.EffectDicePerLevel, x.EffectRealPointsPerLevel, nonNilInts(x.EffectSpellClassMask), x.EffectTriggerSpell, x.GroupSizeBasePointsCoefficient, x.NodeField120063534001, x.PVPMultiplier, x.ResourceCoefficient, x.ScalingClass, nonNilInts(x.ImplicitTarget), x.Variance})
		}
	}
	if err := batchSQLRows(ctx, db, effectSQL, normalizedRows); err != nil {
		return fmt.Errorf("insert spell effects: %w", err)
	}

	powerSQL := insertSQL("dbc_spell_powers", []string{"dataset_id", "spell_id", "order_index", "source_id", "alt_power_bar_id", "mana_cost", "mana_cost_per_level", "mana_per_second", "optional_cost", "optional_cost_pct", "power_cost_max_pct", "power_cost_pct", "power_display_id", "power_pct_per_second", "power_type", "required_aura_spell_id"})
	normalizedRows = normalizedRows[:0]
	for _, spell := range spells {
		for _, x := range spell.Powers {
			normalizedRows = append(normalizedRows, []any{datasetID, x.SpellID, x.OrderIndex, x.SourceID, x.AltPowerBarID, x.ManaCost, x.ManaCostPerLevel, x.ManaPerSecond, x.OptionalCost, x.OptionalCostPct, x.PowerCostMaxPct, x.PowerCostPct, x.PowerDisplayID, x.PowerPctPerSecond, x.PowerType, x.RequiredAuraSpellID})
		}
	}
	if err := batchSQLRows(ctx, db, powerSQL, normalizedRows); err != nil {
		return fmt.Errorf("insert spell powers: %w", err)
	}

	variantColumns := []string{
		"dataset_id", "spell_id", "difficulty_id",
		"misc_id", "active_icon_file_data_id", "active_spell_visual_script", "attributes", "casting_time_index", "content_tuning_id", "duration_index", "launch_delay", "min_duration", "pvp_duration_index", "range_index", "school_mask", "show_future_spell_player_condition_id", "speed", "spell_icon_file_data_id", "spell_visual_script",
		"aura_options_id", "cumulative_aura", "proc_category_recovery", "proc_chance", "proc_charges", "proc_type_mask", "spell_procs_per_minute_id",
		"aura_restrictions_id", "caster_aura_spell", "caster_aura_state", "caster_aura_type", "exclude_caster_aura_spell", "exclude_caster_aura_state", "exclude_caster_aura_type", "exclude_target_aura_spell", "exclude_target_aura_state", "exclude_target_aura_type", "target_aura_spell", "target_aura_state", "target_aura_type",
		"class_options_id", "modal_next_spell", "spell_class_set", "spell_class_mask",
		"interrupts_id", "aura_interrupt_flags", "channel_interrupt_flags", "interrupt_flags",
		"categories_id", "category", "charge_category", "defense_type", "diminish_type", "dispel_type", "mechanic", "prevention_type", "start_recovery_category",
		"cooldowns_id", "aura_spell_id", "category_recovery_time", "recovery_time", "start_recovery_time",
		"levels_id", "base_level", "max_level", "max_passive_aura_level", "spell_level",
		"target_restrictions_id", "cone_degrees", "max_target_level", "max_targets", "target_creature_type", "targets", "width",
	}
	normalizedRows = normalizedRows[:0]
	for _, spell := range spells {
		for _, x := range spell.Variants {
			normalizedRows = append(normalizedRows, legacyVariantArgs(datasetID, x))
		}
	}
	if err := batchSQLRows(ctx, db, insertSQL("dbc_spell_variants", variantColumns), normalizedRows); err != nil {
		return fmt.Errorf("insert spell variants: %w", err)
	}
	return nil
}

func legacyVariantArgs(datasetID uuid.UUID, x chrondbc.SpellVariant) []any {
	a := []any{datasetID, x.SpellID, x.DifficultyID}
	if v := x.Misc; v != nil {
		a = append(a, v.ID, v.ActiveIconFileDataID, v.ActiveSpellVisualScript, nonNilInts(v.Attributes), v.CastingTimeIndex, v.ContentTuningID, v.DurationIndex, v.LaunchDelay, v.MinDuration, v.PVPDurationIndex, v.RangeIndex, v.SchoolMask, v.ShowFutureSpellPlayerConditionID, v.Speed, v.SpellIconFileDataID, v.SpellVisualScript)
	} else {
		a = appendNils(a, 16)
	}
	if v := x.AuraOptions; v != nil {
		a = append(a, v.ID, v.CumulativeAura, v.ProcCategoryRecovery, v.ProcChance, v.ProcCharges, nonNilInts(v.ProcTypeMask), v.SpellProcsPerMinuteID)
	} else {
		a = appendNils(a, 7)
	}
	if v := x.AuraRestrictions; v != nil {
		a = append(a, v.ID, v.CasterAuraSpell, v.CasterAuraState, v.CasterAuraType, v.ExcludeCasterAuraSpell, v.ExcludeCasterAuraState, v.ExcludeCasterAuraType, v.ExcludeTargetAuraSpell, v.ExcludeTargetAuraState, v.ExcludeTargetAuraType, v.TargetAuraSpell, v.TargetAuraState, v.TargetAuraType)
	} else {
		a = appendNils(a, 13)
	}
	if v := x.ClassOptions; v != nil {
		a = append(a, v.ID, v.ModalNextSpell, v.SpellClassSet, nonNilInts(v.SpellClassMask))
	} else {
		a = appendNils(a, 4)
	}
	if v := x.Interrupts; v != nil {
		a = append(a, v.ID, nonNilInts(v.AuraInterruptFlags), nonNilInts(v.ChannelInterruptFlags), v.InterruptFlags)
	} else {
		a = appendNils(a, 4)
	}
	if v := x.Categories; v != nil {
		a = append(a, v.ID, v.Category, v.ChargeCategory, v.DefenseType, v.DiminishType, v.DispelType, v.Mechanic, v.PreventionType, v.StartRecoveryCategory)
	} else {
		a = appendNils(a, 9)
	}
	if v := x.Cooldowns; v != nil {
		a = append(a, v.ID, v.AuraSpellID, v.CategoryRecoveryTime, v.RecoveryTime, v.StartRecoveryTime)
	} else {
		a = appendNils(a, 5)
	}
	if v := x.Levels; v != nil {
		a = append(a, v.ID, v.BaseLevel, v.MaxLevel, v.MaxPassiveAuraLevel, v.SpellLevel)
	} else {
		a = appendNils(a, 5)
	}
	if v := x.TargetRestrictions; v != nil {
		a = append(a, v.ID, v.ConeDegrees, v.MaxTargetLevel, v.MaxTargets, v.TargetCreatureType, v.Targets, v.Width)
	} else {
		a = appendNils(a, 7)
	}
	return a
}
