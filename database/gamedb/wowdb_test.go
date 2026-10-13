package gamedb

import (
	"testing"

	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestWoWDBDerivedSpellDataUsesDatasetTables(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	datasetID := uuid.New()
	_, err := pool.Exec(ctx, `INSERT INTO datasets (id, name, slug, wow_version) VALUES ($1, 'WoWDB derived data test', $2, '1.12.1')`, datasetID, "wowdb-derived-"+datasetID.String())
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `INSERT INTO dbc_extra_attack_spells (dataset_id, spell_id, name, num_extra_attacks) VALUES ($1, 10, 'Extra Attack', 2)`, datasetID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO dbc_duration_modifiers (dataset_id, spell_id, name, percent, flat, deprecated, spell_class_set, spell_class_mask) VALUES ($1, 20, 'Duration Modifier', 15, 0, false, 8, 4)`, datasetID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO dbc_periodic_spells (dataset_id, spell_id, name, has_direct) VALUES ($1, 30, 'Periodic Spell', true)`, datasetID)
	require.NoError(t, err)

	wowDB, err := New(ctx, Options{Pool: pool, DatasetID: datasetID})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, wowDB.Close()) })

	extraAttack, ok := wowDB.ExtraAttackSpell(ctx, 10)
	require.True(t, ok)
	require.Equal(t, int32(2), extraAttack.NumExtraAttacks)

	modifiers, err := wowDB.DurationModifiers(ctx)
	require.NoError(t, err)
	require.Equal(t, int32(15), modifiers.ByID[20].Percent)
	require.Equal(t, []int32{20}, modifiers.ByClassBit[8][4])

	periodic, err := wowDB.PeriodicSpells(ctx)
	require.NoError(t, err)
	require.True(t, periodic[30].HasDirect)
}

func TestWoWDBDerivedSpellDataDoesNotFallbackAcrossDatasets(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)

	wowDB, err := New(ctx, Options{Pool: pool, DatasetID: uuid.New()})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, wowDB.Close()) })

	_, ok := wowDB.ExtraAttackSpell(ctx, 10)
	require.False(t, ok)

	modifiers, err := wowDB.DurationModifiers(ctx)
	require.NoError(t, err)
	require.Empty(t, modifiers.ByID)
	require.Empty(t, modifiers.ByClassBit)

	periodic, err := wowDB.PeriodicSpells(ctx)
	require.NoError(t, err)
	require.Empty(t, periodic)
}
