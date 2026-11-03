package servicerankings_test

import (
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
)

func TestWorkerRebuildTenantRatingsCrossRealmToPublication(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	q := database.NewQueries(pool)
	store := database.New(pool)
	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Worker projection server"})
	require.NoError(t, err)
	var realms [2]uuid.UUID
	for i := range realms {
		realms[i] = uuid.New()
		_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realms[i], ServerID: server.ID, Name: "Worker realm " + realms[i].String()})
		require.NoError(t, err)
	}
	// Start a snapshot, then stage two evidence rows from different realms.
	// Work resumes the same checkpoint and must not republish until all phases
	// (including empty Mastery and scope pages) have advanced.
	asOf := time.Now().UTC().Add(time.Hour)
	legacy, err := q.StartRatingRebuild(ctx, database.StartRatingRebuildParams{TenantID: uuid.Nil, PolicyVersion: 1, AsOf: database.Timestamptz(asOf), SourceCutoff: database.Timestamptz(asOf)})
	require.NoError(t, err)
	generation, _, err := servicerankings.StageTenantRatingEvidenceStep(ctx, store, uuid.Nil, asOf)
	require.NoError(t, err)
	require.NotEqual(t, legacy, generation)
	var legacyPhase string
	require.NoError(t, pool.QueryRow(ctx, "SELECT phase FROM rating_rebuild_checkpoints WHERE generation_id=$1", legacy).Scan(&legacyPhase))
	require.Equal(t, "aborted", legacyPhase, "unfinished group build must be retired during cutover")
	_, err = pool.Exec(ctx, "UPDATE rating_rebuild_checkpoints SET phase='players' WHERE generation_id=$1", generation)
	require.NoError(t, err)
	for i, raw := range []float64{80, 100} {
		_, err = pool.Exec(ctx, `INSERT INTO rating_stage_player_observations
		(generation_id,tenant_id,realm_id,run_id,player_guid,instance_name,encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,killed_at,performance_metric,raw_value)
		VALUES ($1,$2,$3,$4,$5,'Raid','Unconfigured boss','Heroic',20,'WARRIOR','Fury','', $6,'dps',$7)`, generation, uuid.Nil, realms[i], uuid.New(), "player-"+realms[i].String(), asOf.Add(-time.Hour), raw)
		require.NoError(t, err)
	}
	worker := &servicerankings.WorkerRebuildTenantRatings{Store: store, Logger: slog.Default()}
	job := &river.Job[servicerankings.ArgsRebuildTenantRatings]{Args: servicerankings.ArgsRebuildTenantRatings{TenantID: uuid.Nil}}
	completed := false
	for i := 0; i < 40; i++ {
		err = worker.Work(ctx, job)
		cp, cpErr := q.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: uuid.Nil, GenerationID: generation})
		require.NoError(t, cpErr)
		if cp.Phase == "complete" {
			require.NoError(t, err)
			require.Zero(t, i, "small tenant should publish without one snooze per phase")
			completed = true
			break
		}
		require.Error(t, err, "unfinished pages must snooze")
		var status string
		require.NoError(t, pool.QueryRow(ctx, "SELECT status FROM rating_score_generations WHERE id=$1", generation).Scan(&status))
		require.Equal(t, "building", status, "no partial publication at phase "+cp.Phase)
	}
	require.True(t, completed, "bounded worker phases must reach publication")
	var score float64
	require.NoError(t, pool.QueryRow(ctx, `SELECT score FROM player_tenant_rating_boss_scores WHERE generation_id=$1 AND realm_id=$2 AND rating_metric='peak' AND window_kind='period'`, generation, realms[0]).Scan(&score))
	require.Equal(t, 80.0, score, "realm one competes against realm two")
	var scopes int
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM player_tenant_rating_scope_scores WHERE generation_id=$1", generation).Scan(&scopes))
	require.Equal(t, 4, scopes)

	// A failed generation must not replace the previous active board, even
	// before cleanup. Keep cleanup explicit.
	failed, err := q.StartTenantRatingRebuild(ctx, database.StartTenantRatingRebuildParams{
		TenantID: uuid.Nil, AsOf: database.Timestamptz(asOf.Add(time.Minute)), SourceCutoff: database.Timestamptz(asOf.Add(time.Minute)),
	})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "UPDATE rating_rebuild_checkpoints SET phase='unexpected' WHERE generation_id=$1", failed)
	require.NoError(t, err)
	require.ErrorContains(t, worker.Work(ctx, job), "unexpected rating rebuild phase")
	var stillActive uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, "SELECT id FROM rating_score_generations WHERE tenant_id=$1 AND status='active'", uuid.Nil).Scan(&stillActive))
	require.Equal(t, generation, stillActive)
	_, err = q.AbortRatingRebuild(ctx, database.AbortRatingRebuildParams{TenantID: uuid.Nil, GenerationID: failed})
	require.NoError(t, err)

	var unchanged float64
	require.NoError(t, pool.QueryRow(ctx, `SELECT score FROM player_tenant_rating_boss_scores WHERE generation_id=$1 AND realm_id=$2 AND rating_metric='peak' AND window_kind='period'`, generation, realms[0]).Scan(&unchanged))
	require.Equal(t, score, unchanged)
}
