package gamedataapi

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestPersistLegacySpellsWritesCanonicalRows(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	dataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{
		Name: "Legacy spells", Slug: "legacy-spells", WowVersion: "1.12.1", BuildVersion: 5875,
		DefaultFlavor: []string{}, IconBaseUrl: "",
	})
	require.NoError(t, err)

	stale := chrondbc.Spell{ID: 111}
	stale.EnsureNormalizedComponents()
	require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
		return persistLegacySpells(ctx, tx, dataset.ID, []chrondbc.Spell{stale})
	}, nil))

	spell := chrondbc.Spell{
		ID:                     4242,
		School:                 chrondbc.School(4),
		Speed:                  18.5,
		PowerType:              chrondbc.Power(1),
		ManaCost:               250,
		ManaCostPct:            12,
		ManaCostPerLevel:       3,
		ManaPerSecond:          7,
		CastingTimeIndex_:      11,
		DurationIndex_:         12,
		RangeIndex_:            13,
		Effect:                 [3]chrondbc.Effect{2, 6, 10},
		EffectBasePoints:       [3]int32{9, 41, 99},
		EffectDieSides:         [3]int32{2, 6, 10},
		EffectBaseDice:         [3]int32{1, 2, 3},
		EffectDicePerLevel:     [3]int32{4, 5, 6},
		EffectMiscValue:        [3]int32{70, 71, 72},
		EffectRadiusIndex_:     [3]int32{20, 21, 22},
		ImplicitTargetA:        [3]chrondbc.ImplicitTarget{1, 2, 3},
		ImplicitTargetB:        [3]chrondbc.ImplicitTarget{4, 5, 6},
		SpellClassSet:          chrondbc.SpellClassSet(7),
		SpellClassMask:         chrondbc.SpellClassMask(0x0000000200000001),
		BaseLevel:              20,
		MaxLevel:               60,
		SpellLevel:             30,
		MaxTargetLevel:         63,
		MaxTargets:             4,
		TargetCreatureType:     chrondbc.TargetCreatureType(8),
		Targets:                chrondbc.TargetFlags(16),
		CategoryID_:            17,
		StartRecoveryCategory:  18,
		ProcChance:             25,
		ProcCharges:            2,
		CumulativeAura:         3,
		ModalNextSpell:         19,
		CasterAuraSpell:        100,
		TargetAuraSpell:        101,
		ExcludeCasterAuraSpell: 102,
		ExcludeTargetAuraSpell: 103,
		ExcludeCasterAuraState: 5,
		ExcludeTargetAuraState: 6,
	}
	spell.EnsureNormalizedComponents()

	require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
		return persistLegacySpells(ctx, tx, dataset.ID, []chrondbc.Spell{spell})
	}, nil))

	var wide, effects, powers, variants int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM dbc_spells WHERE dataset_id=$1 AND spell_id=4242`, dataset.ID).Scan(&wide))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM dbc_spell_effects WHERE dataset_id=$1`, dataset.ID).Scan(&effects))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM dbc_spell_powers WHERE dataset_id=$1`, dataset.ID).Scan(&powers))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM dbc_spell_variants WHERE dataset_id=$1`, dataset.ID).Scan(&variants))
	require.Equal(t, 1, wide)
	require.Equal(t, 3, effects)
	require.Equal(t, 1, powers)
	require.Equal(t, 1, variants)

	var basePoints float32
	var dieSides, baseDice, dicePerLevel int32
	var miscValue, radiusIndex, implicitTarget []int32
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT effect_base_points_f, effect_die_sides, effect_base_dice, effect_dice_per_level,
			effect_misc_value, effect_radius_index, implicit_target
		FROM dbc_spell_effects
		WHERE dataset_id=$1 AND spell_id=4242 AND difficulty_id=0 AND effect_index=1
	`, dataset.ID).Scan(&basePoints, &dieSides, &baseDice, &dicePerLevel, &miscValue, &radiusIndex, &implicitTarget))
	require.Equal(t, float32(42), basePoints)
	require.Equal(t, int32(6), dieSides)
	require.Equal(t, int32(2), baseDice)
	require.Equal(t, int32(5), dicePerLevel)
	require.Equal(t, []int32{71}, miscValue)
	require.Equal(t, []int32{21}, radiusIndex)
	require.Equal(t, []int32{2, 5}, implicitTarget)

	var manaCost, powerType int32
	var powerCostPct float32
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT mana_cost, power_cost_pct, power_type
		FROM dbc_spell_powers
		WHERE dataset_id=$1 AND spell_id=4242
	`, dataset.ID).Scan(&manaCost, &powerCostPct, &powerType))
	require.Equal(t, int32(250), manaCost)
	require.Equal(t, float32(12), powerCostPct)
	require.Equal(t, int32(1), powerType)

	var difficultyID, miscID, castingTimeIndex, procChance, maxTargets int32
	var classMask []int32
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT difficulty_id, misc_id, casting_time_index, proc_chance, spell_class_mask, max_targets
		FROM dbc_spell_variants
		WHERE dataset_id=$1 AND spell_id=4242
	`, dataset.ID).Scan(&difficultyID, &miscID, &castingTimeIndex, &procChance, &classMask, &maxTargets))
	require.Zero(t, difficultyID)
	require.Zero(t, miscID)
	require.Equal(t, int32(11), castingTimeIndex)
	require.Equal(t, int32(25), procChance)
	require.Equal(t, []int32{1, 2}, classMask)
	require.Equal(t, int32(4), maxTargets)
}
