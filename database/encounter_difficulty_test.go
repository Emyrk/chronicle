package database_test

import (
	"os"
	"strings"
	"testing"
	"time"

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
	// Ranking reads ignore old denormalized labels and encounter-level sizes.
	rankingRows, err := tx.Query(ctx, difficultyQuery(t, "rankings", "InstanceRankingRecords"), pgx.NamedArgs{"instance_id": uuid.MustParse("00000000-0000-0000-0000-000000000001")})
	require.NoError(t, err)
	rankings, err := pgx.CollectRows(rankingRows, pgx.RowToMap)
	require.NoError(t, err)
	require.Len(t, rankings, 2)
	require.Equal(t, "heroic", rankings[0]["difficulty_name"])
	require.Equal(t, "", rankings[1]["difficulty_name"])
	require.EqualValues(t, 25, rankings[0]["max_players"])
	require.EqualValues(t, 25, rankings[1]["max_players"])
	futureRows, err := tx.Query(ctx, difficultyQuery(t, "rankings", "InstanceRankingRecords"), pgx.NamedArgs{"instance_id": uuid.MustParse("00000000-0000-0000-0000-000000000004")})
	require.NoError(t, err)
	future, err := pgx.CollectRows(futureRows, pgx.RowToMap)
	require.NoError(t, err)
	require.Len(t, future, 1)
	require.Equal(t, "mythic", future[0]["difficulty_name"])

	// The real ingestion query must not overwrite the other difficulty of the
	// same boss/player in one instance. Repeating either key stays idempotent.
	args := pgx.NamedArgs{
		"instance_id":    uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		"encounter_name": "Boss", "instance_name": "Test raid", "player_guid": "variant-player",
		"player_name": "Variant", "player_class": "Mage", "player_spec": "Fire", "player_sub_spec": "",
		"player_role": "dps", "player_level": int16(80), "talent_build_id": nil,
		"max_players": int16(25), "realm_id": uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		"realm_name": "Test", "guild_id": nil, "guild_name": "", "damage_done": int64(100),
		"unranked_damage_done": int64(0), "duration_secs": float64(60), "dps": float64(1), "avg_ilvl": nil,
		"healing_done": int64(0), "absorbed_done": int64(0), "hps": float64(0), "player_deaths": nil,
		"alive_percentage": nil, "log_hashed_slug": "", "killed_at": time.Date(2026, 1, 1, 0, 1, 0, 0, time.UTC),
	}
	for _, tc := range []struct{ id, difficulty string }{
		{"10000000-0000-0000-0000-000000000001", "heroic"},
		{"10000000-0000-0000-0000-000000000002", ""},
		{"10000000-0000-0000-0000-000000000001", "heroic"},
	} {
		args["encounter_id"] = uuid.MustParse(tc.id)
		args["difficulty_name"] = tc.difficulty
		_, err = tx.Exec(ctx, difficultyQuery(t, "rankings", "InsertEncounterDpsRanking"), args)
		require.NoError(t, err)
	}
	rows, err := tx.Query(ctx, difficultyQuery(t, "rankings", "InstanceRankingRecords"), pgx.NamedArgs{"instance_id": args["instance_id"]})
	require.NoError(t, err)
	allRankings, err := pgx.CollectRows(rows, pgx.RowToMap)
	require.NoError(t, err)
	var variants []string
	for _, row := range allRankings {
		if row["player_guid"] == "variant-player" {
			variants = append(variants, row["difficulty_name"].(string))
		}
	}
	require.ElementsMatch(t, []string{"", "heroic"}, variants)

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
