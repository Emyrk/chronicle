package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestRatingStageRawGuildlessAndReplay(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, store, realm := setupParsesTest(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	cutoff := time.Now().UTC().Add(time.Hour)
	slow, fast := uuid.New(), uuid.New()
	for _, input := range []struct {
		id      uuid.UUID
		seconds float64
	}{{slow, 10}, {fast, 6}} {
		insertRankingRow(t, pool, store, realm, rankingOpts{
			instanceID: input.id, instanceName: "Raid", encounterName: "Boss",
			playerGUID: input.id.String(), playerClass: "MAGE", difficultyName: "Normal",
			maxPlayers: 40, durationSecs: input.seconds, dps: 100,
			killedAt: cutoff.Add(-2 * time.Hour), isBoss: true,
		})
		sources, err := q.RankingRunSources(ctx, []uuid.UUID{input.id})
		require.NoError(t, err)
		require.Len(t, sources, 1)
		_, err = q.UpsertRankingRun(ctx, database.UpsertRankingRunParams(sources[0]))
		require.NoError(t, err)
		_, err = conn.Exec(ctx, "UPDATE log_instances SET difficulty_name='Normal', max_players=40 WHERE id=$1", input.id)
		require.NoError(t, err)
	}
	guild := uuid.New()
	_, err = conn.Exec(ctx, "INSERT INTO guilds (id,realm_id,name) VALUES ($1,$2,'Stage Guild')", guild, realm)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "UPDATE log_instances SET guild_id=$1 WHERE id=$2", guild, slow)
	require.NoError(t, err)
	generation, err := q.InsertRatingScoreGeneration(ctx, database.InsertRatingScoreGenerationParams{
		TenantID: uuid.Nil, PolicyVersion: 1, AsOf: database.Timestamptz(cutoff),
	})
	require.NoError(t, err)
	runs := []uuid.UUID{slow, fast}
	firstPage, err := q.ListRatingStageRunsForTenant(ctx, database.ListRatingStageRunsForTenantParams{
		TenantID: uuid.Nil, AfterRunID: uuid.Nil, SourceCutoff: database.Timestamptz(cutoff), BatchSize: 1,
	})
	require.NoError(t, err)
	require.Len(t, firstPage, 1)
	secondPage, err := q.ListRatingStageRunsForTenant(ctx, database.ListRatingStageRunsForTenantParams{
		TenantID: uuid.Nil, AfterRunID: firstPage[0], SourceCutoff: database.Timestamptz(cutoff), BatchSize: 1,
	})
	require.NoError(t, err)
	require.Len(t, secondPage, 1)
	require.NotEqual(t, firstPage[0], secondPage[0])
	gp := database.StageRatingGuildRunsParams{TenantID: uuid.Nil, GenerationID: generation.ID,
		RunIds: runs, SourceCutoff: database.Timestamptz(cutoff)}
	n, err := q.StageRatingGuildRuns(ctx, gp)
	require.NoError(t, err)
	require.Equal(t, int64(2), n)
	n, err = q.StageRatingGuildRuns(ctx, gp)
	require.NoError(t, err)
	require.Zero(t, n)
	pp := database.StageRatingPlayerRunsParams{TenantID: uuid.Nil, GenerationID: generation.ID,
		RunIds: runs, Metric: "dps", SourceCutoff: database.Timestamptz(cutoff)}
	n, err = q.StageRatingPlayerRuns(ctx, pp)
	require.NoError(t, err)
	require.Equal(t, int64(2), n)
	n, err = q.StageRatingPlayerRuns(ctx, pp)
	require.NoError(t, err)
	require.Zero(t, n)
	var raw float64
	err = conn.QueryRow(ctx, `SELECT min(raw_duration_ms) FROM rating_stage_guild_observations
        WHERE generation_id=$1 AND instance_name='Raid' AND encounter_name='Boss'`, generation.ID).Scan(&raw)
	require.NoError(t, err)
	require.Equal(t, 6000.0, raw, "guild-less evidence sets tenant-wide rank one")
	var awarded, guildless int
	err = conn.QueryRow(ctx, `SELECT count(*) FILTER (WHERE guild_id IS NOT NULL),
        count(*) FILTER (WHERE guild_id IS NULL) FROM rating_stage_guild_observations
        WHERE generation_id=$1`, generation.ID).Scan(&awarded, &guildless)
	require.NoError(t, err)
	require.Equal(t, 1, awarded)
	require.Equal(t, 1, guildless)
	// A future source update cannot rewrite an already frozen observation.
	_, err = conn.Exec(ctx, "UPDATE log_instance_encounters SET start_time = end_time - INTERVAL '1 second' WHERE instance_id=$1", fast)
	require.NoError(t, err)
	n, err = q.StageRatingGuildRuns(ctx, gp)
	require.NoError(t, err)
	require.Zero(t, n)
}

func TestRatingStageRenownPageCursor(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	pool, _, realm := setupParsesTest(t)
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	q := database.NewQueries(conn)
	cutoff := database.Timestamptz(time.Now().UTC().Add(time.Hour))
	generation, err := q.InsertRatingScoreGeneration(ctx, database.InsertRatingScoreGenerationParams{
		TenantID: uuid.Nil, PolicyVersion: 1, AsOf: cutoff,
	})
	require.NoError(t, err)
	for _, name := range []string{"A", "B", "C"} {
		_, err = conn.Exec(ctx, `INSERT INTO renown_kill_facts
            (realm_id, player_guid, run_id, instance_name, encounter_name, killed_at)
            VALUES ($1, 'player', $2, 'Raid', $3, now())`, realm, uuid.New(), name)
		require.NoError(t, err)
	}
	page := database.ListRatingPlayerRenownSourcePageParams{RealmID: realm,
		AfterPlayerGuid: "", AfterRunID: uuid.Nil, AfterEncounterName: "", SourceCutoff: cutoff, BatchSize: 1}
	first, err := q.ListRatingPlayerRenownSourcePage(ctx, page)
	require.NoError(t, err)
	require.Len(t, first, 1)
	staged := database.StageRatingPlayerRenownPageParams{GenerationID: generation.ID,
		TenantID: uuid.Nil, RealmID: realm, AfterPlayerGuid: "", AfterRunID: uuid.Nil,
		AfterEncounterName: "", SourceCutoff: cutoff, BatchSize: 1}
	count, err := q.StageRatingPlayerRenownPage(ctx, staged)
	require.NoError(t, err)
	require.Equal(t, int64(1), count)
	count, err = q.StageRatingPlayerRenownPage(ctx, staged)
	require.NoError(t, err)
	require.Zero(t, count)
	page.AfterPlayerGuid, page.AfterRunID, page.AfterEncounterName = first[0].PlayerGuid, first[0].RunID, first[0].EncounterName
	second, err := q.ListRatingPlayerRenownSourcePage(ctx, page)
	require.NoError(t, err)
	require.Len(t, second, 1)
	require.NotEqual(t, first[0].ID, second[0].ID)
	staged.AfterPlayerGuid, staged.AfterRunID, staged.AfterEncounterName = page.AfterPlayerGuid, page.AfterRunID, page.AfterEncounterName
	count, err = q.StageRatingPlayerRenownPage(ctx, staged)
	require.NoError(t, err)
	require.Equal(t, int64(1), count)
}
