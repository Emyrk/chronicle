package database_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestTenantRatingRebuildRetiresOldPolicyCheckpoint(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithTimeout(t.Context(), time.Minute)
	defer cancel()
	pool, _ := dbtestutil.NewPGXPool(t)
	q := database.NewQueries(pool)
	tenant, oldID := uuid.Nil, uuid.New()
	asOf := time.Now().UTC()
	_, err := pool.Exec(ctx, `INSERT INTO rating_config_revisions (tenant_id) VALUES ($1)`, tenant)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO rating_score_generations (id,tenant_id,policy_version,as_of) VALUES ($1,$2,1,$3)`, oldID, tenant, asOf)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO rating_rebuild_checkpoints (generation_id,tenant_id,config_revision,as_of,source_cutoff,manifest)
		VALUES ($1,$2,0,$3,$3,'{"writer":"tenant","tenant_policy":{"version":1}}')`, oldID, tenant, asOf)
	require.NoError(t, err)
	newID, err := q.StartTenantRatingRebuild(ctx, database.StartTenantRatingRebuildParams{TenantID: tenant, AsOf: database.Timestamptz(asOf), SourceCutoff: database.Timestamptz(asOf)})
	require.NoError(t, err)
	require.NotEqual(t, oldID, newID)
	var oldPhase, oldStatus string
	require.NoError(t, pool.QueryRow(ctx, `SELECT cp.phase,gen.status FROM rating_rebuild_checkpoints cp JOIN rating_score_generations gen ON gen.id=cp.generation_id WHERE gen.id=$1`, oldID).Scan(&oldPhase, &oldStatus))
	require.Equal(t, "aborted", oldPhase)
	require.Equal(t, "retired", oldStatus)
	newCP, err := q.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: tenant, GenerationID: newID})
	require.NoError(t, err)
	require.Contains(t, string(newCP.Manifest), `"rules_version": 3`)
}

func TestTenantRatingFixedPolicyWithoutConfigurationTables(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithTimeout(t.Context(), time.Minute)
	defer cancel()
	pool, _ := dbtestutil.NewPGXPool(t)
	for _, table := range []string{"rating_tenant_policies", "rating_tenant_renown_bosses"} {
		var exists bool
		require.NoError(t, pool.QueryRow(ctx, "SELECT to_regclass($1) IS NOT NULL", table).Scan(&exists))
		require.False(t, exists, table)
	}
	q := database.NewQueries(pool)
	asOf := time.Now().UTC()
	id, err := q.StartTenantRatingRebuild(ctx, database.StartTenantRatingRebuildParams{TenantID: uuid.Nil, AsOf: database.Timestamptz(asOf), SourceCutoff: database.Timestamptz(asOf)})
	require.NoError(t, err)
	cp, err := q.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: uuid.Nil, GenerationID: id})
	require.NoError(t, err)
	var manifest struct {
		Writer string `json:"writer"`
		Policy struct {
			Version       int     `json:"version"`
			PeriodDays    int     `json:"period_days"`
			BestWeight    float64 `json:"best_weight"`
			FormWeight    float64 `json:"form_weight"`
			FloorWeight   float64 `json:"floor_weight"`
			RankOneWeight float64 `json:"rank_one_weight"`
			FullRankKills int     `json:"full_rank_kills"`
		} `json:"tenant_policy"`
	}
	require.NoError(t, json.Unmarshal(cp.Manifest, &manifest))
	require.Equal(t, "tenant", manifest.Writer)
	require.Equal(t, 2, manifest.Policy.Version)
	require.Equal(t, 180, manifest.Policy.PeriodDays)
	require.InDelta(t, .35, manifest.Policy.BestWeight, 1e-9)
	require.InDelta(t, .50, manifest.Policy.FormWeight, 1e-9)
	require.InDelta(t, .15, manifest.Policy.FloorWeight, 1e-9)
	require.InDelta(t, .50, manifest.Policy.RankOneWeight, 1e-9)
	require.Equal(t, 5, manifest.Policy.FullRankKills)
}
