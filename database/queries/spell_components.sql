-- Canonical normalized rows produced by legacy Spell.dbc imports.

-- name: ClearSpellEffectsForDataset :exec
DELETE FROM dbc_spell_effects WHERE dataset_id = @dataset_id;

-- name: ClearSpellPowersForDataset :exec
DELETE FROM dbc_spell_powers WHERE dataset_id = @dataset_id;

-- name: ClearSpellVariantsForDataset :exec
DELETE FROM dbc_spell_variants WHERE dataset_id = @dataset_id;

-- name: CopyLegacySpellEffects :batchexec
INSERT INTO dbc_spell_effects (
  dataset_id, spell_id, difficulty_id, effect_index, source_id,
  bonus_coefficient_from_ap, coefficient, effect, effect_amplitude,
  effect_attributes, effect_aura, effect_aura_period, effect_base_points_f,
  effect_die_sides, effect_base_points, effect_points_per_combo,
  effect_base_dice, effect_dice_per_level, effect_bonus_coefficient,
  effect_chain_amplitude, effect_chain_targets, effect_item_type,
  effect_mechanic, effect_misc_value, effect_points_per_resource,
  effect_pos_facing, effect_radius_index, effect_real_points_per_level,
  effect_spell_class_mask, effect_trigger_spell,
  group_size_base_points_coefficient, node_field_12_0_0_63534_001,
  pvp_multiplier, resource_coefficient, scaling_class, implicit_target, variance
) VALUES (
  @dataset_id, @spell_id, @difficulty_id, @effect_index, @source_id,
  @bonus_coefficient_from_ap, @coefficient, @effect, @effect_amplitude,
  @effect_attributes, @effect_aura, @effect_aura_period, @effect_base_points_f,
  @effect_die_sides, @effect_base_points, @effect_points_per_combo,
  @effect_base_dice, @effect_dice_per_level, @effect_bonus_coefficient,
  @effect_chain_amplitude, @effect_chain_targets, @effect_item_type,
  @effect_mechanic, @effect_misc_value, @effect_points_per_resource,
  @effect_pos_facing, @effect_radius_index, @effect_real_points_per_level,
  @effect_spell_class_mask, @effect_trigger_spell,
  @group_size_base_points_coefficient, @node_field_12_0_0_63534_001,
  @pvp_multiplier, @resource_coefficient, @scaling_class, @implicit_target, @variance
);

-- name: CopyLegacySpellPowers :batchexec
INSERT INTO dbc_spell_powers (
  dataset_id, spell_id, order_index, source_id, alt_power_bar_id, mana_cost,
  mana_cost_per_level, mana_per_second, optional_cost, optional_cost_pct,
  power_cost_max_pct, power_cost_pct, power_display_id, power_pct_per_second,
  power_type, required_aura_spell_id
) VALUES (
  @dataset_id, @spell_id, @order_index, @source_id, @alt_power_bar_id, @mana_cost,
  @mana_cost_per_level, @mana_per_second, @optional_cost, @optional_cost_pct,
  @power_cost_max_pct, @power_cost_pct, @power_display_id, @power_pct_per_second,
  @power_type, @required_aura_spell_id
);

-- name: CopyLegacySpellVariants :batchexec
INSERT INTO dbc_spell_variants (dataset_id, spell_id, difficulty_id)
VALUES (@dataset_id, @spell_id, @difficulty_id);
