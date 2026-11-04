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

func TestRefreshDirtyTenantMasteryMatchesFullSetBasedReplay(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	realm, guild, generation := setupActiveRenownProjection(t, ctx, pool, store, now)
	var runs []uuid.UUID
	for index, score := range []float64{10, 20, 30, 40, 50} {
		run := uuid.New()
		runs = append(runs, run)
		killed := now.AddDate(0, 0, -(index + 1))
		_, err := pool.Exec(ctx, `INSERT INTO rating_live_player_observations
			(tenant_id,realm_id,run_id,representative_instance_id,player_guid,instance_name,
			 encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,
			 performance_metric,killed_at,raw_value,duration_secs,locked_parse)
			VALUES ($1,$2,$3,$3,'player','Raid','Boss','Normal',40,'MAGE','','','dps',$4,100,10,$5)`,
			uuid.Nil, realm, run, killed, score)
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `INSERT INTO rating_stage_player_observations
			(generation_id,tenant_id,realm_id,run_id,player_guid,instance_name,encounter_name,
			 difficulty_name,max_players,player_class,player_spec,player_sub_spec,killed_at,
			 performance_metric,raw_value,locked_parse,duration_secs)
			VALUES ($1,$2,$3,$4,'player','Raid','Boss','Normal',40,'MAGE','','',$5,'dps',100,$6,10)`,
			generation, uuid.Nil, realm, run, killed, score)
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `INSERT INTO rating_live_guild_observations
			(tenant_id,realm_id,run_id,representative_instance_id,guild_id,instance_name,
			 encounter_name,difficulty_name,max_players,killed_at,raw_duration_ms,locked_parse)
			VALUES ($1,$2,$3,$3,$4,'Raid','Boss','Normal',40,$5,10000,$6)`,
			uuid.Nil, realm, run, guild, killed, score)
		require.NoError(t, err)
		_, err = pool.Exec(ctx, `INSERT INTO rating_stage_guild_observations
			(generation_id,tenant_id,realm_id,run_id,guild_id,instance_name,encounter_name,
			 difficulty_name,max_players,killed_at,raw_duration_ms,locked_parse)
			VALUES ($1,$2,$3,$4,$5,'Raid','Boss','Normal',40,$6,10000,$7)`,
			generation, uuid.Nil, realm, run, guild, killed, score)
		require.NoError(t, err)
	}
	start := database.Timestamptz(now.AddDate(0, 0, -180))
	allTime := database.Timestamptz(time.Date(2, 1, 1, 0, 0, 0, 0, time.UTC))
	playerExpected, err := store.CalculateTenantPlayerMasteryPage(ctx, database.CalculateTenantPlayerMasteryPageParams{
		GenerationID: generation, TenantID: uuid.Nil, BatchSize: 16, AsOf: database.Timestamptz(now),
		PeriodStart: start, AllTimeStart: allTime,
	})
	require.NoError(t, err)
	require.Len(t, playerExpected, 2)
	guildExpected, err := store.CalculateTenantGuildMasteryPage(ctx, database.CalculateTenantGuildMasteryPageParams{
		GenerationID: generation, TenantID: uuid.Nil, BatchSize: 16, AsOf: database.Timestamptz(now),
		PeriodStart: start, AllTimeStart: allTime,
	})
	require.NoError(t, err)
	require.Len(t, guildExpected, 2)
	processed, err := RefreshDirtyTenantMastery(ctx, store, uuid.Nil, now)
	require.NoError(t, err)
	require.Equal(t, 2, processed)
	for _, row := range playerExpected {
		var best, floor, form float64
		var kills int32
		require.NoError(t, pool.QueryRow(ctx, `SELECT best_locked_parse, floor_score, form, eligible_kills
			FROM player_tenant_rating_boss_scores WHERE generation_id=$1 AND realm_id=$2
			AND player_guid='player' AND rating_metric='mastery' AND window_kind=$3`,
			generation, realm, row.WindowKind).Scan(&best, &floor, &form, &kills))
		require.Equal(t, row.Best.Float64, best)
		require.Equal(t, row.FloorScore.Float64, floor)
		require.Equal(t, row.FormScore.Float64, form)
		require.Equal(t, int32(row.EligibleKills), kills)
	}
	for _, row := range guildExpected {
		var best, floor, form float64
		var kills int32
		require.NoError(t, pool.QueryRow(ctx, `SELECT best_locked_parse, floor_score, form, eligible_kills
			FROM guild_tenant_rating_boss_scores WHERE generation_id=$1 AND realm_id=$2
			AND guild_id=$3 AND rating_metric='mastery' AND window_kind=$4`,
			generation, realm, guild, row.WindowKind).Scan(&best, &floor, &form, &kills))
		require.Equal(t, row.Best.Float64, best)
		require.Equal(t, row.FloorScore.Float64, floor)
		require.Equal(t, row.FormScore.Float64, form)
		require.Equal(t, int32(row.EligibleKills), kills)
	}
	processed, err = RefreshDirtyTenantMastery(ctx, store, uuid.Nil, now)
	require.NoError(t, err)
	require.Zero(t, processed)

	// The former best disappearing changes both best and the low-score drop
	// count (five kills exclude one; four exclude none).
	for _, table := range []string{"rating_live_player_observations", "rating_live_guild_observations"} {
		_, err = pool.Exec(ctx, "DELETE FROM "+table+" WHERE run_id=$1", runs[4])
		require.NoError(t, err)
	}
	processed, err = RefreshDirtyTenantMastery(ctx, store, uuid.Nil, now)
	require.NoError(t, err)
	require.Equal(t, 2, processed)
	for _, table := range []string{"player_tenant_rating_boss_scores", "guild_tenant_rating_boss_scores"} {
		var best float64
		var count int32
		require.NoError(t, pool.QueryRow(ctx, "SELECT best_locked_parse, eligible_kills FROM "+table+" WHERE generation_id=$1 AND rating_metric='mastery' AND window_kind='period'", generation).Scan(&best, &count))
		require.Equal(t, 40.0, best)
		require.Equal(t, int32(4), count)
	}
	expiryStart := database.Timestamptz(now.AddDate(0, 0, 1))
	playerExpired, err := store.ListPlayerLiveMasteryExpiryPage(ctx, database.ListPlayerLiveMasteryExpiryPageParams{
		TenantID: uuid.Nil, PeriodStart: expiryStart, BatchSize: 200,
	})
	require.NoError(t, err)
	require.Len(t, playerExpired, 1)
	guildExpired, err := store.ListGuildLiveMasteryExpiryPage(ctx, database.ListGuildLiveMasteryExpiryPageParams{
		TenantID: uuid.Nil, PeriodStart: expiryStart, BatchSize: 200,
	})
	require.NoError(t, err)
	require.Len(t, guildExpired, 1)
	// Crossing the rolling cutoff retracts only period scores and scopes.
	for _, subject := range []struct{ kind, id, class, metric string }{
		{"player", "player", "MAGE", "dps"},
		{"guild", guild.String(), "", "none"},
	} {
		_, err = pool.Exec(ctx, `INSERT INTO rating_dirty_mastery_subjects
			(tenant_id,subject_kind,realm_id,subject_id,instance_name,encounter_name,
			 difficulty_name,max_players,player_class,performance_metric)
			VALUES ($1,$2,$3,$4,'Raid','Boss','Normal',40,$5,$6)`,
			uuid.Nil, subject.kind, realm, subject.id, subject.class, subject.metric)
		require.NoError(t, err)
	}
	advanced := now.AddDate(0, 0, 181)
	processed, err = RefreshDirtyTenantMastery(ctx, store, uuid.Nil, advanced)
	require.NoError(t, err)
	require.Equal(t, 2, processed)
	for _, table := range []string{"player_tenant_rating_boss_scores", "guild_tenant_rating_boss_scores",
		"player_tenant_rating_scope_scores", "guild_tenant_rating_scope_scores"} {
		var count int
		require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM "+table+" WHERE generation_id=$1 AND rating_metric='mastery' AND window_kind='period'", generation).Scan(&count))
		require.Zero(t, count, "expired period rows must be removed from "+table)
	}
}

func TestRefreshDirtyTenantMasteryDefersDuringFullRebuild(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	now := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	realm, _, _ := setupActiveRenownProjection(t, ctx, pool, store, now)
	_, err := pool.Exec(ctx, `INSERT INTO rating_live_player_observations
		(tenant_id,realm_id,run_id,representative_instance_id,player_guid,instance_name,
		 encounter_name,difficulty_name,max_players,player_class,player_spec,player_sub_spec,
		 performance_metric,killed_at,raw_value,duration_secs,locked_parse)
		VALUES ($1,$2,$3,$3,'player','Raid','Boss','Normal',40,'MAGE','','','dps',$4,100,10,50)`,
		uuid.Nil, realm, uuid.New(), now.Add(-time.Hour))
	require.NoError(t, err)
	building, err := store.StartTenantRatingRebuild(ctx, database.StartTenantRatingRebuildParams{
		TenantID: uuid.Nil, AsOf: database.Timestamptz(now.Add(time.Minute)),
		SourceCutoff: database.Timestamptz(now),
	})
	require.NoError(t, err)
	processed, err := RefreshDirtyTenantMastery(ctx, store, uuid.Nil, now)
	require.NoError(t, err)
	require.Zero(t, processed)
	var dirty int
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM rating_dirty_mastery_subjects WHERE tenant_id=$1", uuid.Nil).Scan(&dirty))
	require.Equal(t, 1, dirty)
	_, err = store.AbortRatingRebuild(ctx, database.AbortRatingRebuildParams{TenantID: uuid.Nil, GenerationID: building})
	require.NoError(t, err)
	processed, err = RefreshDirtyTenantMastery(ctx, store, uuid.Nil, now)
	require.NoError(t, err)
	require.Equal(t, 1, processed)
}
