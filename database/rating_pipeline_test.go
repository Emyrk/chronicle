package database_test

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/require"
)

// Exercises the same bounded worker invocations used by River, against real
// checkpoints, frozen observations, projections, and active leaderboard reads.
func TestRatingWorkerStagedPipelineAndStalePublication(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Minute)
	defer cancel()
	pool, store, realm := setupParsesTest(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	var server uuid.UUID
	require.NoError(t, conn.QueryRow(ctx, "SELECT server_id FROM wow_server_realms WHERE id=$1", realm).Scan(&server))
	guild := uuid.New()
	_, err = conn.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1,$2,'Pipeline Guild')", guild, realm)
	require.NoError(t, err)
	group, err := q.CreateRatingRealmGroup(ctx, database.CreateRatingRealmGroupParams{ServerID: server, Name: "Pipeline Group"})
	require.NoError(t, err)
	assigned, err := q.AssignRatingRealmToGroup(ctx, database.AssignRatingRealmToGroupParams{RealmID: realm, GroupID: group.ID})
	require.NoError(t, err)
	require.Equal(t, int64(1), assigned)
	_, err = q.PutRatingGroupPolicy(ctx, database.PutRatingGroupPolicyParams{
		GroupID: group.ID, Version: 1, PeriodDays: 30, HalfLifeDays: 7,
		BestWeight: 1, RankOneWeight: 1, FullRankKills: 5,
	})
	require.NoError(t, err)
	_, err = q.PutRatingBossPolicy(ctx, database.PutRatingBossPolicyParams{
		GroupID: group.ID, InstanceName: "Molten Core", EncounterName: "Ragnaros",
		PeakWeight: 1, MasteryWeight: 1, RenownPoints: 15,
	})
	require.NoError(t, err)
	_, err = q.PutRatingRaidPolicy(ctx, database.PutRatingRaidPolicyParams{
		GroupID: group.ID, InstanceName: "Molten Core", PeakWeight: 1, MasteryWeight: 1,
	})
	require.NoError(t, err)

	for i, score := range []float64{10, 20, 30, 40, 50, 100} {
		instance := uuid.New()
		killed := time.Now().UTC().Add(-time.Duration(12+i) * time.Hour)
		insertRankingRow(t, pool, store, realm, rankingOpts{
			instanceID: instance, instanceName: "Molten Core", encounterName: "Ragnaros",
			playerGUID: "pipeline-player", playerClass: "MAGE", difficultyName: "Normal",
			maxPlayers: 40, damageDone: int64(1000 + i*100), durationSecs: 10,
			dps: float64(100 + i*10), killedAt: killed, isBoss: true,
		})
		_, err = conn.Exec(ctx, "UPDATE log_instances SET guild_id=$1, difficulty_name='Normal', max_players=40 WHERE id=$2", guild, instance)
		require.NoError(t, err)
		sources, err := q.RankingRunSources(ctx, []uuid.UUID{instance})
		require.NoError(t, err)
		require.Len(t, sources, 1)
		_, err = q.UpsertRankingRun(ctx, database.UpsertRankingRunParams(sources[0]))
		require.NoError(t, err)
		require.NoError(t, q.InsertParseScoreResult(ctx, database.InsertParseScoreResultParams{
			TenantID: uuid.Nil, InstanceID: instance, RunID: sources[0].RunID,
			EncounterName: "Ragnaros", PlayerGuid: "pipeline-player", PlayerName: "Pipeline Player",
			PlayerClass: "MAGE", Metric: "dps", MetricValue: float64(100 + i*10),
			PreciseScore: score, DisplayScore: int16(score), Status: "ok", InstanceName: "Molten Core",
			DifficultyName: "Normal", MaxPlayers: 40, KilledAt: database.Timestamptz(killed),
		}))
	}
	// Retained facts are staged separately from the current run observations.
	oldKill := time.Now().UTC().Add(-60 * 24 * time.Hour)
	_, err = q.InsertRenownKillFact(ctx, database.InsertRenownKillFactParams{
		RealmID: realm, PlayerGuid: "pipeline-player", RunID: uuid.New(),
		InstanceName: "Molten Core", EncounterName: "Ragnaros", KilledAt: database.Timestamptz(oldKill),
	})
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `INSERT INTO guild_renown_kill_facts
		(tenant_id, realm_id, guild_id, run_id, instance_name, encounter_name, killed_at)
		VALUES ($1,$2,$3,$4,'Molten Core','Ragnaros',$5)`, uuid.Nil, realm, guild, uuid.New(), oldKill)
	require.NoError(t, err)

	recentKill := time.Now().UTC().Add(-time.Hour)
	_, err = q.InsertRenownKillFact(ctx, database.InsertRenownKillFactParams{
		RealmID: realm, PlayerGuid: "pipeline-player", RunID: uuid.New(),
		InstanceName: "Molten Core", EncounterName: "Ragnaros", KilledAt: database.Timestamptz(recentKill),
	})
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `INSERT INTO guild_renown_kill_facts
		(tenant_id, realm_id, guild_id, run_id, instance_name, encounter_name, killed_at)
		VALUES ($1,$2,$3,$4,'Molten Core','Ragnaros',$5)`, uuid.Nil, realm, guild, uuid.New(), recentKill)
	require.NoError(t, err)

	worker := &servicerankings.WorkerRebuildTenantRatings{Store: store, Logger: slog.Default()}
	job := &river.Job[servicerankings.ArgsRebuildTenantRatings]{Args: servicerankings.ArgsRebuildTenantRatings{TenantID: uuid.Nil}}
	checkpoint := func(id uuid.UUID) database.RatingRebuildCheckpoint {
		t.Helper()
		cp, err := q.GetRatingRebuildCheckpoint(ctx, database.GetRatingRebuildCheckpointParams{TenantID: uuid.Nil, GenerationID: id})
		require.NoError(t, err)
		return cp
	}
	boss := func(metric, window string) []database.RatingBossScore {
		t.Helper()
		params := database.ListActiveGroupBossRatingScoresParams{
			TenantID: uuid.Nil, GroupID: group.ID, InstanceName: "Molten Core", EncounterName: "Ragnaros",
			PerformanceMetric: "dps", DifficultyName: "Normal", MaxPlayers: 40, PlayerClass: "MAGE",
			RatingMetric: metric, WindowKind: window, LimitCount: 10,
		}
		if metric == "renown" {
			params.PerformanceMetric, params.DifficultyName, params.MaxPlayers, params.PlayerClass = "none", "", 0, ""
		}
		rows, err := q.ListActiveGroupBossRatingScores(ctx, params)
		require.NoError(t, err)
		return rows
	}
	// Add a second metric after the evidence phase to exercise Mastery's
	// bounded 200-observation replay without generating 201 entire log files.
	// The six dps observations still verify the real run staging path.
	injectLongMastery := func(generation uuid.UUID) {
		t.Helper()
		for i := range 201 {
			_, err := conn.Exec(ctx, `INSERT INTO rating_stage_player_observations
				(generation_id, tenant_id, realm_id, run_id, player_guid, instance_name, encounter_name,
				 difficulty_name, max_players, player_class, player_spec, player_sub_spec, killed_at,
				 performance_metric, raw_value, locked_parse)
				VALUES ($1,$2,$3,$4,'pipeline-player','Molten Core','Ragnaros',
				'Normal',40,'MAGE','','',$5,'hps',100,$6)`,
				generation, uuid.Nil, realm, uuid.New(), time.Now().UTC().Add(-time.Duration(i+1)*time.Minute), float64(i%100))
			require.NoError(t, err)
		}
	}
	var generation uuid.UUID
	injected, pagedMastery := false, false
	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		err := worker.Work(ctx, job)
		require.Error(t, err, "each intermediate page must snooze, not publish")
		cp, lookupErr := q.GetBuildingRatingRebuildCheckpoint(ctx, uuid.Nil)
		require.NoError(t, lookupErr)
		if generation == uuid.Nil {
			generation = cp.GenerationID
		}
		require.Equal(t, generation, cp.GenerationID)
		if cp.Phase == "players" && !injected {
			injectLongMastery(generation)
			injected = true
		}
		if cp.Phase == "mastery_pending" {
			var partial bool
			require.NoError(t, conn.QueryRow(ctx, `SELECT EXISTS (
				SELECT 1 FROM rating_mastery_accumulators WHERE generation_id=$1
				AND subject_id='pipeline-player' AND performance_metric='hps'
				AND pass='count' AND eligible_kills=200)`, generation).Scan(&partial))
			pagedMastery = pagedMastery || partial
		}
		seen[cp.Phase] = true
		require.Empty(t, boss("peak", "period"), "unpublished scores must remain invisible")
		if cp.Phase == "ready" {
			break
		}
	}
	require.True(t, seen["runs"] && seen["player_renown"] && seen["guild_renown"])
	for _, phase := range []string{"players", "guilds", "player_renown_scores", "guild_renown_scores", "mastery_pending", "player_scopes", "guild_scopes", "scopes_complete", "ready"} {
		require.True(t, seen[phase], "missing phase %s", phase)
	}
	var stagedPlayers, stagedGuilds, scoredPlayers int
	require.NoError(t, conn.QueryRow(ctx, "SELECT count(*) FROM rating_stage_player_observations WHERE generation_id=$1", generation).Scan(&stagedPlayers))
	require.NoError(t, conn.QueryRow(ctx, "SELECT count(*) FROM rating_stage_guild_observations WHERE generation_id=$1", generation).Scan(&stagedGuilds))
	require.NoError(t, conn.QueryRow(ctx, "SELECT count(*) FROM rating_boss_scores WHERE generation_id=$1", generation).Scan(&scoredPlayers))
	require.True(t, injected)
	require.True(t, pagedMastery, "the first 200 Mastery observations must commit without advancing the subject")
	require.Equal(t, 207, stagedPlayers)
	require.Equal(t, 6, stagedGuilds)
	require.Positive(t, scoredPlayers, "Peak, Renown and Mastery must be projected before ready")
	var dropped int64
	require.NoError(t, conn.QueryRow(ctx, `SELECT excluded_kills FROM rating_mastery_accumulators
		WHERE generation_id=$1 AND subject_kind='player' AND subject_id='pipeline-player'
		AND performance_metric='dps' AND window_kind='period'`, generation).Scan(&dropped))
	var longCount, longDropped int64
	require.NoError(t, conn.QueryRow(ctx, `SELECT eligible_kills, excluded_kills FROM rating_mastery_accumulators
		WHERE generation_id=$1 AND subject_kind='player' AND subject_id='pipeline-player'
		AND performance_metric='hps' AND window_kind='period'`, generation).Scan(&longCount, &longDropped))
	require.Equal(t, int64(201), longCount)
	require.Equal(t, int64(40), longDropped)
	require.Equal(t, int64(1), dropped, "drop the lowest parse of six")
	require.Equal(t, "ready", checkpoint(generation).Phase)
	require.NoError(t, worker.Work(ctx, job))
	require.Equal(t, "complete", checkpoint(generation).Phase)

	peak := boss("peak", "period")
	require.Len(t, peak, 1)
	require.Equal(t, "pipeline-player", peak[0].PlayerGuid)
	require.InDelta(t, 150, peak[0].BestRaw.Float64, .001)
	mastery := boss("mastery", "period")
	require.Len(t, mastery, 1)
	require.Equal(t, int32(6), mastery[0].EligibleKills)
	require.InDelta(t, 100, mastery[0].BestLockedParse.Float64, .001)
	require.Less(t, mastery[0].Form.Float64, 60.0, "the lowest of six parses must be excluded")
	require.Len(t, boss("ranked_mastery", "period"), 1)
	career := boss("renown", "career")
	require.Len(t, career, 1)
	require.Greater(t, career[0].Score, boss("renown", "period")[0].Score)
	guildBoss, err := q.ListActiveGuildRatingBossScores(ctx, database.ListActiveGuildRatingBossScoresParams{
		TenantID: uuid.Nil, GroupID: group.ID, InstanceName: "Molten Core", EncounterName: "Ragnaros",
		DifficultyName: "Normal", MaxPlayers: 40, RatingMetric: "peak", WindowKind: "period", LimitCount: 10,
	})
	require.NoError(t, err)
	require.Len(t, guildBoss, 1)
	require.Equal(t, guild, guildBoss[0].GuildID)
	guildBoss, err = q.ListActiveGuildRatingBossScores(ctx, database.ListActiveGuildRatingBossScoresParams{
		TenantID: uuid.Nil, GroupID: group.ID, InstanceName: "Molten Core", EncounterName: "Ragnaros",
		RatingMetric: "renown", WindowKind: "career", LimitCount: 10,
	})
	require.NoError(t, err)
	require.Len(t, guildBoss, 1)
	require.Greater(t, guildBoss[0].Score, 15.0)
	for _, instance := range []string{"Molten Core", ""} {
		scopes, err := q.ListActiveRatingScopeScores(ctx, database.ListActiveRatingScopeScoresParams{
			TenantID: uuid.Nil, GroupID: group.ID, InstanceName: instance, DifficultyName: "Normal",
			MaxPlayers: 40, PlayerClass: "MAGE", PerformanceMetric: "dps",
			RatingMetric: "mastery", WindowKind: "period", LimitCount: 10,
		})
		require.NoError(t, err)
		require.Len(t, scopes, 1)
		require.InDelta(t, mastery[0].Score, scopes[0].Score, .001)
		guildScopes, err := q.ListActiveGuildRatingScopeScores(ctx, database.ListActiveGuildRatingScopeScoresParams{
			TenantID: uuid.Nil, GroupID: group.ID, InstanceName: instance, DifficultyName: "Normal",
			MaxPlayers: 40, RatingMetric: "peak", WindowKind: "period", LimitCount: 10,
		})
		require.NoError(t, err)
		require.Len(t, guildScopes, 1)
	}

	// A changed policy after the new snapshot is ready must never replace the
	// already active generation. The worker aborts it before publication.
	var next uuid.UUID
	for i := 0; i < 100; i++ {
		err := worker.Work(ctx, job)
		require.Error(t, err)
		cp, lookupErr := q.GetBuildingRatingRebuildCheckpoint(ctx, uuid.Nil)
		require.NoError(t, lookupErr)
		if next == uuid.Nil {
			next = cp.GenerationID
			require.NotEqual(t, generation, next)
		}
		if cp.Phase == "ready" {
			break
		}
	}
	require.Equal(t, "ready", checkpoint(next).Phase)
	_, err = q.PutRatingBossPolicy(ctx, database.PutRatingBossPolicyParams{
		GroupID: group.ID, InstanceName: "Molten Core", EncounterName: "Ragnaros",
		PeakWeight: 2, MasteryWeight: 1, RenownPoints: 15,
	})
	require.NoError(t, err)
	require.Error(t, worker.Work(ctx, job))
	require.Equal(t, "aborted", checkpoint(next).Phase)
	require.Equal(t, peak, boss("peak", "period"), "stale build must leave the active leaderboard untouched")
}
