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
		_, err = pool.Exec(ctx, `INSERT INTO rating_live_guild_observations
			(tenant_id,realm_id,run_id,representative_instance_id,guild_id,instance_name,
			 encounter_name,difficulty_name,max_players,killed_at,raw_duration_ms)
			VALUES ($1,$2,$3,$3,$4,'Raid','Boss','Normal',40,$5,$6)`,
			uuid.Nil, realm, run, observation.guild, observation.killed, observation.duration)
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
