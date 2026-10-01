BEGIN;

-- Backfill datasets that still have only the pre-normalization dbc_spells
-- representation. A dataset is eligible only when all three normalized spell
-- component tables are empty, so this does not invent legacy components for a
-- partially or fully normalized modern dataset.
--
-- These deployments are maintained by the project owner and are refreshed with
-- the importer instead. Skipping them avoids a large startup data migration on
-- those installations.
CREATE TEMP TABLE legacy_spell_backfill_datasets (
    dataset_id UUID PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO legacy_spell_backfill_datasets (dataset_id)
SELECT d.id
FROM datasets d
-- Split modern clients use relational source tables and can legitimately omit
-- effects, powers, or variants. Only monolithic legacy Spell.dbc versions can
-- be reconstructed losslessly from the wide compatibility columns.
WHERE d.wow_version IN ('1.12.1', '2.4.3', '3.3.5a')
AND EXISTS (
    SELECT 1
    FROM dbc_spells s
    WHERE s.dataset_id = d.id
)
AND NOT EXISTS (
    SELECT 1
    FROM dbc_spell_effects e
    WHERE e.dataset_id = d.id
)
AND NOT EXISTS (
    SELECT 1
    FROM dbc_spell_powers p
    WHERE p.dataset_id = d.id
)
AND NOT EXISTS (
    SELECT 1
    FROM dbc_spell_variants v
    WHERE v.dataset_id = d.id
)
AND NOT EXISTS (
    SELECT 1
    FROM deployment_info di
    WHERE di.id IN (
        'fb7093cc-0d32-4cd3-9e8a-d8b7d2b5c411'::UUID,
        '18999931-b9c2-4a32-b597-afbccaff7a83'::UUID
    )
);

-- Legacy Spell.dbc has exactly three effect slots, including empty slots.
-- source_id=0 and difficulty_id=0 match the current legacy importer.
INSERT INTO dbc_spell_effects (
    dataset_id,
    spell_id,
    difficulty_id,
    effect_index,
    source_id,
    bonus_coefficient_from_ap,
    coefficient,
    effect,
    effect_amplitude,
    effect_attributes,
    effect_aura,
    effect_aura_period,
    effect_base_points_f,
    effect_bonus_coefficient,
    effect_chain_amplitude,
    effect_chain_targets,
    effect_item_type,
    effect_mechanic,
    effect_misc_value,
    effect_points_per_resource,
    effect_pos_facing,
    effect_radius_index,
    effect_real_points_per_level,
    effect_spell_class_mask,
    effect_trigger_spell,
    group_size_base_points_coefficient,
    node_field_12_0_0_63534_001,
    pvp_multiplier,
    resource_coefficient,
    scaling_class,
    implicit_target,
    variance,
    effect_die_sides,
    effect_base_points,
    effect_points_per_combo,
    effect_base_dice,
    effect_dice_per_level
)
SELECT
    s.dataset_id,
    s.spell_id,
    0,
    slot.effect_index,
    0,
    0,
    0,
    slot.effect,
    slot.effect_amplitude,
    0,
    slot.effect_aura,
    slot.effect_aura_period,
    COALESCE(s.effect_base_points_f[slot.effect_index + 1], slot.effect_base_points + 1),
    0,
    slot.effect_chain_amplitude,
    slot.effect_chain_targets,
    slot.effect_item_type,
    slot.effect_mechanic,
    ARRAY[slot.effect_misc_value],
    0,
    0,
    ARRAY[slot.effect_radius_index],
    slot.effect_real_points_per_level,
    ARRAY[]::INTEGER[],
    slot.effect_trigger_spell,
    0,
    0,
    0,
    0,
    0,
    ARRAY[slot.implicit_target_a, slot.implicit_target_b],
    0,
    slot.effect_die_sides,
    slot.effect_base_points,
    slot.effect_points_per_combo,
    slot.effect_base_dice,
    slot.effect_dice_per_level
FROM dbc_spells s
JOIN legacy_spell_backfill_datasets selected ON selected.dataset_id = s.dataset_id
CROSS JOIN LATERAL (
    VALUES
        (
            0,
            s.effect_0,
            s.effect_amplitude_0,
            s.effect_aura_0,
            s.effect_aura_period_0,
            s.effect_chain_amplitude_0,
            s.effect_chain_targets_0,
            s.effect_item_type_0,
            s.effect_mechanic_0,
            s.effect_misc_value_0,
            s.effect_radius_index_0,
            s.effect_real_pts_per_level_0,
            s.effect_trigger_spell_0,
            s.implicit_target_a_0,
            s.implicit_target_b_0,
            s.effect_die_sides_0,
            s.effect_base_points_0,
            s.effect_pts_per_combo_0,
            s.effect_base_dice_0,
            s.effect_dice_per_level_0
        ),
        (
            1,
            s.effect_1,
            s.effect_amplitude_1,
            s.effect_aura_1,
            s.effect_aura_period_1,
            s.effect_chain_amplitude_1,
            s.effect_chain_targets_1,
            s.effect_item_type_1,
            s.effect_mechanic_1,
            s.effect_misc_value_1,
            s.effect_radius_index_1,
            s.effect_real_pts_per_level_1,
            s.effect_trigger_spell_1,
            s.implicit_target_a_1,
            s.implicit_target_b_1,
            s.effect_die_sides_1,
            s.effect_base_points_1,
            s.effect_pts_per_combo_1,
            s.effect_base_dice_1,
            s.effect_dice_per_level_1
        ),
        (
            2,
            s.effect_2,
            s.effect_amplitude_2,
            s.effect_aura_2,
            s.effect_aura_period_2,
            s.effect_chain_amplitude_2,
            s.effect_chain_targets_2,
            s.effect_item_type_2,
            s.effect_mechanic_2,
            s.effect_misc_value_2,
            s.effect_radius_index_2,
            s.effect_real_pts_per_level_2,
            s.effect_trigger_spell_2,
            s.implicit_target_a_2,
            s.implicit_target_b_2,
            s.effect_die_sides_2,
            s.effect_base_points_2,
            s.effect_pts_per_combo_2,
            s.effect_base_dice_2,
            s.effect_dice_per_level_2
        )
) AS slot(
    effect_index,
    effect,
    effect_amplitude,
    effect_aura,
    effect_aura_period,
    effect_chain_amplitude,
    effect_chain_targets,
    effect_item_type,
    effect_mechanic,
    effect_misc_value,
    effect_radius_index,
    effect_real_points_per_level,
    effect_trigger_spell,
    implicit_target_a,
    implicit_target_b,
    effect_die_sides,
    effect_base_points,
    effect_points_per_combo,
    effect_base_dice,
    effect_dice_per_level
);

-- Legacy Spell.dbc stores one scalar resource cost. Preserve it as the default
-- order-zero normalized power row, including an all-zero cost row.
INSERT INTO dbc_spell_powers (
    dataset_id,
    spell_id,
    order_index,
    source_id,
    alt_power_bar_id,
    mana_cost,
    mana_cost_per_level,
    mana_per_second,
    optional_cost,
    optional_cost_pct,
    power_cost_max_pct,
    power_cost_pct,
    power_display_id,
    power_pct_per_second,
    power_type,
    required_aura_spell_id
)
SELECT
    s.dataset_id,
    s.spell_id,
    0,
    0,
    0,
    s.mana_cost,
    s.mana_cost_per_level,
    s.mana_per_second,
    0,
    0,
    0,
    s.mana_cost_pct,
    0,
    0,
    s.power_type,
    0
FROM dbc_spells s
JOIN legacy_spell_backfill_datasets selected ON selected.dataset_id = s.dataset_id;

-- Legacy rows are the difficulty-zero projection.
INSERT INTO dbc_spell_variants (dataset_id, spell_id, difficulty_id)
SELECT s.dataset_id, s.spell_id, 0
FROM dbc_spells s
JOIN legacy_spell_backfill_datasets selected ON selected.dataset_id = s.dataset_id;

COMMIT;
