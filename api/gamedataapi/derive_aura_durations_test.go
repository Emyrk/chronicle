package gamedataapi

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Gophercraft/core/i18n"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDeriveAffectedAuraDurations(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)

	dataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{
		Name:          "Aura Durations",
		Slug:          "aura-durations",
		WowVersion:    "1.12.1",
		BuildVersion:  5875,
		DefaultFlavor: []string{},
		IconBaseUrl:   "",
	})
	require.NoError(t, err)

	spell := &chrondbc.Spell{
		ID:             100,
		Name_lang:      i18n.Text{i18n.English: "Affected Aura"},
		Duration:       dbcmem.SpellDuration{ID: 1},
		SpellClassSet:  8,
		SpellClassMask: 0b11,
	}
	require.NoError(t, spelldb.UpsertBatch(ctx, pool, []spelldb.SpellRow{
		spelldb.FromSpell(dataset.ID, spell),
	}))
	_, err = pool.Exec(ctx, `
		INSERT INTO dbc_spell_durations (dataset_id, id, duration, duration_per_level, max_duration)
		VALUES ($1, 1, 10000, 0, 10000)
	`, dataset.ID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `
		INSERT INTO dbc_duration_modifiers (
			dataset_id, spell_id, name, percent, flat, deprecated,
			spell_class_set, spell_class_mask
		) VALUES
			($1, 1, 'Improved Duration', 10, 0, false, 8, 1),
			($1, 2, 'Improved Duration', 20, 0, false, 8, 1),
			($1, 3, 'Extended Duration', 0, 2000, false, 8, 2),
			($1, 4, 'Deprecated Duration', 50, 0, true, 8, 1)
	`, dataset.ID)
	require.NoError(t, err)

	require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
		return deriveAffectedAuraDurations(ctx, tx, dataset.ID)
	}, nil))

	rows, err := store.ListAffectedAuraDurationsByDataset(ctx, dataset.ID)
	require.NoError(t, err)
	require.Len(t, rows, 4)
	for _, row := range rows {
		assert.Equal(t, int32(100), row.SpellID)
		assert.Equal(t, "Affected Aura", row.SpellName)
		assert.Equal(t, int32(10_000), row.BaseDurationMs)
		assert.Equal(t, int64(14_400), row.MaxDurationMs)
	}
	assert.Equal(t, []int32{1, 2, 3, 4}, []int32{
		rows[0].ModifierSpellID,
		rows[1].ModifierSpellID,
		rows[2].ModifierSpellID,
		rows[3].ModifierSpellID,
	})

	defaultRows, err := store.ListAffectedAuraDurationsByDataset(ctx, servicedataset.DefaultDatasetID)
	require.NoError(t, err)
	assert.Empty(t, defaultRows)

	summary, err := store.GetDatasetImportSummary(ctx, dataset.ID)
	require.NoError(t, err)
	assert.Equal(t, int32(1), summary.AffectedAuraDurationsCount)

	_, err = pool.Exec(ctx, `UPDATE dbc_spells SET spell_class_mask = 0 WHERE dataset_id = $1 AND spell_id = 100`, dataset.ID)
	require.NoError(t, err)
	require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
		return deriveAffectedAuraDurations(ctx, tx, dataset.ID)
	}, nil))
	rows, err = store.ListAffectedAuraDurationsByDataset(ctx, dataset.ID)
	require.NoError(t, err)
	assert.Empty(t, rows)
}
