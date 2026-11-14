package spellsearch_test

import (
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/spellsearch"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSearchExecutesCompiledSQL(t *testing.T) {
	t.Parallel()
	db, _ := dbtestutil.NewDB(t)
	level := int32(60)
	compiled, err := spellsearch.Compile(uuid.New(), chroniclesdk.SpellSearchRequest{
		Context: chroniclesdk.SpellSearchContext{Level: &level, Difficulty: 2},
		Where: &chroniclesdk.SpellSearchNode{And: []chroniclesdk.SpellSearchNode{
			{Field: "spell.school", Op: chroniclesdk.SpellSearchOpHas, Value: "Frost"},
			{Field: "spell.attributes", Op: chroniclesdk.SpellSearchOpHas, Value: "Channeled"},
			{AnyEffect: &chroniclesdk.SpellSearchNode{Field: "effect.value", Op: chroniclesdk.SpellSearchOpGte, Value: 100}},
			{AnyPower: &chroniclesdk.SpellSearchNode{Field: "power.type", Op: chroniclesdk.SpellSearchOpEq, Value: "Mana"}},
		}},
	}, spellsearch.Options{})
	require.NoError(t, err)

	page, err := spellsearch.Search(testutil.Context(t, testutil.WaitShort), db, compiled, spellsearch.SearchOptions{})
	require.NoError(t, err)
	require.Empty(t, page.Results)
	require.Nil(t, page.Next)
}

func TestSearchDifficultyFallbackAndLevelValue(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	db, _ := dbtestutil.NewDB(t)
	datasetID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	const spellID = 990001
	_, err := db.Exec(ctx, `INSERT INTO dbc_spells
		(dataset_id, spell_id, name, base_level, max_level, spell_level)
		VALUES ($1, $2, 'Scaling Test', 50, 60, 50)`, datasetID, spellID)
	require.NoError(t, err)
	_, err = db.Exec(ctx, `INSERT INTO dbc_spell_effects (
		dataset_id, spell_id, difficulty_id, effect_index, source_id,
		bonus_coefficient_from_ap, coefficient, effect, effect_amplitude,
		effect_attributes, effect_aura, effect_aura_period, effect_base_points_f,
		effect_bonus_coefficient, effect_chain_amplitude, effect_chain_targets,
		effect_item_type, effect_mechanic, effect_misc_value, effect_points_per_resource,
		effect_pos_facing, effect_radius_index, effect_real_points_per_level,
		effect_spell_class_mask, effect_trigger_spell, group_size_base_points_coefficient,
		node_field_12_0_0_63534_001, pvp_multiplier, resource_coefficient,
		scaling_class, implicit_target, variance)
		VALUES
		($1, $2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 50, 0, 0, 0, 0, 0, '{}', 0, 0, '{}', 2, '{}', 0, 0, 0, 0, 0, 0, '{}', 0),
		($1, $2, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, '{}', 0, 0, '{}', 0, '{}', 0, 0, 0, 0, 0, 0, '{}', 0)`, datasetID, spellID)
	require.NoError(t, err)

	level := int32(60)
	search := func(difficulty int32, minimum float64) []chroniclesdk.SpellSearchResult {
		t.Helper()
		compiled, compileErr := spellsearch.Compile(datasetID, chroniclesdk.SpellSearchRequest{
			Context: chroniclesdk.SpellSearchContext{Level: &level, Difficulty: difficulty},
			Where: &chroniclesdk.SpellSearchNode{AnyEffect: &chroniclesdk.SpellSearchNode{
				Field: "effect.value", Op: chroniclesdk.SpellSearchOpGte, Value: minimum,
			}},
		}, spellsearch.Options{})
		require.NoError(t, compileErr)
		page, searchErr := spellsearch.Search(ctx, db, compiled, spellsearch.SearchOptions{})
		require.NoError(t, searchErr)
		return page.Results
	}

	require.Len(t, search(2, 100), 1, "exact difficulty uses its complete effect set")
	require.Len(t, search(3, 70), 1, "missing difficulty falls back to scaled base effects")
	require.Empty(t, search(3, 71), "fallback value uses base points plus per-level scaling")
}
