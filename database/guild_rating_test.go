package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestGuildRatingCanonicalGuildlessAndDurableFacts(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, store, realm := setupParsesTest(t)
	guild := uuid.New()
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	var server uuid.UUID
	err = conn.QueryRow(ctx, "SELECT server_id FROM wow_server_realms WHERE id = $1", realm).Scan(&server)
	require.NoError(t, err)
	group, err := q.CreateRatingRealmGroup(ctx, database.CreateRatingRealmGroupParams{
		Name: "Guild Rating", ServerID: server, TenantID: uuid.Nil,
	})
	require.NoError(t, err)
	_, err = q.AssignRatingRealmToGroup(ctx, database.AssignRatingRealmToGroupParams{
		RealmID: realm, GroupID: group.ID, TenantID: uuid.Nil,
	})
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO guilds(id, realm_id, name) VALUES ($1, $2, 'Rating Guild')", guild, realm)
	require.NoError(t, err)
	killed := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	guildInstance, guildlessInstance := uuid.New(), uuid.New()
	for _, id := range []uuid.UUID{guildInstance, guildlessInstance} {
		insertRankingRow(t, pool, store, realm, rankingOpts{
			instanceID: id, instanceName: "Molten Core", encounterName: "Ragnaros",
			playerGUID: id.String(), playerClass: "MAGE", difficultyName: "Normal",
			maxPlayers: 40, damageDone: 1000, durationSecs: 10, dps: 100,
			killedAt: killed, isBoss: true,
		})
	}
	_, err = conn.Exec(ctx, "UPDATE log_instances SET guild_id = $1 WHERE id = $2", guild, guildInstance)
	require.NoError(t, err)
	for _, id := range []uuid.UUID{guildInstance, guildlessInstance} {
		sources, err := q.RankingRunSources(ctx, []uuid.UUID{id})
		require.NoError(t, err)
		require.Len(t, sources, 1)
		_, err = q.UpsertRankingRun(ctx, database.UpsertRankingRunParams(sources[0]))
		require.NoError(t, err)
	}
	page, err := q.ListRatingRunsForTenant(ctx, database.ListRatingRunsForTenantParams{
		TenantID: uuid.Nil, BatchSize: 1,
	})
	require.NoError(t, err)
	require.Len(t, page, 1)
	next, err := q.ListRatingRunsForTenant(ctx, database.ListRatingRunsForTenantParams{
		TenantID: uuid.Nil, AfterRunID: page[0], BatchSize: 1,
	})
	require.NoError(t, err)
	require.Len(t, next, 1, "guild-less run participates without a rating group")
	// A locked boss time parse qualifies only the matching guild's observation.
	var scoredGroup, encounter uuid.UUID
	err = conn.QueryRow(ctx, "SELECT log_group_id FROM log_instances WHERE id = $1", guildInstance).Scan(&scoredGroup)
	require.NoError(t, err)
	err = conn.QueryRow(ctx, "SELECT encounter_id FROM encounter_dps_rankings WHERE instance_id = $1", guildInstance).Scan(&encounter)
	require.NoError(t, err)
	var timeScore uuid.UUID
	err = conn.QueryRow(ctx, `INSERT INTO time_parse_scores
		(tenant_id, instance_id, run_id, log_group_id, realm_id, guild_id,
		 cutoff, window_start, lookback_days, policy_version, query_version)
		VALUES ($1, $2, $2, $3, $4, $5, $6, $6, 7, 1, 1) RETURNING id`,
		uuid.Nil, guildInstance, scoredGroup, realm, guild, killed).Scan(&timeScore)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `INSERT INTO time_parse_boss_scores
		(time_parse_score_id, encounter_id, encounter_name, duration_ms,
		 server_precise_score, server_display_score, server_rank, server_sample_size, server_status,
		 realm_precise_score, realm_display_score, realm_rank, realm_sample_size, realm_status)
		VALUES ($1, $2, 'Ragnaros', 10000, 73, 73, 1, 1, 'ok', 73, 73, 1, 1, 'ok')`,
		timeScore, encounter)
	require.NoError(t, err)
	observations, err := q.GuildRatingObservationsForRuns(ctx, database.GuildRatingObservationsForRunsParams{
		TenantID: uuid.Nil, RunIds: []uuid.UUID{guildInstance, guildlessInstance},
	})
	require.NoError(t, err)
	require.Len(t, observations, 2)
	for _, row := range observations {
		require.InDelta(t, 10000, row.RawDurationMs, 0.001)
		require.Equal(t, row.RunID == guildInstance, row.HasLockedParse)
		if row.HasLockedParse {
			require.InDelta(t, 73, row.LockedParse, 0.001)
		}
		require.Equal(t, row.RunID == guildInstance, row.GuildID.Valid)
	}
	_, err = conn.Exec(ctx, "DELETE FROM encounter_dps_rankings WHERE instance_id = $1", guildInstance)
	require.NoError(t, err, "guild clean-kill credit must not depend on player damage rows")
	added, err := q.BackfillGuildRenownFactsForSource(ctx, database.BackfillGuildRenownFactsForSourceParams{
		TenantID: uuid.Nil, RunID: guildInstance, RepresentativeInstanceID: guildInstance,
	})
	require.NoError(t, err)
	require.Equal(t, int64(1), added)
	added, err = q.BackfillGuildRenownFactsForRun(ctx, database.BackfillGuildRenownFactsForRunParams{
		TenantID: uuid.Nil, RunID: guildInstance,
	})
	require.NoError(t, err)
	require.Zero(t, added, "idempotent across source and canonical backfill")
	added, err = q.BackfillGuildRenownFactsForSource(ctx, database.BackfillGuildRenownFactsForSourceParams{
		TenantID: uuid.Nil, RunID: guildlessInstance, RepresentativeInstanceID: guildlessInstance,
	})
	require.NoError(t, err)
	require.Zero(t, added)
	groupFacts, err := q.ListGroupGuildRenownFacts(ctx, database.ListGroupGuildRenownFactsParams{
		TenantID: uuid.Nil, GroupID: group.ID, WindowEnd: database.Timestamptz(killed.Add(time.Hour)),
		AfterKilledAt: database.Timestamptz(killed.Add(-time.Hour)), BatchSize: 1,
	})
	require.NoError(t, err)
	require.Len(t, groupFacts, 1)
	require.Equal(t, guild, groupFacts[0].GuildID)
	nextFacts, err := q.ListGroupGuildRenownFacts(ctx, database.ListGroupGuildRenownFactsParams{
		TenantID: uuid.Nil, GroupID: group.ID, WindowEnd: database.Timestamptz(killed.Add(time.Hour)),
		AfterKilledAt: groupFacts[0].KilledAt, AfterID: groupFacts[0].ID, BatchSize: 1,
	})
	require.NoError(t, err)
	require.Empty(t, nextFacts)
	otherGuild := uuid.New()
	_, err = conn.Exec(ctx, "INSERT INTO guilds(id, realm_id, name) VALUES ($1, $2, 'Corrected Guild')", otherGuild, realm)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "UPDATE log_instances SET guild_id = $1 WHERE id = $2", otherGuild, guildInstance)
	require.NoError(t, err)
	added, err = q.BackfillGuildRenownFactsForRun(ctx, database.BackfillGuildRenownFactsForRunParams{
		TenantID: uuid.Nil, RunID: guildInstance,
	})
	require.NoError(t, err)
	require.Zero(t, added, "a corrected duplicate cannot award a second guild for the same boss kill")
	_, err = q.DeleteLogInstancesByIDs(ctx, []uuid.UUID{guildInstance})
	require.NoError(t, err)
	facts, err := q.ListGuildRenownFacts(ctx, database.ListGuildRenownFactsParams{
		TenantID: uuid.Nil, RealmID: realm, GuildID: guild, LimitCount: 10,
	})
	require.NoError(t, err)
	require.Len(t, facts, 1, "earned guild attendance survives source deletion")
}

func TestGuildRatingActiveProjection(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _, realm := setupParsesTest(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	guild := uuid.New()
	var server uuid.UUID
	err = conn.QueryRow(ctx, "SELECT server_id FROM wow_server_realms WHERE id = $1", realm).Scan(&server)
	require.NoError(t, err)
	group, err := q.CreateRatingRealmGroup(ctx, database.CreateRatingRealmGroupParams{
		Name: "Guild Projection", ServerID: server, TenantID: uuid.Nil,
	})
	require.NoError(t, err)
	_, err = q.AssignRatingRealmToGroup(ctx, database.AssignRatingRealmToGroupParams{
		RealmID: realm, GroupID: group.ID, TenantID: uuid.Nil,
	})
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO guilds(id, realm_id, name) VALUES ($1, $2, 'Projection Guild')", guild, realm)
	require.NoError(t, err)
	generation, err := q.InsertRatingScoreGeneration(ctx, database.InsertRatingScoreGenerationParams{
		TenantID: uuid.Nil, PolicyVersion: 1, AsOf: database.Timestamptz(time.Now()),
	})
	require.NoError(t, err)
	require.NoError(t, q.InsertGuildRatingBossScore(ctx, database.InsertGuildRatingBossScoreParams{
		GenerationID: generation.ID, TenantID: uuid.Nil, RealmID: realm, GuildID: guild, GroupID: group.ID,
		InstanceName: "Molten Core", EncounterName: "Ragnaros", DifficultyName: "Normal",
		MaxPlayers: 40, RatingMetric: "peak", WindowKind: "all_time", Score: 85,
	}))
	require.NoError(t, q.InsertGuildRatingScopeScore(ctx, database.InsertGuildRatingScopeScoreParams{
		GenerationID: generation.ID, TenantID: uuid.Nil, RealmID: realm, GuildID: guild, GroupID: group.ID,
		InstanceName: "", DifficultyName: "Normal", MaxPlayers: 40,
		RatingMetric: "peak", WindowKind: "all_time", Score: 80,
	}))
	bossArgs := database.ListActiveGuildRatingBossScoresParams{
		TenantID: uuid.Nil, GroupID: group.ID, InstanceName: "Molten Core", EncounterName: "Ragnaros",
		DifficultyName: "Normal", MaxPlayers: 40, RatingMetric: "peak", WindowKind: "all_time", LimitCount: 10,
	}
	scopeArgs := database.ListActiveGuildRatingScopeScoresParams{
		TenantID: uuid.Nil, GroupID: group.ID, InstanceName: "", DifficultyName: "Normal", MaxPlayers: 40,
		RatingMetric: "peak", WindowKind: "all_time", LimitCount: 10,
	}
	bosses, err := q.ListActiveGuildRatingBossScores(ctx, bossArgs)
	require.NoError(t, err)
	require.Empty(t, bosses)
	scopes, err := q.ListActiveGuildRatingScopeScores(ctx, scopeArgs)
	require.NoError(t, err)
	require.Empty(t, scopes)
	affected, err := q.ActivateRatingScoreGeneration(ctx, database.ActivateRatingScoreGenerationParams{
		TenantID: uuid.Nil, GenerationID: generation.ID,
	})
	require.NoError(t, err)
	require.Equal(t, int64(1), affected)
	bosses, err = q.ListActiveGuildRatingBossScores(ctx, bossArgs)
	require.NoError(t, err)
	require.Len(t, bosses, 1)
	require.Equal(t, guild, bosses[0].GuildID)
	scopes, err = q.ListActiveGuildRatingScopeScores(ctx, scopeArgs)
	require.NoError(t, err)
	require.Len(t, scopes, 1)
	require.Equal(t, 80.0, scopes[0].Score)
	// A realm reassignment cannot expose a score calculated for its old group.
	otherGroup, err := q.CreateRatingRealmGroup(ctx, database.CreateRatingRealmGroupParams{
		Name: "New Guild Group", ServerID: server, TenantID: uuid.Nil,
	})
	require.NoError(t, err)
	_, err = q.AssignRatingRealmToGroup(ctx, database.AssignRatingRealmToGroupParams{
		RealmID: realm, GroupID: otherGroup.ID, TenantID: uuid.Nil,
	})
	require.NoError(t, err)
	bosses, err = q.ListActiveGuildRatingBossScores(ctx, bossArgs)
	require.NoError(t, err)
	require.Empty(t, bosses)
	scopes, err = q.ListActiveGuildRatingScopeScores(ctx, scopeArgs)
	require.NoError(t, err)
	require.Empty(t, scopes)
}
