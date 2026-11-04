package ratingmath

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func TestEvolvingTenantRatingsWithoutGeneration(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	config, err := pgxpool.ParseConfig(dbtestutil.NewConnectionURL(t))
	require.NoError(t, err)
	config.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
		return err
	}
	pool, err := pgxpool.NewWithConfig(ctx, config)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	store := database.New(pool)
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	tenant, dataset, serverID, realm := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	_, err = pool.Exec(ctx, "INSERT INTO tenants (id,name) VALUES ($1,'Ratings test')", tenant)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "INSERT INTO datasets (id,name,slug,wow_version,default_flavor) VALUES ($1,'Ratings test',$2,'1.12.1',ARRAY['vanilla']::text[])", dataset, "rating-"+uuid.NewString())
	require.NoError(t, err)
	_, err = store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: serverID, Name: uuid.NewString()})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "UPDATE wow_servers SET tenant_id=$2, default_dataset_id=$3 WHERE id=$1", serverID, tenant, dataset)
	require.NoError(t, err)
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: serverID, Name: uuid.NewString()})
	require.NoError(t, err)
	guild, err := store.UpsertGuild(ctx, database.UpsertGuildParams{RealmID: realm, Name: uuid.NewString(), CreatedAt: database.Timestamptz(now)})
	require.NoError(t, err)
	run := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO renown_kill_facts (realm_id,player_guid,run_id,instance_name,encounter_name,killed_at)
		VALUES ($1,'player',$2,'Molten Core','Ragnaros',$3)`, realm, run, now.Add(-time.Hour))
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO guild_renown_kill_facts (tenant_id,realm_id,guild_id,run_id,instance_name,encounter_name,killed_at)
		VALUES ($1,$2,$3,$4,'Molten Core','Ragnaros',$5)`, tenant, realm, guild.ID, run, now.Add(-time.Hour))
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO rating_live_player_observations
		(tenant_id,realm_id,run_id,representative_instance_id,player_guid,instance_name,
		 encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,
		 performance_metric,killed_at,raw_value,duration_secs,locked_parse)
		VALUES ($1,$2,$3,$3,'player','Molten Core','Ragnaros','Normal',40,'MAGE','','','dps',$4,100,10,80)`, tenant, realm, run, now.Add(-time.Hour))
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO rating_live_guild_observations
		(tenant_id,realm_id,run_id,representative_instance_id,guild_id,instance_name,
		 encounter_name,difficulty_name,max_players,killed_at,raw_duration_ms,locked_parse)
		VALUES ($1,$2,$3,$3,$4,'Molten Core','Ragnaros','Normal',40,$5,9000,80)`, tenant, realm, run, guild.ID, now.Add(-time.Hour))
	require.NoError(t, err)
	for _, refresh := range []func() (int, error){
		func() (int, error) { return RefreshEvolvingTenantRenown(ctx, store, tenant, now) },
		func() (int, error) { return RefreshEvolvingTenantMastery(ctx, store, tenant, now) },
		func() (int, error) { return RefreshEvolvingTenantPeak(ctx, store, tenant, now) },
	} {
		count, err := refresh()
		require.NoError(t, err)
		require.Positive(t, count)
		count, err = refresh()
		require.NoError(t, err)
		// Peak has a second, guild cohort even when its first page is complete.
		if count > 0 {
			count, err = refresh()
			require.NoError(t, err)
		}
		require.Zero(t, count)
	}
	var generations int
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM rating_score_generations WHERE tenant_id=$1", tenant).Scan(&generations))
	require.Zero(t, generations)
	for _, metric := range []string{"renown", "mastery", "ranked_mastery", "peak"} {
		var n int
		require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM player_tenant_rating_boss_scores_evolving
			WHERE tenant_id=$1 AND rating_metric=$2`, tenant, metric).Scan(&n))
		require.Equal(t, 2, n, metric)
	}
	_, err = pool.Exec(ctx, "DELETE FROM renown_kill_facts WHERE run_id=$1", run)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "DELETE FROM guild_renown_kill_facts WHERE run_id=$1", run)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "DELETE FROM rating_live_player_observations WHERE run_id=$1", run)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "DELETE FROM rating_live_guild_observations WHERE run_id=$1", run)
	require.NoError(t, err)
	_, err = RefreshEvolvingTenantRenown(ctx, store, tenant, now)
	require.NoError(t, err)
	_, err = RefreshEvolvingTenantMastery(ctx, store, tenant, now)
	require.NoError(t, err)
	for i := 0; i < 2; i++ {
		_, err = RefreshEvolvingTenantPeak(ctx, store, tenant, now)
		require.NoError(t, err)
	}
	for _, table := range []string{
		"player_tenant_rating_boss_scores_evolving", "guild_tenant_rating_boss_scores_evolving",
		"player_tenant_rating_scope_scores_evolving", "guild_tenant_rating_scope_scores_evolving",
		"rating_peak_cohort_denominators_evolving",
	} {
		var n int
		require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM "+table+" WHERE tenant_id=$1", tenant).Scan(&n))
		require.Zero(t, n, table)
	}
}
