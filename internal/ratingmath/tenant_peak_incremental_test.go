package ratingmath

import (
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestLivePeakDenominatorsIncludeGuildlessKillsAndRollingWindow(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	realm, guild, generation := setupActiveRenownProjection(t, ctx, pool, store, now)
	var oldRun uuid.UUID
	for _, observation := range []struct {
		killed        time.Time
		guid          string
		raw, duration float64
		guild         uuid.UUID
	}{
		{now.AddDate(0, 0, -181), "old", 150, 6000, uuid.Nil},
		{now.AddDate(0, 0, -1), "recent", 100, 9000, guild},
	} {
		run := uuid.New()
		if observation.guid == "old" {
			oldRun = run
		}
		_, err := pool.Exec(ctx, `INSERT INTO rating_live_player_observations
			(tenant_id,realm_id,run_id,representative_instance_id,player_guid,instance_name,
			 encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,
			 performance_metric,killed_at,raw_value,duration_secs)
			VALUES ($1,$2,$3,$3,$4,'Raid','Boss','Normal',40,'MAGE','','','dps',$5,$6,10)`,
			uuid.Nil, realm, run, observation.guid, observation.killed, observation.raw)
		require.NoError(t, err)
		var guildValue any
		if observation.guild != uuid.Nil {
			guildValue = observation.guild
		}
		_, err = pool.Exec(ctx, `INSERT INTO rating_live_guild_observations
			(tenant_id,realm_id,run_id,representative_instance_id,guild_id,instance_name,
			 encounter_name,difficulty_name,max_players,killed_at,raw_duration_ms)
			VALUES ($1,$2,$3,$3,$4,'Raid','Boss','Normal',40,$5,$6)`,
			uuid.Nil, realm, run, guildValue, observation.killed, observation.duration)
		require.NoError(t, err)
	}
	base := database.CalculateLivePeakCohortDenominatorsParams{
		TenantID: uuid.Nil, InstanceName: "Raid", EncounterName: "Boss",
		DifficultyName: "Normal", MaxPlayers: 40, AsOf: database.Timestamptz(now),
		PeriodStart: database.Timestamptz(now.AddDate(0, 0, -180)),
	}
	player := base
	player.SubjectKind, player.PlayerClass, player.PerformanceMetric = "player", "MAGE", "dps"
	values, err := store.CalculateLivePeakCohortDenominators(ctx, player)
	require.NoError(t, err)
	require.Equal(t, 150.0, values.PlayerAllTime)
	require.Equal(t, 100.0, values.PlayerPeriod)
	guildKey := base
	guildKey.SubjectKind, guildKey.PerformanceMetric = "guild", "none"
	values, err = store.CalculateLivePeakCohortDenominators(ctx, guildKey)
	require.NoError(t, err)
	require.Equal(t, 6000.0, values.GuildAllTime, "guildless kill contributes to tenant rank one")
	require.Equal(t, 9000.0, values.GuildPeriod)
	n, err := store.UpsertLivePeakCohortDenominator(ctx, database.UpsertLivePeakCohortDenominatorParams{
		GenerationID: generation, TenantID: uuid.Nil, SubjectKind: "guild",
		InstanceName: "Raid", EncounterName: "Boss", DifficultyName: "Normal",
		MaxPlayers: 40, PerformanceMetric: "none", WindowKind: "period",
		WindowStart: database.Timestamptz(now.AddDate(0, 0, -180)),
		WindowEnd:   database.Timestamptz(now), RankOneRaw: values.GuildPeriod,
	})
	require.NoError(t, err)
	require.Equal(t, int64(1), n)
	var stored float64
	require.NoError(t, pool.QueryRow(ctx, `SELECT rank_one_raw FROM rating_peak_cohort_denominators
		WHERE generation_id=$1 AND subject_kind='guild' AND window_kind='period'`, generation).Scan(&stored))
	for _, table := range []string{"rating_live_player_observations", "rating_live_guild_observations"} {
		_, err = pool.Exec(ctx, "DELETE FROM "+table+" WHERE run_id=$1", oldRun)
		require.NoError(t, err)
	}
	values, err = store.CalculateLivePeakCohortDenominators(ctx, guildKey)
	require.NoError(t, err)
	require.Equal(t, 9000.0, values.GuildAllTime, "deleting the guildless fastest run changes rank one")
	values, err = store.CalculateLivePeakCohortDenominators(ctx, player)
	require.NoError(t, err)
	require.Equal(t, 100.0, values.PlayerAllTime)
	require.Equal(t, 9000.0, stored)
}

func TestRefreshDirtyTenantPeakRebasesCohortAfterDeletion(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	realm, guild, generation := setupActiveRenownProjection(t, ctx, pool, store, now)
	_, err := pool.Exec(ctx, "INSERT INTO rating_live_evidence_bootstraps (tenant_id,completed_at) VALUES ($1,now())", uuid.Nil)
	require.NoError(t, err)
	var oldRun uuid.UUID
	for _, item := range []struct {
		guid          string
		days          int
		raw, duration float64
		guild         uuid.UUID
	}{{"old", -181, 150, 6000, uuid.Nil}, {"recent", -1, 100, 9000, guild}} {
		run := uuid.New()
		if item.guid == "old" {
			oldRun = run
		}
		killed := now.AddDate(0, 0, item.days)
		_, err = pool.Exec(ctx, `INSERT INTO rating_live_player_observations
			(tenant_id,realm_id,run_id,representative_instance_id,player_guid,instance_name,
			 encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,
			 performance_metric,killed_at,raw_value,duration_secs)
			VALUES ($1,$2,$3,$3,$4,'Raid','Boss','Normal',40,'MAGE','','','dps',$5,$6,10)`,
			uuid.Nil, realm, run, item.guid, killed, item.raw)
		require.NoError(t, err)
		var guildValue any
		if item.guild != uuid.Nil {
			guildValue = item.guild
		}
		_, err = pool.Exec(ctx, `INSERT INTO rating_live_guild_observations
			(tenant_id,realm_id,run_id,representative_instance_id,guild_id,instance_name,
			 encounter_name,difficulty_name,max_players,killed_at,raw_duration_ms)
			VALUES ($1,$2,$3,$3,$4,'Raid','Boss','Normal',40,$5,$6)`,
			uuid.Nil, realm, run, guildValue, killed, item.duration)
		require.NoError(t, err)
	}
	for i := 0; i < 2; i++ {
		count, err := RefreshDirtyTenantPeak(ctx, store, uuid.Nil, now)
		require.NoError(t, err)
		require.Equal(t, 1, count)
	}
	assertScore := func(table, subjectColumn string, subject any, window string, wantRaw, wantScore float64) {
		t.Helper()
		var raw, score float64
		require.NoError(t, pool.QueryRow(ctx, "SELECT best_raw, score FROM "+table+
			" WHERE generation_id=$1 AND "+subjectColumn+"=$2 AND window_kind=$3 AND rating_metric='peak'", generation, subject, window).Scan(&raw, &score))
		require.InDelta(t, wantRaw, raw, 1e-9)
		require.InDelta(t, wantScore, score, 1e-9)
	}
	assertScore("player_tenant_rating_boss_scores", "player_guid", "recent", "all_time", 100, 100*100.0/150)
	assertScore("guild_tenant_rating_boss_scores", "guild_id", guild, "all_time", 9000, 100*6000.0/9000)
	assertScore("guild_tenant_rating_boss_scores", "guild_id", guild, "period", 9000, 100)
	for _, table := range []string{"rating_live_player_observations", "rating_live_guild_observations"} {
		_, err = pool.Exec(ctx, "DELETE FROM "+table+" WHERE run_id=$1", oldRun)
		require.NoError(t, err)
	}
	for i := 0; i < 2; i++ {
		count, err := RefreshDirtyTenantPeak(ctx, store, uuid.Nil, now)
		require.NoError(t, err)
		require.Equal(t, 1, count)
	}
	assertScore("player_tenant_rating_boss_scores", "player_guid", "recent", "all_time", 100, 100)
	assertScore("guild_tenant_rating_boss_scores", "guild_id", guild, "all_time", 9000, 100)
	var retired int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM player_tenant_rating_boss_scores
		WHERE generation_id=$1 AND player_guid='old' AND rating_metric='peak'`, generation).Scan(&retired))
	expired, err := store.ListPeakCohortExpiryPage(ctx, database.ListPeakCohortExpiryPageParams{
		TenantID: uuid.Nil, PeriodStart: database.Timestamptz(now.AddDate(0, 0, 1)), BatchSize: 200,
	})
	require.NoError(t, err)
	require.Len(t, expired, 2)
	for _, cohort := range expired {
		require.NoError(t, store.MarkDirtyPeakCohort(ctx, database.MarkDirtyPeakCohortParams{
			TenantID: uuid.Nil, SubjectKind: cohort.SubjectKind,
			InstanceName: cohort.InstanceName, EncounterName: cohort.EncounterName,
			DifficultyName: cohort.DifficultyName, MaxPlayers: cohort.MaxPlayers,
			PlayerClass: cohort.PlayerClass, PlayerSpec: cohort.PlayerSpec,
			PlayerSubSpec: cohort.PlayerSubSpec, PerformanceMetric: cohort.PerformanceMetric,
		}))
	}
	for i := 0; i < 2; i++ {
		count, err := RefreshDirtyTenantPeak(ctx, store, uuid.Nil, now.AddDate(0, 0, 181))
		require.NoError(t, err)
		require.Equal(t, 1, count)
	}
	for _, table := range []string{"player_tenant_rating_boss_scores", "guild_tenant_rating_boss_scores",
		"player_tenant_rating_scope_scores", "guild_tenant_rating_scope_scores"} {
		var count int
		require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM "+table+" WHERE generation_id=$1 AND rating_metric='peak' AND window_kind='period'", generation).Scan(&count))
		require.Zero(t, count, "expired Peak period rows must be removed")
	}
	require.Zero(t, retired)
}

func TestRefreshDirtyTenantPeakUsesFrozenRaidRoster(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	realm, _, generation := setupActiveRenownProjection(t, ctx, pool, store, now)
	_, err := pool.Exec(ctx, `UPDATE rating_rebuild_checkpoints SET manifest=jsonb_set(manifest::jsonb,
		'{renown_bosses}', $2::jsonb) WHERE generation_id=$1`, generation,
		fmt.Sprintf(`[{"realm_id":%q,"instance_name":"Raid","encounter_name":"Boss"},
		{"realm_id":%q,"instance_name":"Raid","encounter_name":"Other"}]`, realm, realm))
	require.NoError(t, err)
	_, err = pool.Exec(ctx, "INSERT INTO rating_live_evidence_bootstraps (tenant_id,completed_at) VALUES ($1,now())", uuid.Nil)
	require.NoError(t, err)
	insert := func(encounter string) uuid.UUID {
		t.Helper()
		run := uuid.New()
		_, err := pool.Exec(ctx, `INSERT INTO rating_live_player_observations
			(tenant_id,realm_id,run_id,representative_instance_id,player_guid,instance_name,
			 encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,
			 performance_metric,killed_at,raw_value,duration_secs)
			VALUES ($1,$2,$3,$3,'hero','Raid',$4,'Normal',40,'MAGE','','','dps',$5,100,10)`,
			uuid.Nil, realm, run, encounter, now.Add(-time.Hour))
		require.NoError(t, err)
		return run
	}
	readScope := func() float64 {
		t.Helper()
		var score float64
		require.NoError(t, pool.QueryRow(ctx, `SELECT score FROM player_tenant_rating_scope_scores
			WHERE generation_id=$1 AND player_guid='hero' AND rating_metric='peak' AND window_kind='all_time'`, generation).Scan(&score))
		return score
	}
	first := insert("Boss")
	_, err = RefreshDirtyTenantPeak(ctx, store, uuid.Nil, now)
	require.NoError(t, err)
	require.InDelta(t, 50, readScope(), 1e-9, "unobserved roster boss counts as zero")
	insert("Other")
	_, err = RefreshDirtyTenantPeak(ctx, store, uuid.Nil, now)
	require.NoError(t, err)
	require.InDelta(t, 100, readScope(), 1e-9)
	_, err = pool.Exec(ctx, "DELETE FROM rating_live_player_observations WHERE run_id=$1", first)
	require.NoError(t, err)
	_, err = RefreshDirtyTenantPeak(ctx, store, uuid.Nil, now)
	require.NoError(t, err)
	require.InDelta(t, 50, readScope(), 1e-9, "deleting one boss retracts its raid contribution")
}

func TestRefreshDirtyTenantPeakRestartsAfterGenerationPublish(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	realm, _, oldGeneration := setupActiveRenownProjection(t, ctx, pool, store, now)
	_, err := pool.Exec(ctx, "INSERT INTO rating_live_evidence_bootstraps (tenant_id,completed_at) VALUES ($1,now())", uuid.Nil)
	require.NoError(t, err)
	for i := 0; i < 17; i++ {
		_, err = pool.Exec(ctx, `INSERT INTO rating_live_player_observations
			(tenant_id,realm_id,run_id,representative_instance_id,player_guid,instance_name,
			 encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,
			 performance_metric,killed_at,raw_value,duration_secs)
			VALUES ($1,$2,$3,$3,$4,'Raid','Boss','Normal',40,'MAGE','','','dps',$5,100,10)`,
			uuid.Nil, realm, uuid.New(), fmt.Sprintf("p%02d", i), now.Add(-time.Hour))
		require.NoError(t, err)
	}
	processed, err := RefreshDirtyTenantPeak(ctx, store, uuid.Nil, now)
	require.NoError(t, err)
	require.Equal(t, 1, processed)
	generation, err := store.StartTenantRatingRebuild(ctx, database.StartTenantRatingRebuildParams{
		TenantID: uuid.Nil, AsOf: database.Timestamptz(now.Add(time.Minute)),
		SourceCutoff: database.Timestamptz(now),
	})
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE rating_rebuild_checkpoints AS next
		SET manifest=previous.manifest, phase='ready'
		FROM rating_rebuild_checkpoints previous
		WHERE next.generation_id=$1 AND previous.generation_id=$2`, generation, oldGeneration)
	require.NoError(t, err)
	published, err := store.PublishRatingRebuild(ctx, database.PublishRatingRebuildParams{TenantID: uuid.Nil, GenerationID: generation})
	require.NoError(t, err)
	require.True(t, published)
	processed, err = RefreshDirtyTenantPeak(ctx, store, uuid.Nil, now.Add(time.Minute))
	require.NoError(t, err)
	require.Equal(t, 1, processed)
	var count int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM player_tenant_rating_boss_scores
		WHERE generation_id=$1 AND rating_metric='peak' AND window_kind='all_time'`, generation).Scan(&count))
	require.Equal(t, 16, count, "saved cursor from the prior generation must not skip first subjects")
}

func TestRefreshDirtyTenantPeakRestartsPageAfterNewRankOne(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	realm, _, generation := setupActiveRenownProjection(t, ctx, pool, store, now)
	_, err := pool.Exec(ctx, "INSERT INTO rating_live_evidence_bootstraps (tenant_id,completed_at) VALUES ($1,now())", uuid.Nil)
	require.NoError(t, err)
	insert := func(player string, raw float64) {
		t.Helper()
		_, err := pool.Exec(ctx, `INSERT INTO rating_live_player_observations
			(tenant_id,realm_id,run_id,representative_instance_id,player_guid,instance_name,
			 encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,
			 performance_metric,killed_at,raw_value,duration_secs)
			VALUES ($1,$2,$3,$3,$4,'Raid','Boss','Normal',40,'MAGE','','','dps',$5,$6,10)`,
			uuid.Nil, realm, uuid.New(), player, now.Add(-time.Hour), raw)
		require.NoError(t, err)
	}
	for i := 0; i < 17; i++ {
		insert(fmt.Sprintf("p%02d", i), 100)
	}
	processed, err := RefreshDirtyTenantPeak(ctx, store, uuid.Nil, now)
	require.NoError(t, err)
	require.Equal(t, 1, processed)
	var cursor string
	require.NoError(t, pool.QueryRow(ctx, "SELECT after_subject_id FROM rating_peak_cohort_pages WHERE tenant_id=$1", uuid.Nil).Scan(&cursor))
	require.Equal(t, "p15", cursor)
	insert("aa", 300) // New highest raw before the stored keyset cursor.
	for i := 0; i < 3; i++ {
		processed, err = RefreshDirtyTenantPeak(ctx, store, uuid.Nil, now)
		require.NoError(t, err)
		if processed == 0 {
			break
		}
	}
	var outstanding int
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM rating_dirty_peak_cohorts WHERE tenant_id=$1", uuid.Nil).Scan(&outstanding))
	require.Zero(t, outstanding)
	var raw, score, denominator float64
	require.NoError(t, pool.QueryRow(ctx, `SELECT best_raw,score,rank_one_raw FROM player_tenant_rating_boss_scores
		WHERE generation_id=$1 AND rating_metric='peak' AND player_guid='p00' AND window_kind='period'`, generation).Scan(&raw, &score, &denominator))
	require.Equal(t, 100.0, raw)
	require.Equal(t, 300.0, denominator)
	require.InDelta(t, 100.0/3, score, 1e-9)
}
