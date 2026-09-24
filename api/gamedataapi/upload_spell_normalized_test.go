package gamedataapi

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestPersistLegacyNormalizedSpells(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	dataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{Name: "Legacy normalized", Slug: "legacy-normalized", WowVersion: "1.12.1", BuildVersion: 5875, DefaultFlavor: []string{}, IconBaseUrl: ""})
	require.NoError(t, err)

	spell := &chrondbc.Spell{ID: 123, Effects: []chrondbc.SpellEffect{
		{EffectIndex: 0},
		{EffectIndex: 1},
		{
			EffectIndex: 2, Effect: 6, EffectDieSides: 7, EffectBasePoints: 11,
			EffectPointsPerCombo: 1.5, EffectBaseDice: 2, EffectDicePerLevel: 3,
			EffectMiscValue: []int32{4}, EffectRadiusIndex: []int32{5}, ImplicitTarget: []int32{6, 7},
		},
	}, Powers: []chrondbc.SpellPower{{OrderIndex: 0, ManaCost: 42, PowerType: 3}}}

	require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
		return persistLegacyNormalizedSpells(ctx, tx, dataset.ID, []*chrondbc.Spell{spell})
	}, nil))

	effects, powers, variants, err := spelldb.GetModernSpellComponents(ctx, pool, dataset.ID, 123)
	require.NoError(t, err)
	require.Len(t, effects, 3)
	require.Equal(t, dataset.ID, effects[2].DatasetID)
	require.EqualValues(t, 12, effects[2].EffectiveBasePoints())
	require.Equal(t, int32(7), effects[2].EffectDieSides)
	require.Equal(t, float32(1.5), effects[2].EffectPointsPerCombo)
	require.Equal(t, []int32{4}, effects[2].EffectMiscValue)
	require.Equal(t, []int32{6, 7}, effects[2].ImplicitTarget)
	require.Len(t, powers, 1)
	require.Equal(t, int32(42), powers[0].ManaCost)
	require.Equal(t, int32(3), powers[0].PowerType)
	require.Len(t, variants, 1)
	require.Zero(t, variants[0].DifficultyID)
}

func TestPersistLegacySpellsRollsBackWideRowsWhenNormalizedInsertFails(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	dataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{Name: "Legacy rollback", Slug: "legacy-rollback", WowVersion: "1.12.1", BuildVersion: 5875, DefaultFlavor: []string{}, IconBaseUrl: ""})
	require.NoError(t, err)

	spell := &chrondbc.Spell{ID: 123, Effects: []chrondbc.SpellEffect{{EffectIndex: 0}, {EffectIndex: 0}}, Powers: []chrondbc.SpellPower{{OrderIndex: 0}}}
	h := New(nil, nil, pool, nil)
	err = h.persistLegacySpells(ctx, dataset.ID, []spelldb.SpellRow{spelldb.FromSpell(dataset.ID, spell)}, []*chrondbc.Spell{spell})
	require.Error(t, err)

	var count int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM dbc_spells WHERE dataset_id=$1 AND spell_id=123`, dataset.ID).Scan(&count))
	require.Zero(t, count)
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM dbc_spell_effects WHERE dataset_id=$1`, dataset.ID).Scan(&count))
	require.Zero(t, count)
}

func TestPersistLegacyNormalizedSpellsReplacesModernRows(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	dataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{Name: "Legacy replacement", Slug: "legacy-replacement", WowVersion: "1.12.1", BuildVersion: 5875, DefaultFlavor: []string{}, IconBaseUrl: ""})
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `INSERT INTO dbc_spell_effects(dataset_id,spell_id,difficulty_id,effect_index,source_id,bonus_coefficient_from_ap,coefficient,effect,effect_amplitude,effect_attributes,effect_aura,effect_aura_period,effect_base_points_f,effect_bonus_coefficient,effect_chain_amplitude,effect_chain_targets,effect_item_type,effect_mechanic,effect_misc_value,effect_points_per_resource,effect_pos_facing,effect_radius_index,effect_real_points_per_level,effect_spell_class_mask,effect_trigger_spell,group_size_base_points_coefficient,node_field_12_0_0_63534_001,pvp_multiplier,resource_coefficient,scaling_class,implicit_target,variance) VALUES($1,999,2,5,8,0,0,0,0,0,0,0,1,0,0,0,0,0,'{}',0,0,'{}',0,'{}',0,0,0,0,0,0,'{}',0)`, dataset.ID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO dbc_spell_powers(dataset_id,spell_id,order_index,source_id,alt_power_bar_id,mana_cost,mana_cost_per_level,mana_per_second,optional_cost,optional_cost_pct,power_cost_max_pct,power_cost_pct,power_display_id,power_pct_per_second,power_type,required_aura_spell_id) VALUES($1,999,1,8,0,0,0,0,0,0,0,0,0,0,0,0)`, dataset.ID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO dbc_spell_variants(dataset_id,spell_id,difficulty_id) VALUES($1,999,2)`, dataset.ID)
	require.NoError(t, err)

	spell := &chrondbc.Spell{ID: 123, Effects: []chrondbc.SpellEffect{{EffectIndex: 0}}, Powers: []chrondbc.SpellPower{{OrderIndex: 0}}}
	require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
		return persistLegacyNormalizedSpells(ctx, tx, dataset.ID, []*chrondbc.Spell{spell})
	}, nil))

	for _, table := range []string{"dbc_spell_effects", "dbc_spell_powers", "dbc_spell_variants"} {
		var ids []int32
		rows, queryErr := pool.Query(ctx, "SELECT spell_id FROM "+table+" WHERE dataset_id=$1", dataset.ID)
		require.NoError(t, queryErr)
		for rows.Next() {
			var id int32
			require.NoError(t, rows.Scan(&id))
			ids = append(ids, id)
		}
		rows.Close()
		require.Equal(t, []int32{123}, ids)
	}
}
