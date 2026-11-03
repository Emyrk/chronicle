package ratingmath

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Two realms in the same tenant share one rank-one denominator. The curated
// Renown manifest only gates Renown, not an otherwise unconfigured Peak boss.
func TestTenantProjectionCrossRealmRankOne(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	q := database.NewQueries(pool)
	store := database.New(pool)
	server, err := q.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: uuid.New(), Name: "Projection server"})
	require.NoError(t, err)
	var realms [2]uuid.UUID
	for i := range realms {
		realms[i] = uuid.New()
		_, err = q.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realms[i], ServerID: server.ID, Name: realms[i].String()})
		require.NoError(t, err)
	}
	_, err = q.PutTenantRatingPolicy(ctx, database.PutTenantRatingPolicyParams{TenantID: uuid.Nil, Version: 1, HalfLifeDays: 7, BestWeight: .5, FormWeight: .3, FloorWeight: .2, RankOneWeight: .5, FullRankKills: 5})
	require.NoError(t, err)
	asOf := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	generation, err := q.StartTenantRatingRebuild(ctx, database.StartTenantRatingRebuildParams{TenantID: uuid.Nil, AsOf: database.Timestamptz(asOf), SourceCutoff: database.Timestamptz(asOf)})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "UPDATE rating_rebuild_checkpoints SET phase='players' WHERE generation_id=$1", generation)
	require.NoError(t, err)
	for i, raw := range []float64{80, 100} {
		_, err = pool.Exec(ctx, `INSERT INTO rating_stage_player_observations
		(generation_id,tenant_id,realm_id,run_id,player_guid,instance_name,encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,killed_at,performance_metric,raw_value)
		VALUES ($1,$2,$3,$4,$5,'Raid','Unconfigured boss','Heroic',20,'WARRIOR','Fury','', $6,'dps',$7)`, generation, uuid.Nil, realms[i], uuid.New(), "player-"+realms[i].String(), asOf.Add(-time.Hour), raw)
		require.NoError(t, err)
	}
	for i := 0; i < 4; i++ {
		_, err = TenantProjectionPage(ctx, store, uuid.Nil, generation)
		require.NoError(t, err)
	}
	var score float64
	err = pool.QueryRow(ctx, `SELECT score FROM player_tenant_rating_boss_scores WHERE generation_id=$1 AND realm_id=$2 AND rating_metric='peak' AND window_kind='period'`, generation, realms[0]).Scan(&score)
	require.NoError(t, err)
	require.Equal(t, 80.0, score, "realm one is compared with realm two's rank-one")
	var count int
	err = pool.QueryRow(ctx, `SELECT count(*) FROM player_tenant_rating_boss_scores WHERE generation_id=$1 AND rating_metric='peak'`, generation).Scan(&count)
	require.NoError(t, err)
	require.Equal(t, 4, count, "two realms have both 180-day and all-time Peak")
	// No page can activate a generation, even after the four Peak phases.
	var status string
	err = pool.QueryRow(ctx, "SELECT status FROM rating_score_generations WHERE id=$1", generation).Scan(&status)
	require.NoError(t, err)
	require.Equal(t, "building", status)
}
