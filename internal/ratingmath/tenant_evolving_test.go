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

func TestEvolvingPlayerPeakPageSetProjection(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	serverID, realm := uuid.New(), uuid.New()
	_, err := store.InsertWoWServer(ctx, database.InsertWoWServerParams{ID: serverID, Name: uuid.NewString()})
	require.NoError(t, err)
	_, err = store.InsertWoWServerRealm(ctx, database.InsertWoWServerRealmParams{ID: realm, ServerID: serverID, Name: uuid.NewString()})
	require.NoError(t, err)

	players := []database.EvolvingListLivePeakPlayerSubjectPageRow{
		{RealmID: realm, SubjectID: "player-one"},
		{RealmID: realm, SubjectID: "player-two"},
	}
	insertObservation := func(player, encounter string, raw, duration float64, killedAt time.Time) {
		t.Helper()
		run := uuid.New()
		_, err := pool.Exec(ctx, `INSERT INTO rating_live_player_observations
			(tenant_id,realm_id,run_id,representative_instance_id,player_guid,instance_name,
			 encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,
			 performance_metric,killed_at,raw_value,duration_secs)
			VALUES ($1,$2,$3,$3,$4,'Zul''Gurub',$5,'Normal',20,'MAGE','Fire','','dps',$6,$7,$8)`,
			uuid.Nil, realm, run, player, encounter, killedAt, raw, duration)
		require.NoError(t, err)
	}
	insertObservation("player-one", "Gri'lek", 70, 100, now.Add(-time.Hour))
	insertObservation("player-one", "Hazza'rah", 90, 55, now.Add(-2*time.Hour))
	insertObservation("player-one", "Hazza'rah", 90, 50, now.Add(-time.Hour))
	insertObservation("player-one", "Hakkar", 50, 150, now.Add(-time.Hour))
	insertObservation("player-two", "Gri'lek", 80, 100, now.Add(-time.Hour))
	insertObservation("player-two", "Hazza'rah", 60, 50, now.Add(-time.Hour))
	insertObservation("player-two", "Hakkar", 100, 150, now.Add(-time.Hour))

	roster := []string{"High Priestess Jeklik", "Hakkar", "Bloodlord Mandokir", "Gri'lek", "Hazza'rah"}
	rosters := map[livePeakRosterKey][]string{{realm: realm, raid: "Zul'Gurub"}: roster}
	key := database.LockDirtyPeakCohortsRow{
		TenantID: uuid.Nil, SubjectKind: "player", InstanceName: "Zul'Gurub",
		DifficultyName: "Normal", MaxPlayers: 20, PlayerClass: "MAGE",
		PlayerSpec: "Fire", PerformanceMetric: "dps",
	}
	for _, encounter := range []struct {
		name        string
		denominator float64
	}{{name: "Gri'lek", denominator: 80}, {name: "Hazza'rah", denominator: 90}, {name: "Hakkar", denominator: 100}} {
		key.EncounterName = encounter.name
		err = evolvingRefreshLivePeakPlayerPage(ctx, store, key, players,
			encounter.denominator, encounter.denominator, rosters, now.AddDate(0, 0, -180), now)
		require.NoError(t, err)
	}

	assertScope := func(player string, wantScore, wantRaw, wantDuration float64) {
		t.Helper()
		var score, raw, duration float64
		err := pool.QueryRow(ctx, `SELECT score,best_raw,best_duration_secs
			FROM player_tenant_rating_scope_scores_evolving
			WHERE tenant_id=$1 AND realm_id=$2 AND player_guid=$3 AND instance_name='Zul''Gurub'
			  AND rating_metric='peak' AND window_kind='all_time'`, uuid.Nil, realm, player).
			Scan(&score, &raw, &duration)
		require.NoError(t, err)
		require.InDelta(t, wantScore, score, 1e-9)
		require.InDelta(t, wantRaw, raw, 1e-9)
		require.InDelta(t, wantDuration, duration, 1e-9)
	}
	assertScope("player-one", 37.5, 12450.0/205, 205)
	assertScope("player-two", 50, 92, 250)
	var tiedDuration float64
	require.NoError(t, pool.QueryRow(ctx, `SELECT best_duration_secs
		FROM player_tenant_rating_boss_scores_evolving
		WHERE player_guid='player-one' AND encounter_name='Hazza''rah' AND window_kind='all_time'`).Scan(&tiedDuration))
	require.Equal(t, 55.0, tiedDuration, "equal raw values keep the earlier kill duration")

	_, err = pool.Exec(ctx, `DELETE FROM rating_live_player_observations
		WHERE tenant_id=$1 AND realm_id=$2 AND player_guid='player-two' AND encounter_name='Gri''lek'`, uuid.Nil, realm)
	require.NoError(t, err)
	key.EncounterName = "Gri'lek"
	err = evolvingRefreshLivePeakPlayerPage(ctx, store, key, players, 70, 70, rosters, now.AddDate(0, 0, -180), now)
	require.NoError(t, err)
	var stale int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM player_tenant_rating_boss_scores_evolving
		WHERE player_guid='player-two' AND encounter_name='Gri''lek'`).Scan(&stale))
	require.Zero(t, stale)
	assertScope("player-two", (100+100*60.0/90)/4, (100*150+60*50)/200, 200)
}
