package database_test

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestRatingMasteryAccumulatorPagesAndCheckpointCAS(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _, realm := setupParsesTest(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	defer func() { _, _ = conn.Exec(context.Background(), "RESET app.tenant_bypass") }()
	q := database.NewQueries(conn)
	asOf := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	generation, err := q.StartRatingRebuild(ctx, database.StartRatingRebuildParams{
		TenantID: uuid.Nil, PolicyVersion: 1, AsOf: database.Timestamptz(asOf), SourceCutoff: database.Timestamptz(asOf),
	})
	require.NoError(t, err)
	key := database.InitRatingMasteryAccumulatorParams{
		GenerationID: generation, TenantID: uuid.Nil, SubjectKind: "player", RealmID: realm,
		SubjectID: "player", InstanceName: "Raid", EncounterName: "Boss", DifficultyName: "Normal",
		MaxPlayers: 40, PlayerClass: "MAGE", PerformanceMetric: "dps", WindowKind: "period",
	}
	require.NoError(t, q.InitRatingMasteryAccumulator(ctx, key))
	require.NoError(t, q.InitRatingMasteryAccumulator(ctx, key), "restart must not reset state")
	read := database.GetRatingMasteryAccumulatorParams(key)
	initial, err := q.GetRatingMasteryAccumulator(ctx, read)
	require.NoError(t, err)
	require.Equal(t, "count", initial.Pass)

	// 211 valid observations exceed a single page. The low-score newest kill
	// must be dropped before finding the retained recency anchor.
	rows := make([][]any, 0, 214)
	for i := range 211 {
		killed := asOf.Add(-time.Duration(211-i) * time.Hour)
		if i == 0 {
			killed = asOf.Add(-time.Minute)
		}
		rows = append(rows, []any{generation, uuid.Nil, realm, uuid.New(), "player", "Raid", "Boss",
			"Normal", int16(40), "MAGE", "", "", killed, "dps", 100.0, float64(i / 5)})
	}
	// Missing locked parse and another subject do not qualify.
	rows = append(rows, []any{generation, uuid.Nil, realm, uuid.New(), "player", "Raid", "Boss",
		"Normal", int16(40), "MAGE", "", "", asOf, "dps", 100.0, nil})
	rows = append(rows, []any{generation, uuid.Nil, realm, uuid.New(), "other", "Raid", "Boss",
		"Normal", int16(40), "MAGE", "", "", asOf, "dps", 100.0, 99.0})
	for _, row := range rows {
		_, err = conn.Exec(ctx, `INSERT INTO rating_stage_player_observations
            (generation_id, tenant_id, realm_id, run_id, player_guid, instance_name, encounter_name,
             difficulty_name, max_players, player_class, player_spec, player_sub_spec, killed_at,
             performance_metric, raw_value, locked_parse)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, row...)
		require.NoError(t, err)
	}

	windows, err := q.CountTenantMasteryWindows(ctx, database.CountTenantMasteryWindowsParams{
		TargetGenerationID: generation, TargetTenantID: uuid.Nil, AsOf: database.Timestamptz(asOf),
	})
	require.NoError(t, err)
	require.Equal(t, int32(2), windows, "only the eligible subject contributes two windows")
	done, err := q.CountCompletedTenantMasteryWindows(ctx, database.CountCompletedTenantMasteryWindowsParams{GenerationID: generation, TenantID: uuid.Nil})
	require.NoError(t, err)
	require.Zero(t, done)

	page := database.ListRatingMasteryPlayerPageParams{
		GenerationID: generation, TenantID: uuid.Nil, RealmID: realm, PlayerGuid: "player",
		InstanceName: "Raid", EncounterName: "Boss", DifficultyName: "Normal", MaxPlayers: 40,
		PlayerClass: "MAGE", PerformanceMetric: "dps", WindowStart: database.Timestamptz(asOf.Add(-300 * time.Hour)),
		AsOf: database.Timestamptz(asOf), FirstPage: true, BatchSize: 10000,
	}
	var count int
	var previous database.ListRatingMasteryPlayerPageRow
	for {
		batch, err := q.ListRatingMasteryPlayerPage(ctx, page)
		require.NoError(t, err)
		require.LessOrEqual(t, len(batch), 200)
		if len(batch) == 0 {
			break
		}
		for _, row := range batch {
			if count > 0 {
				require.True(t, previous.LockedParse.Float64 < row.LockedParse.Float64 ||
					previous.LockedParse.Float64 == row.LockedParse.Float64 &&
						(previous.KilledAt.Time.Before(row.KilledAt.Time) ||
							previous.KilledAt.Time.Equal(row.KilledAt.Time) && previous.RunID.String() < row.RunID.String()))
			}
			previous = row
			count++
		}
		last := batch[len(batch)-1]
		page.FirstPage = false
		page.AfterScore, page.AfterKilledAt, page.AfterRunID = last.LockedParse.Float64, last.KilledAt, last.RunID
	}
	require.Equal(t, 211, count)

	advance := database.AdvanceRatingMasteryAccumulatorParams{
		GenerationID: generation, TenantID: uuid.Nil, SubjectKind: key.SubjectKind, RealmID: realm,
		SubjectID: key.SubjectID, InstanceName: key.InstanceName, EncounterName: key.EncounterName,
		DifficultyName: key.DifficultyName, MaxPlayers: key.MaxPlayers, PlayerClass: key.PlayerClass,
		PerformanceMetric: key.PerformanceMetric, WindowKind: key.WindowKind,
		ExpectedPass: "count", ExpectedVersion: 0, NextPass: "latest", NextEligibleKills: int64(count),
		NextExcludedKills: int64(count / 5), NextBest: previous.LockedParse.Float64,
	}
	// A failed checkpoint CAS must roll back the same transaction's accumulator
	// change. Only one page/state transition can be committed for a cursor.
	tx, err := conn.Begin(ctx)
	require.NoError(t, err)
	tq := database.NewQueries(tx)
	n, err := tq.AdvanceRatingMasteryAccumulator(ctx, advance)
	require.NoError(t, err)
	require.Equal(t, int64(1), n)
	cp := database.AdvanceRatingRebuildCheckpointParams{
		GenerationID: generation, TenantID: uuid.Nil, ExpectedPhase: "wrong", ExpectedCursor: []byte(`{}`),
		NextPhase: "mastery", NextCursor: []byte(`{"subject":"player"}`),
	}
	n, err = tq.AdvanceRatingRebuildCheckpoint(ctx, cp)
	require.NoError(t, err)
	require.Zero(t, n)
	require.NoError(t, tx.Rollback(ctx))
	state, err := q.GetRatingMasteryAccumulator(ctx, read)
	require.NoError(t, err)
	require.Equal(t, int64(0), state.Version)

	cp.ExpectedPhase = "runs"
	tx, err = conn.Begin(ctx)
	require.NoError(t, err)
	tq = database.NewQueries(tx)
	n, err = tq.AdvanceRatingMasteryAccumulator(ctx, advance)
	require.NoError(t, err)
	require.Equal(t, int64(1), n)
	n, err = tq.AdvanceRatingRebuildCheckpoint(ctx, cp)
	require.NoError(t, err)
	require.Equal(t, int64(1), n)
	require.NoError(t, tx.Commit(ctx))
	n, err = q.AdvanceRatingMasteryAccumulator(ctx, advance)
	require.NoError(t, err)
	require.Zero(t, n)
	state, err = q.GetRatingMasteryAccumulator(ctx, read)
	require.NoError(t, err)
	require.Equal(t, int64(1), state.Version)
	require.Equal(t, int64(211), state.EligibleKills)
	require.Equal(t, int64(42), state.ExcludedKills)
	require.Equal(t, pgtype.Float8{}, state.CursorScore)
	_, err = conn.Exec(ctx, `UPDATE rating_mastery_accumulators SET pass='complete' WHERE generation_id=$1`, generation)
	require.NoError(t, err)
	done, err = q.CountCompletedTenantMasteryWindows(ctx, database.CountCompletedTenantMasteryWindowsParams{GenerationID: generation, TenantID: uuid.Nil})
	require.NoError(t, err)
	require.Equal(t, int64(1), done)
}
