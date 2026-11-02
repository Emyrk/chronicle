package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/ratingmath"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestBuildGuildRatingsTenantCohortAndGuildlessRun(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, store, realm := setupParsesTest(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	guild := uuid.New()
	var server uuid.UUID
	require.NoError(t, conn.QueryRow(ctx, "SELECT server_id FROM wow_server_realms WHERE id = $1", realm).Scan(&server))
	_, err = conn.Exec(ctx, "INSERT INTO guilds (id,realm_id,name) VALUES ($1,$2,'Ratings Guild')", guild, realm)
	require.NoError(t, err)
	group, err := q.CreateRatingRealmGroup(ctx, database.CreateRatingRealmGroupParams{
		ServerID: server, TenantID: uuid.Nil, Name: "Guild Ratings",
	})
	require.NoError(t, err)
	_, err = q.AssignRatingRealmToGroup(ctx, database.AssignRatingRealmToGroupParams{
		RealmID: realm, GroupID: group.ID, TenantID: uuid.Nil,
	})
	require.NoError(t, err)
	_, err = q.PutRatingGroupPolicy(ctx, database.PutRatingGroupPolicyParams{
		GroupID: group.ID, TenantID: uuid.Nil, Version: 1, PeriodDays: 30,
		HalfLifeDays: 7, BestWeight: 1, RankOneWeight: .65, FullRankKills: 5,
	})
	require.NoError(t, err)
	_, err = q.PutRatingBossPolicy(ctx, database.PutRatingBossPolicyParams{
		GroupID: group.ID, TenantID: uuid.Nil, InstanceName: "Molten Core", EncounterName: "Ragnaros",
		PeakWeight: 1, MasteryWeight: 1, RenownPoints: 15,
	})
	require.NoError(t, err)
	_, err = q.PutRatingBossPolicy(ctx, database.PutRatingBossPolicyParams{
		GroupID: group.ID, TenantID: uuid.Nil, InstanceName: "Molten Core", EncounterName: "Garr",
		PeakWeight: 1, MasteryWeight: 1, RenownPoints: 12,
	})
	require.NoError(t, err)
	_, err = q.PutRatingRaidPolicy(ctx, database.PutRatingRaidPolicyParams{
		GroupID: group.ID, TenantID: uuid.Nil, InstanceName: "Molten Core", PeakWeight: 1, MasteryWeight: 1,
	})
	require.NoError(t, err)
	asOf := time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
	guildRun, guildlessRun := uuid.New(), uuid.New()
	for _, row := range []struct {
		id       uuid.UUID
		duration int64
	}{
		{guildRun, 10}, {guildlessRun, 8},
	} {
		insertRankingRow(t, pool, store, realm, rankingOpts{
			instanceID: row.id, instanceName: "Molten Core", encounterName: "Ragnaros",
			playerGUID: row.id.String(), playerClass: "MAGE", difficultyName: "Normal",
			maxPlayers: 40, damageDone: 1000, durationSecs: float64(row.duration),
			dps: 100, killedAt: asOf.Add(-24 * time.Hour), isBoss: true,
		})
		if row.id == guildRun {
			_, err = conn.Exec(ctx, "UPDATE log_instances SET guild_id=$1 WHERE id=$2", guild, row.id)
			require.NoError(t, err)
		}
		sources, err := q.RankingRunSources(ctx, []uuid.UUID{row.id})
		require.NoError(t, err)
		require.Len(t, sources, 1)
		_, err = q.UpsertRankingRun(ctx, database.UpsertRankingRunParams(sources[0]))
		require.NoError(t, err)
	}
	_, err = conn.Exec(ctx, `UPDATE log_instances SET difficulty_name = 'Normal', max_players = 40
		WHERE id = ANY($1::uuid[])`, []uuid.UUID{guildRun, guildlessRun})
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `UPDATE log_instance_encounters
		SET start_time = end_time - INTERVAL '6 seconds' WHERE instance_id = $1`, guildlessRun)
	require.NoError(t, err, "raw guild Peak must use the clean boss encounter, not a player's ranking duration")
	var logGroup, encounter uuid.UUID
	require.NoError(t, conn.QueryRow(ctx, "SELECT log_group_id FROM log_instances WHERE id=$1", guildRun).Scan(&logGroup))
	require.NoError(t, conn.QueryRow(ctx, "SELECT encounter_id FROM encounter_dps_rankings WHERE instance_id=$1", guildRun).Scan(&encounter))
	var parseID uuid.UUID
	err = conn.QueryRow(ctx, `INSERT INTO time_parse_scores
		(tenant_id,instance_id,run_id,log_group_id,realm_id,guild_id,
		 cutoff,window_start,lookback_days,policy_version,query_version)
		VALUES ($1,$2,$2,$3,$4,$5,$6,$6,7,1,1) RETURNING id`,
		uuid.Nil, guildRun, logGroup, realm, guild, asOf).Scan(&parseID)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `INSERT INTO time_parse_boss_scores
		(time_parse_score_id,encounter_id,encounter_name,duration_ms,
		 server_precise_score,server_display_score,server_rank,server_sample_size,server_status,
		 realm_precise_score,realm_display_score,realm_rank,realm_sample_size,realm_status)
		VALUES ($1,$2,'Ragnaros',10000,73,73,1,5,'ok',73,73,1,5,'ok')`, parseID, encounter)
	require.NoError(t, err)
	generation, _, err := ratingmath.BuildTenantRatings(ctx, q, uuid.Nil, asOf,
		ratingmath.RebuildLimits{MaxRuns: 10, MaxFacts: 10})
	require.NoError(t, err)
	query := database.ListActiveGuildRatingBossScoresParams{
		TenantID: uuid.Nil, GroupID: group.ID, InstanceName: "Molten Core", EncounterName: "Ragnaros",
		DifficultyName: "Normal", MaxPlayers: 40, RatingMetric: "peak", WindowKind: "period", LimitCount: 10,
	}
	rows, err := q.ListActiveGuildRatingBossScores(ctx, query)
	require.NoError(t, err)
	require.Empty(t, rows, "building guild scores must not be visible")
	require.NoError(t, store.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.Exec(ctx, "SET LOCAL app.tenant_bypass = 'true'"); err != nil {
			return err
		}
		return ratingmath.PublishTenantRatings(ctx, tx, uuid.Nil, generation.ID)
	}, nil))
	rows, err = q.ListActiveGuildRatingBossScores(ctx, query)
	require.NoError(t, err)
	require.Len(t, rows, 1, "guild-less run is comparison evidence but receives no rating")
	require.Equal(t, guild, rows[0].GuildID)
	require.Equal(t, 60.0, rows[0].Score)
	require.Equal(t, 6000.0, rows[0].RankOneRaw.Float64)
	query.RatingMetric = "mastery"
	rows, err = q.ListActiveGuildRatingBossScores(ctx, query)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, 73.0, rows[0].Score)
	query.RatingMetric = "ranked_mastery"
	rows, err = q.ListActiveGuildRatingBossScores(ctx, query)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.InDelta(t, 47.45, rows[0].Score, .0001)
	query.RatingMetric = "renown"
	query.DifficultyName, query.MaxPlayers = "", 0
	rows, err = q.ListActiveGuildRatingBossScores(ctx, query)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, 15.0, rows[0].Score)
	scopes, err := q.ListActiveGuildRatingScopeScores(ctx, database.ListActiveGuildRatingScopeScoresParams{
		TenantID: uuid.Nil, GroupID: group.ID, InstanceName: "Molten Core", DifficultyName: "Normal",
		MaxPlayers: 40, RatingMetric: "peak", WindowKind: "period", LimitCount: 10,
	})
	require.NoError(t, err)
	require.Len(t, scopes, 1)
	require.Equal(t, 30.0, scopes[0].Score, "missing eligible boss contributes zero to fixed denominator")
	scopes, err = q.ListActiveGuildRatingScopeScores(ctx, database.ListActiveGuildRatingScopeScoresParams{
		TenantID: uuid.Nil, GroupID: group.ID, InstanceName: "Molten Core", DifficultyName: "",
		RatingMetric: "renown", WindowKind: "period", LimitCount: 10,
	})
	require.NoError(t, err)
	require.Len(t, scopes, 1)
	require.Equal(t, 15.0, scopes[0].Score, "guild Renown sums awards rather than averaging")
}
