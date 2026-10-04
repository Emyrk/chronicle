package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestCooldownIgnores(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	datasetID := servicedataset.DefaultDatasetID

	for _, spellID := range []int32{900001, 900002, 900003} {
		_, err := pool.Exec(ctx, `
			INSERT INTO dbc_cooldown_spells (dataset_id, spell_id, name, recovery_time_ms, spell_class_set)
			VALUES ($1, $2, 'Test Cooldown', 60000, 7)
		`, datasetID, spellID)
		require.NoError(t, err)
	}

	ignored := func() map[int32]bool {
		t.Helper()
		rows, err := store.ListCooldownSpellsByDataset(ctx, datasetID)
		require.NoError(t, err)
		out := map[int32]bool{}
		for _, row := range rows {
			if row.SpellID >= 900001 && row.SpellID <= 900003 {
				out[row.SpellID] = row.Ignored
			}
		}
		return out
	}

	require.Equal(t, map[int32]bool{900001: false, 900002: false, 900003: false}, ignored())

	// Unknown spell IDs are skipped; repeating an ignore is a no-op.
	for range 2 {
		require.NoError(t, store.IgnoreCooldownSpells(ctx, database.IgnoreCooldownSpellsParams{
			DatasetID: datasetID, SpellIds: []int32{900001, 900002, 123},
		}))
	}
	require.Equal(t, map[int32]bool{900001: true, 900002: true, 900003: false}, ignored())

	var unknown int
	require.NoError(t, pool.QueryRow(ctx, `SELECT COUNT(*) FROM dataset_cooldown_ignores WHERE spell_id = 123`).Scan(&unknown))
	require.Zero(t, unknown)

	require.NoError(t, store.UnignoreCooldownSpells(ctx, database.UnignoreCooldownSpellsParams{
		DatasetID: datasetID, SpellIds: []int32{900002},
	}))
	require.Equal(t, map[int32]bool{900001: true, 900002: false, 900003: false}, ignored())
}

func TestCooldownSpellDurations(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	datasetID := servicedataset.DefaultDatasetID

	// 910001 has a 20s duration, 910002 an infinite (-1) one, 910003 no spell row.
	_, err := pool.Exec(ctx, `
		INSERT INTO dbc_spell_durations (dataset_id, id, duration, max_duration) VALUES
			($1, 9901, 20000, 20000),
			($1, 9902, -1, -1)
		ON CONFLICT DO NOTHING`, datasetID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `
		INSERT INTO dbc_spells (dataset_id, spell_id, duration_index) VALUES
			($1, 910001, 9901),
			($1, 910002, 9902)`, datasetID)
	require.NoError(t, err)
	for _, spellID := range []int32{910001, 910002, 910003} {
		_, err := pool.Exec(ctx, `
			INSERT INTO dbc_cooldown_spells (dataset_id, spell_id, name, recovery_time_ms, spell_class_set)
			VALUES ($1, $2, 'Duration Test', 60000, 7)`, datasetID, spellID)
		require.NoError(t, err)
	}

	rows, err := store.ListCooldownSpellsByDataset(ctx, datasetID)
	require.NoError(t, err)
	got := map[int32]int64{}
	for _, row := range rows {
		if row.SpellID >= 910001 && row.SpellID <= 910003 {
			got[row.SpellID] = row.DurationMs
		}
	}
	require.Equal(t, map[int32]int64{910001: 20000, 910002: 0, 910003: 0}, got)
}
