package database_test

import (
	"context"
	"encoding/json"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
)

// No realm-group membership or Renown manifest is needed for Peak/Mastery
// evidence. The tenant staging page includes every parsed encounter.
func TestTenantRatingStageIncludesUnassignedRealmsAndBosses(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithTimeout(t.Context(), time.Minute)
	defer cancel()
	pool, store, firstRealm := setupParsesTest(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	var server uuid.UUID
	require.NoError(t, conn.QueryRow(ctx, "SELECT server_id FROM wow_server_realms WHERE id=$1", firstRealm).Scan(&server))
	secondRealm := uuid.New()
	_, err = conn.Exec(ctx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1,$2,'other-realm')", secondRealm, server)
	require.NoError(t, err)
	for i, realm := range []uuid.UUID{firstRealm, secondRealm} {
		instance := uuid.New()
		insertRankingRow(t, pool, store, realm, rankingOpts{
			instanceID: instance, instanceName: "Uncurated Raid", encounterName: "Uncurated Boss",
			playerGUID: "cross-realm-player", playerClass: "MAGE", difficultyName: "Normal",
			maxPlayers: 40, durationSecs: 10, dps: float64(100 + i),
			killedAt: time.Now().UTC().Add(-time.Hour), isBoss: true,
		})
		sources, err := q.RankingRunSources(ctx, []uuid.UUID{instance})
		require.NoError(t, err)
		require.Len(t, sources, 1)
		_, err = q.UpsertRankingRun(ctx, database.UpsertRankingRunParams(sources[0]))
		require.NoError(t, err)
	}
	_, err = q.PutTenantRatingPolicy(ctx, database.PutTenantRatingPolicyParams{
		TenantID: uuid.Nil, Version: 1, HalfLifeDays: 30, BestWeight: 1,
		RankOneWeight: 1, FullRankKills: 5,
	})
	require.NoError(t, err)
	var generation uuid.UUID
	for i := 0; i < 3; i++ {
		id, _, err := servicerankings.StageTenantRatingEvidenceStep(ctx, store, uuid.Nil, time.Now().UTC())
		require.NoError(t, err)
		generation = id
	}
	var realms int
	require.NoError(t, conn.QueryRow(ctx, `SELECT count(DISTINCT realm_id) FROM rating_stage_player_observations
		WHERE generation_id=$1 AND instance_name='Uncurated Raid' AND encounter_name='Uncurated Boss'`, generation).Scan(&realms))
	require.Equal(t, 2, realms)
	// The scheduled worker now resumes this tenant checkpoint, but must not
	// publish before every tenant projection phase completes.
	worker := &servicerankings.WorkerRebuildTenantRatings{Store: store, Logger: slog.Default()}
	require.Error(t, worker.Work(ctx, &river.Job[servicerankings.ArgsRebuildTenantRatings]{
		Args: servicerankings.ArgsRebuildTenantRatings{TenantID: uuid.Nil},
	}))
	var active int
	require.NoError(t, conn.QueryRow(ctx, "SELECT count(*) FROM rating_score_generations WHERE id=$1 AND status='active'", generation).Scan(&active))
	require.Zero(t, active)
}

// This entry point is now used by the scheduled tenant worker; missing
// calibration must still fail closed and manifests must remain frozen.
func TestTenantRatingCheckpointRequiresPolicyAndFreezesManifest(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithTimeout(t.Context(), time.Minute)
	defer cancel()
	pool, _, _ := setupParsesTest(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	asOf := time.Now().UTC()
	args := database.StartTenantRatingRebuildParams{TenantID: uuid.Nil, AsOf: database.Timestamptz(asOf), SourceCutoff: database.Timestamptz(asOf)}

	_, err = q.StartTenantRatingRebuild(ctx, args)
	require.ErrorContains(t, err, "tenant rating policy missing")
	var generations int
	require.NoError(t, conn.QueryRow(ctx, "SELECT count(*) FROM rating_score_generations WHERE tenant_id=$1", uuid.Nil).Scan(&generations))
	require.Zero(t, generations)

	_, err = q.PutTenantRatingPolicy(ctx, database.PutTenantRatingPolicyParams{
		TenantID: uuid.Nil, Version: 1, HalfLifeDays: 30, BestWeight: 0.6,
		FormWeight: 0.3, FloorWeight: 0.1, RankOneWeight: 0.4, FullRankKills: 5,
	})
	require.NoError(t, err)
	_, err = q.PutTenantRenownBoss(ctx, database.PutTenantRenownBossParams{
		TenantID: uuid.Nil, InstanceName: "Molten Core", EncounterName: "Ragnaros", RenownPoints: 15,
	})
	require.NoError(t, err)
	id, err := q.StartTenantRatingRebuild(ctx, args)
	require.NoError(t, err)
	cp, err := q.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: uuid.Nil, GenerationID: id})
	require.NoError(t, err)
	var manifest struct {
		Writer string `json:"writer"`
		Policy struct {
			Version int32 `json:"version"`
		} `json:"tenant_policy"`
		Bosses []struct {
			InstanceName  string `json:"instance_name"`
			EncounterName string `json:"encounter_name"`
		} `json:"renown_bosses"`
	}
	require.NoError(t, json.Unmarshal(cp.Manifest, &manifest))
	require.Equal(t, "tenant", manifest.Writer)
	require.Equal(t, int32(1), manifest.Policy.Version)
	require.Len(t, manifest.Bosses, 1)
	require.Equal(t, "Ragnaros", manifest.Bosses[0].EncounterName)
	replayed, err := q.StartTenantRatingRebuild(ctx, args)
	require.NoError(t, err)
	require.Equal(t, id, replayed)

	_, err = q.PutTenantRenownBoss(ctx, database.PutTenantRenownBossParams{
		TenantID: uuid.Nil, InstanceName: "Molten Core", EncounterName: "Lucifron", RenownPoints: 5,
	})
	require.NoError(t, err)
	current, err := q.GetRatingConfigRevision(ctx, uuid.Nil)
	require.NoError(t, err)
	require.Greater(t, current, cp.ConfigRevision)
	published, err := q.PublishRatingRebuild(ctx, database.PublishRatingRebuildParams{TenantID: uuid.Nil, GenerationID: id})
	require.NoError(t, err)
	require.False(t, published)
	cpAfter, err := q.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: uuid.Nil, GenerationID: id})
	require.NoError(t, err)
	require.Equal(t, cp.Manifest, cpAfter.Manifest)
}
