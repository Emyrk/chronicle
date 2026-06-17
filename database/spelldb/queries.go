package spelldb

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// columns is the ordered list of dbc_spells columns, used for both INSERT and
// SELECT to keep them in sync. Generated from SpellRow's db tags.
var columns = []string{
	"dataset_id", "spell_id",
	"name", "name_subtext", "description", "aura_description",
	"spell_icon_id", "active_icon_id",
	"max_level", "base_level", "spell_level", "category", "max_target_level",
	"school", "spell_priority", "stance_bar_order",
	"proc_type_mask", "proc_flags", "proc_chance", "proc_charges",
	"speed", "dispel_type", "aura_interrupt_flags", "modal_next_spell",
	"interrupt_flags", "cumulative_aura", "mechanic", "defense_type",
	"caster_aura_state", "target_aura_state", "max_targets",
	"target_creature_type", "requires_spell_focus",
	"power_type", "mana_cost", "mana_cost_pct", "mana_cost_per_level", "mana_per_second",
	"reagent", "reagent_count",
	"casting_time_index", "recovery_time_ms", "start_recovery_category",
	"start_recovery_time_ms", "category_recovery_time_ms",
	"range_index", "duration_index",
	"attributes", "targets", "spell_class_set", "spell_class_mask",
	"equipped_item_inv_types", "equipped_item_class", "equipped_item_subclass",
	"prevention_type",
	// Effect 0
	"effect_0", "effect_die_sides_0", "effect_real_pts_per_level_0",
	"effect_base_points_0", "effect_mechanic_0", "effect_radius_index_0",
	"effect_aura_0", "effect_aura_period_0", "effect_amplitude_0",
	"effect_chain_targets_0", "effect_item_type_0", "effect_misc_value_0",
	"effect_trigger_spell_0", "effect_pts_per_combo_0",
	"effect_base_dice_0", "effect_dice_per_level_0", "effect_chain_amplitude_0",
	"implicit_target_a_0", "implicit_target_b_0",
	// Effect 1
	"effect_1", "effect_die_sides_1", "effect_real_pts_per_level_1",
	"effect_base_points_1", "effect_mechanic_1", "effect_radius_index_1",
	"effect_aura_1", "effect_aura_period_1", "effect_amplitude_1",
	"effect_chain_targets_1", "effect_item_type_1", "effect_misc_value_1",
	"effect_trigger_spell_1", "effect_pts_per_combo_1",
	"effect_base_dice_1", "effect_dice_per_level_1", "effect_chain_amplitude_1",
	"implicit_target_a_1", "implicit_target_b_1",
	// Effect 2
	"effect_2", "effect_die_sides_2", "effect_real_pts_per_level_2",
	"effect_base_points_2", "effect_mechanic_2", "effect_radius_index_2",
	"effect_aura_2", "effect_aura_period_2", "effect_amplitude_2",
	"effect_chain_targets_2", "effect_item_type_2", "effect_misc_value_2",
	"effect_trigger_spell_2", "effect_pts_per_combo_2",
	"effect_base_dice_2", "effect_dice_per_level_2", "effect_chain_amplitude_2",
	"implicit_target_a_2", "implicit_target_b_2",
	// Totem
	"totems_id", "totem",
	// Other
	"cast_ui", "required_aura_vision", "min_faction_id", "min_reputation",
	"spell_visual_id",
	// 3.3.5a+
	"rune_cost_id", "spell_missile_id", "description_variables_id",
	"caster_aura_spell", "target_aura_spell",
	"exclude_caster_aura_spell", "exclude_target_aura_spell",
	"exclude_caster_aura_state", "exclude_target_aura_state",
	"mana_per_second_per_level",
}

// values returns the SpellRow fields as a flat slice matching the columns order.
func (r *SpellRow) values() []any {
	return []any{
		r.DatasetID, r.SpellID,
		r.Name, r.NameSubtext, r.Description, r.AuraDescription,
		r.SpellIconID, r.ActiveIconID,
		r.MaxLevel, r.BaseLevel, r.SpellLevel, r.Category, r.MaxTargetLevel,
		r.School, r.SpellPriority, r.StanceBarOrder,
		r.ProcTypeMask, r.ProcFlags, r.ProcChance, r.ProcCharges,
		r.Speed, r.DispelType, r.AuraInterruptFlags, r.ModalNextSpell,
		r.InterruptFlags, r.CumulativeAura, r.Mechanic, r.DefenseType,
		r.CasterAuraState, r.TargetAuraState, r.MaxTargets,
		r.TargetCreatureType, r.RequiresSpellFocus,
		r.PowerType, r.ManaCost, r.ManaCostPct, r.ManaCostPerLevel, r.ManaPerSecond,
		r.Reagent, r.ReagentCount,
		r.CastingTimeIndex, r.RecoveryTimeMs, r.StartRecoveryCategory,
		r.StartRecoveryTimeMs, r.CategoryRecoveryTimeMs,
		r.RangeIndex, r.DurationIndex,
		r.Attributes, r.Targets, r.SpellClassSet, r.SpellClassMask,
		r.EquippedItemInvTypes, r.EquippedItemClass, r.EquippedItemSubclass,
		r.PreventionType,
		// Effect 0
		r.Effect0, r.EffectDieSides0, r.EffectRealPtsPerLevel0,
		r.EffectBasePoints0, r.EffectMechanic0, r.EffectRadiusIndex0,
		r.EffectAura0, r.EffectAuraPeriod0, r.EffectAmplitude0,
		r.EffectChainTargets0, r.EffectItemType0, r.EffectMiscValue0,
		r.EffectTriggerSpell0, r.EffectPtsPerCombo0,
		r.EffectBaseDice0, r.EffectDicePerLevel0, r.EffectChainAmplitude0,
		r.ImplicitTargetA0, r.ImplicitTargetB0,
		// Effect 1
		r.Effect1, r.EffectDieSides1, r.EffectRealPtsPerLevel1,
		r.EffectBasePoints1, r.EffectMechanic1, r.EffectRadiusIndex1,
		r.EffectAura1, r.EffectAuraPeriod1, r.EffectAmplitude1,
		r.EffectChainTargets1, r.EffectItemType1, r.EffectMiscValue1,
		r.EffectTriggerSpell1, r.EffectPtsPerCombo1,
		r.EffectBaseDice1, r.EffectDicePerLevel1, r.EffectChainAmplitude1,
		r.ImplicitTargetA1, r.ImplicitTargetB1,
		// Effect 2
		r.Effect2, r.EffectDieSides2, r.EffectRealPtsPerLevel2,
		r.EffectBasePoints2, r.EffectMechanic2, r.EffectRadiusIndex2,
		r.EffectAura2, r.EffectAuraPeriod2, r.EffectAmplitude2,
		r.EffectChainTargets2, r.EffectItemType2, r.EffectMiscValue2,
		r.EffectTriggerSpell2, r.EffectPtsPerCombo2,
		r.EffectBaseDice2, r.EffectDicePerLevel2, r.EffectChainAmplitude2,
		r.ImplicitTargetA2, r.ImplicitTargetB2,
		// Totem
		r.TotemsID, r.Totem,
		// Other
		r.CastUI, r.RequiredAuraVision, r.MinFactionID, r.MinReputation,
		r.SpellVisualID,
		// 3.3.5a+
		r.RuneCostID, r.SpellMissileID, r.DescriptionVariablesID,
		r.CasterAuraSpell, r.TargetAuraSpell,
		r.ExcludeCasterAuraSpell, r.ExcludeTargetAuraSpell,
		r.ExcludeCasterAuraState, r.ExcludeTargetAuraState,
		r.ManaPerSecondPerLevel,
	}
}

// scanDests returns pointers to all SpellRow fields in column order for pgx row scanning.
func (r *SpellRow) scanDests() []any {
	return []any{
		&r.DatasetID, &r.SpellID,
		&r.Name, &r.NameSubtext, &r.Description, &r.AuraDescription,
		&r.SpellIconID, &r.ActiveIconID,
		&r.MaxLevel, &r.BaseLevel, &r.SpellLevel, &r.Category, &r.MaxTargetLevel,
		&r.School, &r.SpellPriority, &r.StanceBarOrder,
		&r.ProcTypeMask, &r.ProcFlags, &r.ProcChance, &r.ProcCharges,
		&r.Speed, &r.DispelType, &r.AuraInterruptFlags, &r.ModalNextSpell,
		&r.InterruptFlags, &r.CumulativeAura, &r.Mechanic, &r.DefenseType,
		&r.CasterAuraState, &r.TargetAuraState, &r.MaxTargets,
		&r.TargetCreatureType, &r.RequiresSpellFocus,
		&r.PowerType, &r.ManaCost, &r.ManaCostPct, &r.ManaCostPerLevel, &r.ManaPerSecond,
		&r.Reagent, &r.ReagentCount,
		&r.CastingTimeIndex, &r.RecoveryTimeMs, &r.StartRecoveryCategory,
		&r.StartRecoveryTimeMs, &r.CategoryRecoveryTimeMs,
		&r.RangeIndex, &r.DurationIndex,
		&r.Attributes, &r.Targets, &r.SpellClassSet, &r.SpellClassMask,
		&r.EquippedItemInvTypes, &r.EquippedItemClass, &r.EquippedItemSubclass,
		&r.PreventionType,
		// Effect 0
		&r.Effect0, &r.EffectDieSides0, &r.EffectRealPtsPerLevel0,
		&r.EffectBasePoints0, &r.EffectMechanic0, &r.EffectRadiusIndex0,
		&r.EffectAura0, &r.EffectAuraPeriod0, &r.EffectAmplitude0,
		&r.EffectChainTargets0, &r.EffectItemType0, &r.EffectMiscValue0,
		&r.EffectTriggerSpell0, &r.EffectPtsPerCombo0,
		&r.EffectBaseDice0, &r.EffectDicePerLevel0, &r.EffectChainAmplitude0,
		&r.ImplicitTargetA0, &r.ImplicitTargetB0,
		// Effect 1
		&r.Effect1, &r.EffectDieSides1, &r.EffectRealPtsPerLevel1,
		&r.EffectBasePoints1, &r.EffectMechanic1, &r.EffectRadiusIndex1,
		&r.EffectAura1, &r.EffectAuraPeriod1, &r.EffectAmplitude1,
		&r.EffectChainTargets1, &r.EffectItemType1, &r.EffectMiscValue1,
		&r.EffectTriggerSpell1, &r.EffectPtsPerCombo1,
		&r.EffectBaseDice1, &r.EffectDicePerLevel1, &r.EffectChainAmplitude1,
		&r.ImplicitTargetA1, &r.ImplicitTargetB1,
		// Effect 2
		&r.Effect2, &r.EffectDieSides2, &r.EffectRealPtsPerLevel2,
		&r.EffectBasePoints2, &r.EffectMechanic2, &r.EffectRadiusIndex2,
		&r.EffectAura2, &r.EffectAuraPeriod2, &r.EffectAmplitude2,
		&r.EffectChainTargets2, &r.EffectItemType2, &r.EffectMiscValue2,
		&r.EffectTriggerSpell2, &r.EffectPtsPerCombo2,
		&r.EffectBaseDice2, &r.EffectDicePerLevel2, &r.EffectChainAmplitude2,
		&r.ImplicitTargetA2, &r.ImplicitTargetB2,
		// Totem
		&r.TotemsID, &r.Totem,
		// Other
		&r.CastUI, &r.RequiredAuraVision, &r.MinFactionID, &r.MinReputation,
		&r.SpellVisualID,
		// 3.3.5a+
		&r.RuneCostID, &r.SpellMissileID, &r.DescriptionVariablesID,
		&r.CasterAuraSpell, &r.TargetAuraSpell,
		&r.ExcludeCasterAuraSpell, &r.ExcludeTargetAuraSpell,
		&r.ExcludeCasterAuraState, &r.ExcludeTargetAuraState,
		&r.ManaPerSecondPerLevel,
	}
}

// scanDestsWithJoins returns scanDests plus the JOINed nullable fields in
// the order matching joinColumnsSQL.
func (r *SpellRow) scanDestsWithJoins() []any {
	dests := r.scanDests()
	return append(dests,
		&r.CtBase, &r.CtPerLevel, &r.CtMinimum,
		&r.DurBase, &r.DurPerLevel, &r.DurMax,
		&r.RangeMin, &r.RangeMax, &r.RangeFlags, &r.RangeName,
		&r.IconTexture, &r.ActiveIconTexture,
		&r.CatFlags, &r.CatUsesPerWeek, &r.CatName,
		&r.CatMaxCharges, &r.CatChargeRecoveryTime, &r.CatTypeMask,
		&r.R0Radius, &r.R0RadiusPerLevel, &r.R0RadiusMin, &r.R0RadiusMax,
		&r.R1Radius, &r.R1RadiusPerLevel, &r.R1RadiusMin, &r.R1RadiusMax,
		&r.R2Radius, &r.R2RadiusPerLevel, &r.R2RadiusMin, &r.R2RadiusMax,
		&r.FocusName,
	)
}

// columnsSQL builds a comma-separated column list.
func columnsSQL() string {
	s := ""
	for i, c := range columns {
		if i > 0 {
			s += ", "
		}
		s += c
	}
	return s
}

// columnsSQLPrefixed builds a comma-separated column list with a table prefix.
func columnsSQLPrefixed(prefix string) string {
	s := ""
	for i, c := range columns {
		if i > 0 {
			s += ", "
		}
		s += prefix + "." + c
	}
	return s
}

var joinSQL = ` LEFT JOIN dbc_spell_cast_times ct    ON ct.dataset_id = s.dataset_id AND ct.id = s.casting_time_index
 LEFT JOIN dbc_spell_durations sd     ON sd.dataset_id = s.dataset_id AND sd.id = s.duration_index
 LEFT JOIN dbc_spell_ranges sr        ON sr.dataset_id = s.dataset_id AND sr.id = s.range_index
 LEFT JOIN dbc_spell_icons si         ON si.dataset_id = s.dataset_id AND si.id = s.spell_icon_id
 LEFT JOIN dbc_spell_icons sia        ON sia.dataset_id = s.dataset_id AND sia.id = s.active_icon_id
 LEFT JOIN dbc_spell_categories sc    ON sc.dataset_id = s.dataset_id AND sc.id = s.category
 LEFT JOIN dbc_spell_radii r0         ON r0.dataset_id = s.dataset_id AND r0.id = s.effect_radius_index_0
 LEFT JOIN dbc_spell_radii r1         ON r1.dataset_id = s.dataset_id AND r1.id = s.effect_radius_index_1
 LEFT JOIN dbc_spell_radii r2         ON r2.dataset_id = s.dataset_id AND r2.id = s.effect_radius_index_2
 LEFT JOIN dbc_spell_focus_objects sfo ON sfo.dataset_id = s.dataset_id AND sfo.id = s.requires_spell_focus`

var joinColumnsSQL = `,
    ct.base AS ct_base, ct.per_level AS ct_per_level, ct.minimum AS ct_minimum,
    sd.duration AS dur_base, sd.duration_per_level AS dur_per_level, sd.max_duration AS dur_max,
    sr.range_min, sr.range_max, sr.flags AS range_flags, sr.name AS range_name,
    si.texture_filename AS icon_texture,
    sia.texture_filename AS active_icon_texture,
    sc.flags AS cat_flags, sc.uses_per_week, sc.name AS cat_name,
    sc.max_charges, sc.charge_recovery_time, sc.type_mask AS cat_type_mask,
    r0.radius AS r0_radius, r0.radius_per_level AS r0_rpl, r0.radius_min AS r0_min, r0.radius_max AS r0_max,
    r1.radius AS r1_radius, r1.radius_per_level AS r1_rpl, r1.radius_min AS r1_min, r1.radius_max AS r1_max,
    r2.radius AS r2_radius, r2.radius_per_level AS r2_rpl, r2.radius_min AS r2_min, r2.radius_max AS r2_max,
    sfo.name AS focus_name`

// placeholdersSQL builds $1, $2, ... $N for the column count.
func placeholdersSQL() string {
	s := ""
	for i := range columns {
		if i > 0 {
			s += ", "
		}
		s += fmt.Sprintf("$%d", i+1)
	}
	return s
}

// InsertSpell inserts a single spell row. On conflict (dataset_id, spell_id)
// the row is updated (upsert).
func InsertSpell(ctx context.Context, pool *pgxpool.Pool, row *SpellRow) error {
	sql := fmt.Sprintf(
		`INSERT INTO dbc_spells (%s) VALUES (%s)
		 ON CONFLICT (dataset_id, spell_id) DO UPDATE SET %s`,
		columnsSQL(), placeholdersSQL(), updateSetSQL(),
	)
	_, err := pool.Exec(ctx, sql, row.values()...)
	return err
}

// GetSpell retrieves a single spell by dataset + spell ID, LEFT JOINing
// resolved metadata from companion DBC tables.
func GetSpell(ctx context.Context, pool *pgxpool.Pool, datasetID uuid.UUID, spellID int32) (*SpellRow, error) {
	sql := fmt.Sprintf(
		`SELECT %s%s FROM dbc_spells s%s WHERE s.dataset_id = $1 AND s.spell_id = $2`,
		columnsSQLPrefixed("s"), joinColumnsSQL, joinSQL,
	)
	var row SpellRow
	err := pool.QueryRow(ctx, sql, datasetID, spellID).Scan(row.scanDestsWithJoins()...)
	if err != nil {
		return nil, err
	}
	return &row, nil
}

// GetSpellsByName retrieves all spells matching a name within a dataset,
// LEFT JOINing resolved metadata from companion DBC tables.
func GetSpellsByName(ctx context.Context, pool *pgxpool.Pool, datasetID uuid.UUID, name string) ([]SpellRow, error) {
	sql := fmt.Sprintf(
		`SELECT %s%s FROM dbc_spells s%s WHERE s.dataset_id = $1 AND s.name = $2`,
		columnsSQLPrefixed("s"), joinColumnsSQL, joinSQL,
	)
	rows, err := pool.Query(ctx, sql, datasetID, name)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []SpellRow
	for rows.Next() {
		var row SpellRow
		if err := rows.Scan(row.scanDestsWithJoins()...); err != nil {
			return nil, err
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

// UpsertBatch inserts multiple spells in a single round-trip using pgx Batch.
func UpsertBatch(ctx context.Context, pool *pgxpool.Pool, rows []SpellRow) error {
	if len(rows) == 0 {
		return nil
	}
	sql := fmt.Sprintf(
		`INSERT INTO dbc_spells (%s) VALUES (%s)
		 ON CONFLICT (dataset_id, spell_id) DO UPDATE SET %s`,
		columnsSQL(), placeholdersSQL(), updateSetSQL(),
	)
	batch := &pgx.Batch{}
	for i := range rows {
		batch.Queue(sql, rows[i].values()...)
	}
	br := pool.SendBatch(ctx, batch)
	defer func() { _ = br.Close() }()
	for range rows {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("upsert spell batch: %w", err)
		}
	}
	return nil
}

// updateSetSQL builds the SET clause for ON CONFLICT DO UPDATE, skipping
// the PK columns (dataset_id, spell_id).
func updateSetSQL() string {
	s := ""
	for _, c := range columns[2:] { // skip dataset_id, spell_id
		if s != "" {
			s += ", "
		}
		s += c + " = EXCLUDED." + c
	}
	return s
}
