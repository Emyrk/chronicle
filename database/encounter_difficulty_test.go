package database_test

import (
	"os"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

// Execute the actual SQL source so these migration/query regression tests also
// work while generated application contracts are being updated separately.
func difficultyQuery(t *testing.T, file, name string) string {
	t.Helper()
	data, err := os.ReadFile("queries/" + file + ".sql")
	require.NoError(t, err)
	_, query, ok := strings.Cut(string(data), "-- name: "+name+" :")
	require.True(t, ok)
	_, query, ok = strings.Cut(query, "\n")
	require.True(t, ok)
	query, _, _ = strings.Cut(query, "-- name:")
	return query
}

func TestEncounterDifficultySQL(t *testing.T) {
	t.Parallel()
	connectionURL := dbtestutil.NewConnectionURL(t)
	ctx := testutil.Context(t, testutil.WaitLong)
	conn, err := pgx.Connect(ctx, connectionURL)
	require.NoError(t, err)
	defer conn.Close(ctx)
	tx, err := conn.Begin(ctx)
	require.NoError(t, err)
	defer tx.Rollback(ctx)
	fixture, err := os.ReadFile("testdata/encounter_difficulty.sql")
	require.NoError(t, err)
	_, err = tx.Exec(ctx, string(fixture))
	require.NoError(t, err)

	assertSet := func(instance string, expected []string) {
		t.Helper()
		rows, err := tx.Query(ctx, difficultyQuery(t, "parsedlogs", "InstanceDifficultiesByInstanceID"), pgx.NamedArgs{"instance_id": uuid.MustParse(instance)})
		require.NoError(t, err)
		var got []string
		for rows.Next() {
			var id uuid.UUID
			var difficulty string
			require.NoError(t, rows.Scan(&id, &difficulty))
			got = append(got, difficulty)
		}
		require.NoError(t, rows.Err())
		rows.Close()
		require.Equal(t, expected, got)
	}
	// A Normal wipe and heroic kill are mixed; mythic trash is excluded.
	assertSet("00000000-0000-0000-0000-000000000001", []string{"", "heroic"})
	assertSet("00000000-0000-0000-0000-000000000002", []string{"heroic"})
	// Future variants survive without being normalized back to Normal.
	assertSet("00000000-0000-0000-0000-000000000003", []string{"", "mythic"})

	cursor := uuid.Nil
	for _, expectedUpdates := range []int64{1, 1, 1} {
		var last uuid.UUID
		var inspected, pending, heroic int64
		args := pgx.NamedArgs{"after_id": cursor, "batch_size": 2}
		err := tx.QueryRow(ctx, difficultyQuery(t, "encounter_difficulty_backfill", "PreviewEncounterDifficultyBackfillBatch"), args).Scan(&last, &inspected, &pending, &heroic)
		require.NoError(t, err)
		require.Equal(t, int64(2), inspected)
		require.Equal(t, expectedUpdates, pending)
		var updated int64
		err = tx.QueryRow(ctx, difficultyQuery(t, "encounter_difficulty_backfill", "BackfillEncounterDifficultyBatch"), args).Scan(&last, &inspected, &updated)
		require.NoError(t, err)
		require.Equal(t, expectedUpdates, updated)
		require.NotEqual(t, cursor, last)
		cursor = last
	}
	// Backfill is idempotent and preserves explicit Normal and future variants.
	var last uuid.UUID
	var inspected, updated int64
	err = tx.QueryRow(ctx, difficultyQuery(t, "encounter_difficulty_backfill", "BackfillEncounterDifficultyBatch"), pgx.NamedArgs{"after_id": uuid.Nil, "batch_size": 10}).Scan(&last, &inspected, &updated)
	require.NoError(t, err)
	require.Equal(t, int64(6), inspected)
	require.Zero(t, updated)
	assertSet("00000000-0000-0000-0000-000000000001", []string{"", "heroic"})
	assertSet("00000000-0000-0000-0000-000000000003", []string{"", "mythic"})
}
