package spellcheck_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/spells"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/spellcheck"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Gophercraft/core/i18n"
	"github.com/stretchr/testify/require"
)

func TestCheckDatasetProductionFetchAndJSON(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	datasetID := servicedataset.DefaultDatasetID

	modern := chrondbc.Spell{ID: 910001, Name_lang: i18n.Text{i18n.English: "Checker Modern Spell"}}
	legacy := chrondbc.Spell{ID: 910002, Name_lang: i18n.Text{i18n.English: "Checker Legacy Spell"}}
	reserved := chrondbc.Spell{ID: chrondbc.SpellIDAutoAttack, Name_lang: i18n.Text{i18n.English: "Database Auto Attack"}}
	require.NoError(t, spelldb.UpsertBatch(ctx, pool, []spelldb.SpellRow{
		spelldb.FromSpell(datasetID, &modern),
		spelldb.FromSpell(datasetID, &legacy),
		spelldb.FromSpell(datasetID, &reserved),
	}))

	insertEffect := func(spellID chrondbc.SpellID, difficultyID, effectIndex, sourceID int32, basePoints float32) {
		t.Helper()
		_, err := pool.Exec(ctx, `
			INSERT INTO dbc_spell_effects (
				dataset_id, spell_id, difficulty_id, effect_index, source_id,
				bonus_coefficient_from_ap, coefficient, effect, effect_amplitude,
				effect_attributes, effect_aura, effect_aura_period, effect_base_points_f,
				effect_bonus_coefficient, effect_chain_amplitude, effect_chain_targets,
				effect_item_type, effect_mechanic, effect_misc_value,
				effect_points_per_resource, effect_pos_facing, effect_radius_index,
				effect_real_points_per_level, effect_spell_class_mask,
				effect_trigger_spell, group_size_base_points_coefficient,
				node_field_12_0_0_63534_001, pvp_multiplier, resource_coefficient,
				scaling_class, implicit_target, variance
			) VALUES (
				$1, $2, $3, $4, $5,
				0, 0, 2, 0,
				0, 0, 0, $6,
				0, 0, 0,
				0, 0, ARRAY[]::integer[],
				0, 0, ARRAY[]::integer[],
				0, ARRAY[]::integer[],
				0, 0,
				0, 0, 0,
				0, ARRAY[]::integer[], 0
			)
		`, datasetID, int32(spellID), difficultyID, effectIndex, sourceID, basePoints)
		require.NoError(t, err)
	}
	insertEffect(modern.ID, 0, 0, 100, 1.25)
	insertEffect(modern.ID, 0, 5, 105, -0.5)
	insertEffect(modern.ID, 0, 5, 106, 0)
	insertEffect(modern.ID, 198, 3, 203, 9.5)
	insertEffect(reserved.ID, 0, 0, 300, 4.25)

	_, err := pool.Exec(ctx, `
		INSERT INTO dbc_spell_powers (
			dataset_id, spell_id, order_index, source_id, alt_power_bar_id,
			mana_cost, mana_cost_per_level, mana_per_second, optional_cost,
			optional_cost_pct, power_cost_max_pct, power_cost_pct,
			power_display_id, power_pct_per_second, power_type, required_aura_spell_id
		) VALUES
			($1, $2, 0, 200, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
			($1, $2, 1, 201, 0, 200, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0)
	`, datasetID, int32(modern.ID))
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `
		INSERT INTO dbc_spell_variants (dataset_id, spell_id, difficulty_id)
		VALUES ($1, $2, 0), ($1, $2, 198)
	`, datasetID, int32(modern.ID))
	require.NoError(t, err)

	store := database.New(pool)
	spellFetcher := spells.NewFetcherDBOnly(ctx, pool, nil, nil, 100)

	report, err := spellcheck.CheckDataset(ctx, store, datasetID, spellFetcher)
	require.NoError(t, err)
	require.Equal(t, 3, report.Spells)
	require.Equal(t, 5, report.NormalizedEffects)
	require.Equal(t, 2, report.NormalizedPowers)
	require.Equal(t, 2, report.NormalizedVariants)
	require.Equal(t, 2, report.SparseEffectSets)
	require.Equal(t, 1, report.RepeatedEffectIndexes)
	require.Equal(t, 3, report.EffectsBeyondIndexTwo)
	require.Equal(t, 1, report.NondefaultEffects)
	require.Equal(t, 1, report.NondefaultVariants)
	require.Equal(t, 5, report.ExactFloatEffects)
	require.Equal(t, 4, report.FractionalEffects)
	require.Zero(t, report.ComponentOnlySpellIDs)

	_, err = pool.Exec(ctx, `
		INSERT INTO dbc_spell_effects (
			dataset_id, spell_id, difficulty_id, effect_index, source_id,
			bonus_coefficient_from_ap, coefficient, effect, effect_amplitude,
			effect_attributes, effect_aura, effect_aura_period, effect_base_points_f,
			effect_bonus_coefficient, effect_chain_amplitude, effect_chain_targets,
			effect_item_type, effect_mechanic, effect_misc_value,
			effect_points_per_resource, effect_pos_facing, effect_radius_index,
			effect_real_points_per_level, effect_spell_class_mask,
			effect_trigger_spell, group_size_base_points_coefficient,
			node_field_12_0_0_63534_001, pvp_multiplier, resource_coefficient,
			scaling_class, implicit_target, variance
		) VALUES (
			$1, 999999, 0, 0, 1,
			0, 0, 0, 0,
			0, 0, 0, 0,
			0, 0, 0,
			0, 0, ARRAY[]::integer[],
			0, 0, ARRAY[]::integer[],
			0, ARRAY[]::integer[],
			0, 0,
			0, 0, 0,
			0, ARRAY[]::integer[], 0
		)
	`, datasetID)
	require.NoError(t, err)

	report, err = spellcheck.CheckDataset(ctx, store, datasetID, spellFetcher)
	require.NoError(t, err)
	require.Equal(t, 1, report.ComponentOnlySpellIDs)
	require.Equal(t, 1, report.ComponentOnlyEffects)
	require.Zero(t, report.ComponentOnlyPowers)
	require.Zero(t, report.ComponentOnlyVariants)
	require.Equal(t, 6, report.NormalizedEffects)
}
