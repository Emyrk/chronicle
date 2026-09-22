package spells_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/spells"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Gophercraft/core/i18n"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestNewFetcherDBOnly_NoDBC(t *testing.T) {
	t.Parallel()

	// NewFetcherDBOnly should not panic and should produce a valid fetcher
	// even without a DBC file or pool.
	f := spells.NewFetcherDBOnly(context.Background(), nil, nil, nil, 100)
	require.NotNil(t, f)

	// TotalSpells and RangeSpells should be safe with nil DBC.
	require.Equal(t, 0, f.TotalSpells())
	require.NoError(t, f.RangeSpells(func(_ *chrondbc.Spell) bool {
		t.Fatal("should not be called")
		return false
	}))
}

func TestFetcherDBOnly_NoFallback(t *testing.T) {
	t.Parallel()

	// With no pool and DB-only mode, Spell() should return not-found, never
	// panic or attempt DBC fallback.
	f := spells.NewFetcherDBOnly(context.Background(), nil, nil, nil, 100)

	_, err := f.Spell(context.Background(), uuid.New(), 12345)
	require.Error(t, err)
	require.True(t, chrondbc.IsSpellNotFound(err))
}

func TestFetcherDBOnly_CustomSpellsStillWork(t *testing.T) {
	t.Parallel()

	custom := map[chrondbc.SpellID]chrondbc.Spell{
		6603: {ID: 6603}, // auto-attack
	}
	f := spells.NewFetcherDBOnly(context.Background(), nil, custom, nil, 100)

	sp, err := f.Spell(context.Background(), uuid.New(), 6603)
	require.NoError(t, err)
	require.NotNil(t, sp)
	require.Equal(t, chrondbc.SpellID(6603), sp.ID)
	require.Len(t, sp.Effects, 3)
	require.Len(t, sp.Powers, 1)
	require.Len(t, sp.Variants, 1)
}

func TestFetcherDBOnly_PopulatesModernSpellComponents(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	datasetID := servicedataset.DefaultDatasetID

	modern := chrondbc.Spell{ID: 900001, Name_lang: i18n.Text{i18n.English: "Modern Test Spell"}}
	legacy := chrondbc.Spell{ID: 900002, Name_lang: i18n.Text{i18n.English: "Legacy Test Spell"}}
	require.NoError(t, spelldb.UpsertBatch(ctx, pool, []spelldb.SpellRow{
		spelldb.FromSpell(datasetID, &modern),
		spelldb.FromSpell(datasetID, &legacy),
	}))

	insertEffect := func(effectIndex, sourceID, effect int32, classMask []int32) {
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
				$1, $2, 0, $3, $4,
				0.1, 0.2, $5, 1.5,
				6, 7, 800, 9.5,
				0.3, 0.4, 2,
				10, 11, ARRAY[12, 13]::integer[],
				0.5, 0.6, ARRAY[14, 15]::integer[],
				0.7, $6,
				16, 0.8,
				17, 0.9, 1.1,
				18, ARRAY[19, 20]::integer[], 1.2
			)
		`, datasetID, int32(modern.ID), effectIndex, sourceID, effect, classMask)
		require.NoError(t, err)
	}
	insertEffect(2, 102, 22, []int32{201, 202, 203, 204})
	insertEffect(0, 100, 20, []int32{101, 102, 103, 104})

	insertPower := func(orderIndex, sourceID, manaCost int32) {
		t.Helper()
		_, err := pool.Exec(ctx, `
			INSERT INTO dbc_spell_powers (
				dataset_id, spell_id, order_index, source_id, alt_power_bar_id,
				mana_cost, mana_cost_per_level, mana_per_second, optional_cost,
				optional_cost_pct, power_cost_max_pct, power_cost_pct,
				power_display_id, power_pct_per_second, power_type,
				required_aura_spell_id
			) VALUES ($1, $2, $3, $4, 5, $5, 6, 7, 8, 0.9, 1.0, 1.1, 9, 1.2, 10, 11)
		`, datasetID, int32(modern.ID), orderIndex, sourceID, manaCost)
		require.NoError(t, err)
	}
	insertPower(1, 201, 2000)
	insertPower(0, 200, 1000)

	_, err := pool.Exec(ctx, `
		INSERT INTO dbc_spell_variants (
			dataset_id, spell_id, difficulty_id,
			misc_id, attributes, speed,
			class_options_id, modal_next_spell, spell_class_set, spell_class_mask,
			categories_id, category,
			levels_id, base_level, max_level, max_passive_aura_level, spell_level
		) VALUES
			($1, $2, 2, 302, ARRAY[3, 4]::integer[], 2.5, 402, 12, 13, ARRAY[21, 22, 23, 24]::integer[], 502, 14, NULL, NULL, NULL, NULL, NULL),
			($1, $2, 0, 300, ARRAY[1, 2]::integer[], 1.5, 400, 10, 11, ARRAY[1, 2, 3, 4]::integer[], NULL, NULL, 600, 5, 70, 0, 5)
	`, datasetID, int32(modern.ID))
	require.NoError(t, err)

	fetcher := spells.NewFetcherDBOnly(ctx, pool, nil, nil, 100)
	got, err := fetcher.Spell(ctx, datasetID, modern.ID)
	require.NoError(t, err)
	require.Equal(t, []int32{0, 2}, []int32{got.Effects[0].EffectIndex, got.Effects[1].EffectIndex})
	require.Equal(t, []int32{20, 22}, []int32{got.Effects[0].Effect, got.Effects[1].Effect})
	require.Equal(t, []int32{101, 102, 103, 104}, got.Effects[0].EffectSpellClassMask)
	require.Equal(t, []int32{0, 1}, []int32{got.Powers[0].OrderIndex, got.Powers[1].OrderIndex})
	require.Equal(t, []int32{1000, 2000}, []int32{got.Powers[0].ManaCost, got.Powers[1].ManaCost})
	require.Equal(t, []int32{0, 2}, []int32{got.Variants[0].DifficultyID, got.Variants[1].DifficultyID})
	require.Equal(t, []int32{1, 2, 3, 4}, got.Variants[0].ClassOptions.SpellClassMask)
	require.NotNil(t, got.Variants[0].Levels)
	require.Nil(t, got.Variants[0].Categories)
	require.Nil(t, got.Variants[1].Levels)
	require.Equal(t, int32(14), got.Variants[1].Categories.Category)

	encoded, err := json.Marshal(got)
	require.NoError(t, err)
	var payload map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(encoded, &payload))
	require.Contains(t, payload, "modern_effects")
	require.Contains(t, payload, "modern_powers")
	require.Contains(t, payload, "modern_variants")
	require.Contains(t, string(payload["modern_variants"]), `"class_options"`)
	require.Contains(t, string(payload["modern_variants"]), `"spell_class_mask":[1,2,3,4]`)

	byName, err := fetcher.SpellsByName(ctx, datasetID, modern.Name())
	require.NoError(t, err)
	require.Len(t, byName, 1)
	require.Len(t, byName[0].Effects, 2)
	require.Len(t, byName[0].Powers, 2)
	require.Len(t, byName[0].Variants, 2)

	legacyGot, err := fetcher.Spell(ctx, datasetID, legacy.ID)
	require.NoError(t, err)
	require.Len(t, legacyGot.Effects, 3)
	require.Len(t, legacyGot.Powers, 1)
	require.Len(t, legacyGot.Variants, 1)
	legacyJSON, err := json.Marshal(legacyGot)
	require.NoError(t, err)
	require.Contains(t, string(legacyJSON), "modern_effects")
	require.Contains(t, string(legacyJSON), "modern_powers")
	require.Contains(t, string(legacyJSON), "modern_variants")

	_, err = pool.Exec(ctx, `DELETE FROM dbc_spell_effects WHERE dataset_id = $1 AND spell_id = $2`, datasetID, int32(modern.ID))
	require.NoError(t, err)
	cached, err := fetcher.Spell(ctx, datasetID, modern.ID)
	require.NoError(t, err)
	require.Len(t, cached.Effects, 2)
}
