package database_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestRetiredRatingStageGCIsBoundedAndPreservesLiveGenerations(t *testing.T) {
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
	asOf := database.Timestamptz(time.Now().UTC())
	retired, err := q.StartRatingRebuild(ctx, database.StartRatingRebuildParams{TenantID: uuid.Nil, PolicyVersion: 1, AsOf: asOf, SourceCutoff: asOf})
	require.NoError(t, err)
	active, err := q.InsertRatingScoreGeneration(ctx, database.InsertRatingScoreGenerationParams{TenantID: uuid.Nil, PolicyVersion: 1, AsOf: asOf})
	require.NoError(t, err)
	n, err := q.ActivateRatingScoreGeneration(ctx, database.ActivateRatingScoreGenerationParams{GenerationID: active.ID, TenantID: uuid.Nil})
	require.NoError(t, err)
	require.Equal(t, int64(1), n)
	building, err := q.InsertRatingScoreGeneration(ctx, database.InsertRatingScoreGenerationParams{TenantID: uuid.Nil, PolicyVersion: 1, AsOf: asOf})
	require.NoError(t, err)
	for _, generation := range []uuid.UUID{retired, active.ID, building.ID} {
		for range 3 {
			run := uuid.New()
			_, err = conn.Exec(ctx, `INSERT INTO rating_stage_player_observations
                (generation_id, tenant_id, realm_id, run_id, player_guid, instance_name, encounter_name,
                 difficulty_name, max_players, player_class, player_spec, player_sub_spec, killed_at,
                 performance_metric, raw_value)
                VALUES ($1,$2,$3,$4,'player','Raid','Boss','Normal',40,'MAGE','','',now(),'dps',100)`, generation, uuid.Nil, realm, run)
			require.NoError(t, err)
			_, err = conn.Exec(ctx, `INSERT INTO rating_stage_guild_observations
                (generation_id, tenant_id, realm_id, run_id, instance_name, encounter_name,
                 difficulty_name, max_players, killed_at, raw_duration_ms)
                VALUES ($1,$2,$3,$4,'Raid','Boss','Normal',40,now(),100)`, generation, uuid.Nil, realm, run)
			require.NoError(t, err)
			_, err = conn.Exec(ctx, `INSERT INTO rating_stage_player_renown
                (generation_id,tenant_id,realm_id,run_id,player_guid,instance_name,encounter_name,killed_at,source_id)
                VALUES ($1,$2,$3,$4,'player','Raid','Boss',now(),$5)`, generation, uuid.Nil, realm, run, uuid.New())
			require.NoError(t, err)
			_, err = conn.Exec(ctx, `INSERT INTO rating_stage_guild_renown
                (generation_id,tenant_id,realm_id,run_id,guild_id,instance_name,encounter_name,killed_at,source_id)
                VALUES ($1,$2,$3,$4,$5,'Raid','Boss',now(),$6)`, generation, uuid.Nil, realm, run, uuid.New(), uuid.New())
			require.NoError(t, err)
		}
	}
	// Published historical scores have a different retention policy from stage.
	_, err = conn.Exec(ctx, `INSERT INTO rating_boss_scores
		(generation_id, tenant_id, realm_id, player_guid, instance_name, encounter_name,
		 performance_metric, rating_metric, window_kind, score)
		VALUES ($1,$2,$3,'player','Raid','Boss','dps','peak','all_time',90)`, retired, uuid.Nil, realm)
	require.NoError(t, err)
	key := database.InitRatingMasteryAccumulatorParams{
		GenerationID: retired, TenantID: uuid.Nil, SubjectKind: "player", RealmID: realm,
		SubjectID: "player", InstanceName: "Raid", EncounterName: "Boss", DifficultyName: "Normal",
		MaxPlayers: 40, PlayerClass: "MAGE", PerformanceMetric: "dps", WindowKind: "period",
	}
	require.NoError(t, q.InitRatingMasteryAccumulator(ctx, key))
	n, err = q.AbortRatingRebuild(ctx, database.AbortRatingRebuildParams{GenerationID: retired, TenantID: uuid.Nil})
	require.NoError(t, err)
	require.Equal(t, int64(1), n)
	found, err := q.NextRetiredRatingStageGeneration(ctx)
	require.NoError(t, err)
	require.Equal(t, retired, found)
	for _, call := range []func(int32) (int32, error){
		func(size int32) (int32, error) {
			return q.DeleteRetiredRatingStagePlayerObservationsPage(ctx, database.DeleteRetiredRatingStagePlayerObservationsPageParams{GenerationID: retired, BatchSize: size})
		},
		func(size int32) (int32, error) {
			return q.DeleteRetiredRatingStageGuildObservationsPage(ctx, database.DeleteRetiredRatingStageGuildObservationsPageParams{GenerationID: retired, BatchSize: size})
		},
		func(size int32) (int32, error) {
			return q.DeleteRetiredRatingStagePlayerRenownPage(ctx, database.DeleteRetiredRatingStagePlayerRenownPageParams{GenerationID: retired, BatchSize: size})
		},
		func(size int32) (int32, error) {
			return q.DeleteRetiredRatingStageGuildRenownPage(ctx, database.DeleteRetiredRatingStageGuildRenownPageParams{GenerationID: retired, BatchSize: size})
		},
	} {
		for _, size := range []int32{1, 10000} {
			deleted, err := call(size)
			require.NoError(t, err)
			expected := int32(1)
			if size > 1 {
				expected = 2
			}
			require.Equal(t, expected, deleted)
		}
		// A live generation cannot be swept even if directly requested.

	}
	for _, generation := range []uuid.UUID{active.ID, building.ID} {
		count, err := q.DeleteRetiredRatingStagePlayerObservationsPage(ctx, database.DeleteRetiredRatingStagePlayerObservationsPageParams{GenerationID: generation, BatchSize: 200})
		require.NoError(t, err)
		require.Zero(t, count)
		count, err = q.DeleteRetiredRatingStageGuildObservationsPage(ctx, database.DeleteRetiredRatingStageGuildObservationsPageParams{GenerationID: generation, BatchSize: 200})
		require.NoError(t, err)
		require.Zero(t, count)
		count, err = q.DeleteRetiredRatingStagePlayerRenownPage(ctx, database.DeleteRetiredRatingStagePlayerRenownPageParams{GenerationID: generation, BatchSize: 200})
		require.NoError(t, err)
		require.Zero(t, count)
		count, err = q.DeleteRetiredRatingStageGuildRenownPage(ctx, database.DeleteRetiredRatingStageGuildRenownPageParams{GenerationID: generation, BatchSize: 200})
		require.NoError(t, err)
		require.Zero(t, count)
	}
	deleted, err := q.DeleteRetiredRatingStageMasteryAccumulatorsPage(ctx, database.DeleteRetiredRatingStageMasteryAccumulatorsPageParams{GenerationID: retired, BatchSize: 1})
	require.NoError(t, err)
	require.Equal(t, int32(1), deleted)
	_, err = q.NextRetiredRatingStageGeneration(ctx)
	require.True(t, errors.Is(err, pgx.ErrNoRows))
	for _, generation := range []uuid.UUID{active.ID, building.ID} {
		var count int
		require.NoError(t, conn.QueryRow(ctx, "SELECT count(*) FROM rating_stage_player_observations WHERE generation_id=$1", generation).Scan(&count))
		require.Equal(t, 3, count)
	}
	var published int
	require.NoError(t, conn.QueryRow(ctx, "SELECT count(*) FROM rating_boss_scores WHERE generation_id=$1", retired).Scan(&published))
	require.Equal(t, 1, published)
	var status string
	require.NoError(t, conn.QueryRow(ctx, "SELECT status FROM rating_score_generations WHERE id=$1", retired).Scan(&status))
	require.Equal(t, "retired", status)
}
