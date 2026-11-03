package ratingmath

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func TestTenantMasterySetBasedProjectionMatchesGo(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	q := database.NewQueries(pool)
	store := database.New(pool)

	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Mastery projection server " + uuid.NewString()})
	require.NoError(t, err)
	realm := uuid.New()
	_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server.ID, Name: "Mastery projection realm"})
	require.NoError(t, err)
	guild, err := q.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realm, Name: "Mastery Guild " + uuid.NewString(), CreatedAt: database.Timestamptz(time.Now().UTC())})
	require.NoError(t, err)

	asOf := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	periodStart := asOf.AddDate(0, 0, -180)
	generation, err := q.StartTenantRatingRebuild(ctx, database.StartTenantRatingRebuildParams{
		TenantID: uuid.Nil, AsOf: database.Timestamptz(asOf), SourceCutoff: database.Timestamptz(asOf),
	})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "UPDATE rating_rebuild_checkpoints SET phase='mastery_pending' WHERE generation_id=$1", generation)
	require.NoError(t, err)

	policy := MasteryPolicy{
		BestWeight: .35, FormWeight: .50, FloorWeight: .15,
		RankWeight: masteryRankWeight(database.RatingGroupPolicy{RankOneWeight: .5, FullRankKills: 5}, "Raid", "Boss"),
	}
	observations := make([]ParseObservation, 0, 213)
	for i := range 211 {
		score := float64(i % 101)
		killed := asOf.Add(-time.Duration(i+1) * time.Hour)
		if i == 0 {
			killed = periodStart
		}
		run := uuid.New()
		observations = append(observations, ParseObservation{Score: score, KilledAt: killed, ID: run.String()})
		insertStagedMasteryObservation(t, ctx, pool, generation, realm, guild.ID, run, "player", "Raid", "Boss", killed, score, pgtype.Float8{Float64: score, Valid: true})
	}
	// The upper bound is exclusive, and an unlocked parse is not evidence.
	insertStagedMasteryObservation(t, ctx, pool, generation, realm, guild.ID, uuid.New(), "player", "Raid", "Boss", asOf, 99, pgtype.Float8{Float64: 99, Valid: true})
	insertStagedMasteryObservation(t, ctx, pool, generation, realm, guild.ID, uuid.New(), "player", "Raid", "Boss", asOf.Add(-time.Hour), 100, pgtype.Float8{})

	// A deployment may resume a generation with an old streaming accumulator
	// partially through the all-time window. The set-based page replaces it.
	_, err = pool.Exec(ctx, `INSERT INTO rating_mastery_accumulators
		(generation_id,tenant_id,subject_kind,realm_id,subject_id,instance_name,encounter_name,
		 difficulty_name,max_players,player_class,player_spec,player_sub_spec,performance_metric,
		 window_kind,pass,version,position,eligible_kills,excluded_kills,best)
		VALUES ($1,$2,'player',$3,'player','Raid','Boss','Normal',40,'MAGE','Fire','','dps',
		'all_time','quantile',3,100,211,42,100)`, generation, uuid.Nil, realm)
	require.NoError(t, err)

	oldObservations := make([]ParseObservation, 0, 4)
	for i, score := range []float64{10, 20, 30, 40} {
		killed := periodStart.Add(-time.Duration(i+1) * time.Hour)
		run := uuid.New()
		oldObservations = append(oldObservations, ParseObservation{Score: score, KilledAt: killed, ID: run.String()})
		insertStagedMasteryObservation(t, ctx, pool, generation, realm, guild.ID, run, "old-player", "Raid", "Old Boss", killed, score, pgtype.Float8{Float64: score, Valid: true})
	}

	for i := 0; i < 10; i++ {
		cp, err := q.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: uuid.Nil, GenerationID: generation})
		require.NoError(t, err)
		if cp.Phase != "mastery_pending" {
			require.Equal(t, "player_scopes", cp.Phase)
			break
		}
		require.NoError(t, TenantMasteryStageStep(ctx, store, uuid.Nil, generation))
	}

	cp, err := q.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: uuid.Nil, GenerationID: generation})
	require.NoError(t, err)
	require.Equal(t, "player_scopes", cp.Phase)

	expected, err := ScoreMastery(observations, policy)
	require.NoError(t, err)
	assertProjectedMastery(t, ctx, pool, generation, "player_tenant_rating_boss_scores", "player_guid", "player", "Boss", "all_time", expected)
	assertProjectedMastery(t, ctx, pool, generation, "guild_tenant_rating_boss_scores", "guild_id", guild.ID.String(), "Boss", "all_time", expected)
	assertProjectedMastery(t, ctx, pool, generation, "player_tenant_rating_boss_scores", "player_guid", "player", "Boss", "period", expected)
	assertProjectedMastery(t, ctx, pool, generation, "guild_tenant_rating_boss_scores", "guild_id", guild.ID.String(), "Boss", "period", expected)

	oldExpected, err := ScoreMastery(oldObservations, MasteryPolicy{
		BestWeight: .35, FormWeight: .50, FloorWeight: .15,
		RankWeight: masteryRankWeight(database.RatingGroupPolicy{RankOneWeight: .5, FullRankKills: 5}, "Raid", "Old Boss"),
	})
	require.NoError(t, err)
	assertProjectedMastery(t, ctx, pool, generation, "player_tenant_rating_boss_scores", "player_guid", "old-player", "Old Boss", "all_time", oldExpected)
	assertProjectedMastery(t, ctx, pool, generation, "guild_tenant_rating_boss_scores", "guild_id", guild.ID.String(), "Old Boss", "all_time", oldExpected)

	for _, table := range []struct{ name, subject, value string }{
		{"player_tenant_rating_boss_scores", "player_guid", "old-player"},
		{"guild_tenant_rating_boss_scores", "guild_id", guild.ID.String()},
	} {
		var count int
		err := pool.QueryRow(ctx, "SELECT count(*) FROM "+table.name+" WHERE generation_id=$1 AND "+table.subject+"::text=$2 AND encounter_name='Old Boss' AND window_kind='period'", generation, table.value).Scan(&count)
		require.NoError(t, err)
		require.Zero(t, count)
	}

	done, err := q.CountCompletedTenantMasteryWindows(ctx, database.CountCompletedTenantMasteryWindowsParams{GenerationID: generation, TenantID: uuid.Nil})
	require.NoError(t, err)
	require.Equal(t, int64(8), done, "two player and two guild subjects each complete both windows")
}

func TestTenantMasterySetBasedProjectionPagesWithoutSkippingSubjects(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	q := database.NewQueries(pool)
	store := database.New(pool)

	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Paged Mastery server " + uuid.NewString()})
	require.NoError(t, err)
	realm := uuid.New()
	_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server.ID, Name: uuid.NewString()})
	require.NoError(t, err)
	asOf := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	generation, err := q.StartTenantRatingRebuild(ctx, database.StartTenantRatingRebuildParams{
		TenantID: uuid.Nil, AsOf: database.Timestamptz(asOf), SourceCutoff: database.Timestamptz(asOf),
	})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "UPDATE rating_rebuild_checkpoints SET phase='mastery_pending' WHERE generation_id=$1", generation)
	require.NoError(t, err)
	for i := range 65 {
		_, err = pool.Exec(ctx, `INSERT INTO rating_stage_player_observations
			(generation_id,tenant_id,realm_id,run_id,player_guid,instance_name,encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,killed_at,performance_metric,raw_value,locked_parse)
			VALUES ($1,$2,$3,$4,$5,'Raid','Boss','Normal',40,'MAGE','Fire','',$6,'dps',75,75)`,
			generation, uuid.Nil, realm, uuid.New(), fmt.Sprintf("player-%03d", i), asOf.Add(-time.Hour))
		require.NoError(t, err)
	}
	for range 7 {
		require.NoError(t, TenantMasteryStageStep(ctx, store, uuid.Nil, generation))
	}
	cp, err := q.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: uuid.Nil, GenerationID: generation})
	require.NoError(t, err)
	require.Equal(t, "player_scopes", cp.Phase)
	var scores, windows int
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM player_tenant_rating_boss_scores WHERE generation_id=$1", generation).Scan(&scores))
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM rating_mastery_accumulators WHERE generation_id=$1", generation).Scan(&windows))
	require.Equal(t, 65*2*2, scores)
	require.Equal(t, 65*2, windows)
}

func TestTenantMasterySetBasedProjectionRollsBackMissingGuild(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	q := database.NewQueries(pool)
	store := database.New(pool)

	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Missing Mastery guild server " + uuid.NewString()})
	require.NoError(t, err)
	realm := uuid.New()
	_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: server.ID, Name: uuid.NewString()})
	require.NoError(t, err)
	guild, err := q.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realm, Name: uuid.NewString(), CreatedAt: database.Timestamptz(time.Now().UTC())})
	require.NoError(t, err)

	asOf := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	generation, err := q.StartTenantRatingRebuild(ctx, database.StartTenantRatingRebuildParams{
		TenantID: uuid.Nil, AsOf: database.Timestamptz(asOf), SourceCutoff: database.Timestamptz(asOf),
	})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "UPDATE rating_rebuild_checkpoints SET phase='mastery_pending', cursor='{\"rating\":\"guild\"}' WHERE generation_id=$1", generation)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO rating_stage_guild_observations
		(generation_id,tenant_id,realm_id,run_id,guild_id,instance_name,encounter_name,difficulty_name,max_players,killed_at,raw_duration_ms,locked_parse)
		VALUES ($1,$2,$3,$4,$5,'Raid','Boss','Normal',40,$6,1000,75)`, generation, uuid.Nil, realm, uuid.New(), guild.ID, asOf.Add(-time.Hour))
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "DELETE FROM guilds WHERE id=$1", guild.ID)
	require.NoError(t, err)

	err = TenantMasteryStageStep(ctx, store, uuid.Nil, generation)
	require.Error(t, err)
	cp, getErr := q.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: uuid.Nil, GenerationID: generation})
	require.NoError(t, getErr)
	require.Equal(t, "mastery_pending", cp.Phase)
	require.JSONEq(t, `{"rating":"guild"}`, string(cp.Cursor))
	var accumulatorCount, scoreCount int
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM rating_mastery_accumulators WHERE generation_id=$1", generation).Scan(&accumulatorCount))
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM guild_tenant_rating_boss_scores WHERE generation_id=$1", generation).Scan(&scoreCount))
	require.Zero(t, accumulatorCount)
	require.Zero(t, scoreCount)
}

func insertStagedMasteryObservation(t *testing.T, ctx context.Context, pool *pgxpool.Pool, generation, realm, guild, run uuid.UUID, player, instance, boss string, killed time.Time, raw float64, locked pgtype.Float8) {
	t.Helper()
	_, err := pool.Exec(ctx, `INSERT INTO rating_stage_player_observations
    (generation_id,tenant_id,realm_id,run_id,player_guid,instance_name,encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,killed_at,performance_metric,raw_value,locked_parse)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'Normal',40,'MAGE','Fire','',$8,'dps',$9,$10)`, generation, uuid.Nil, realm, run, player, instance, boss, killed, raw, locked)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO rating_stage_guild_observations
    (generation_id,tenant_id,realm_id,run_id,guild_id,instance_name,encounter_name,difficulty_name,max_players,killed_at,raw_duration_ms,locked_parse)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'Normal',40,$8,1000,$9)`, generation, uuid.Nil, realm, run, guild, instance, boss, killed, locked)
	require.NoError(t, err)
}

func assertProjectedMastery(t *testing.T, ctx context.Context, pool *pgxpool.Pool, generation uuid.UUID, table, subjectColumn, subject, boss, window string, expected MasteryResult) {
	t.Helper()
	rows, err := pool.Query(ctx, "SELECT rating_metric,score,best_locked_parse,form,floor_score,eligible_kills FROM "+table+" WHERE generation_id=$1 AND "+subjectColumn+"::text=$2 AND encounter_name=$3 AND window_kind=$4 ORDER BY rating_metric", generation, subject, boss, window)
	require.NoError(t, err)
	defer rows.Close()
	seen := 0
	for rows.Next() {
		var metric string
		var score, best, form, floor float64
		var eligible int32
		require.NoError(t, rows.Scan(&metric, &score, &best, &form, &floor, &eligible))
		require.Equal(t, int32(expected.EligibleKills), eligible)
		require.InDelta(t, expected.Best, best, 1e-12)
		require.InDelta(t, expected.Form, form, 1e-12)
		require.InDelta(t, expected.Floor, floor, 1e-12)
		if metric == "mastery" {
			require.InDelta(t, expected.Mastery, score, 1e-12)
		} else {
			require.Equal(t, "ranked_mastery", metric)
			require.InDelta(t, expected.Ranked, score, 1e-12)
		}
		seen++
	}
	require.NoError(t, rows.Err())
	require.Equal(t, 2, seen)
}
