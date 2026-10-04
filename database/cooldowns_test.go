package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestCooldownOverrides(t *testing.T) {
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

	type flags struct{ ignored, durationHidden bool }
	overrides := func() map[int32]flags {
		t.Helper()
		rows, err := store.ListCooldownSpellsByDataset(ctx, datasetID)
		require.NoError(t, err)
		out := map[int32]flags{}
		for _, row := range rows {
			if row.SpellID >= 900001 && row.SpellID <= 900003 {
				out[row.SpellID] = flags{row.Ignored, row.DurationHidden}
			}
		}
		return out
	}
	set := func(ids []int32, ignored, hideDuration pgtype.Bool) {
		t.Helper()
		require.NoError(t, store.UpsertCooldownOverrides(ctx, database.UpsertCooldownOverridesParams{
			DatasetID: datasetID, SpellIds: ids, Ignored: ignored, HideDuration: hideDuration,
		}))
		require.NoError(t, store.DeleteEmptyCooldownOverrides(ctx, datasetID))
	}
	yes := pgtype.Bool{Bool: true, Valid: true}
	no := pgtype.Bool{Bool: false, Valid: true}
	unset := pgtype.Bool{}

	// Unknown spell IDs are skipped; repeating is a no-op.
	set([]int32{900001, 900002, 123}, yes, unset)
	set([]int32{900001, 900002, 123}, yes, unset)
	set([]int32{900002, 900003}, unset, yes)
	require.Equal(t, map[int32]flags{
		900001: {true, false},
		900002: {true, true},
		900003: {false, true},
	}, overrides())

	var unknown int
	require.NoError(t, pool.QueryRow(ctx, `SELECT COUNT(*) FROM dataset_cooldown_overrides WHERE spell_id = 123`).Scan(&unknown))
	require.Zero(t, unknown)

	// Clearing one flag keeps the other; clearing both removes the row.
	set([]int32{900002}, no, unset)
	set([]int32{900003}, unset, no)
	require.Equal(t, map[int32]flags{
		900001: {true, false},
		900002: {false, true},
		900003: {false, false},
	}, overrides())

	var rows int
	require.NoError(t, pool.QueryRow(ctx, `SELECT COUNT(*) FROM dataset_cooldown_overrides WHERE spell_id = 900003`).Scan(&rows))
	require.Zero(t, rows)
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
