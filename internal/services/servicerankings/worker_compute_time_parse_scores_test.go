package servicerankings_test

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/parseargs"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/sync/errgroup"
)

func TestWorkerComputeTimeParseScoresScopesAndLocking(t *testing.T) {
	t.Parallel()
	pool, store, _ := setupTimeParseTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	tenantID, realmID := insertTimeParseTenantRealm(t, pool, "locked-time-scopes")
	var serverID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, "SELECT server_id FROM wow_server_realms WHERE id = $1", realmID).Scan(&serverID))
	realm2 := uuid.New()
	_, err := pool.Exec(ctx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realm2, serverID, "locked-time-realm-2")
	require.NoError(t, err)
	guild1, guild2 := uuid.New(), uuid.New()
	_, err = pool.Exec(ctx, "INSERT INTO guilds (id, realm_id, name) VALUES ($1,$2,'Guild One'),($3,$2,'Guild Two')", guild1, realmID, guild2)
	require.NoError(t, err)
	start := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	insert := func(realm uuid.UUID, guild uuid.NullUUID, duration time.Duration, runStart time.Time) uuid.UUID {
		encounters := []timeParseEncounterOpts{{name: "Ragnaros", killType: database.KillTypeClean, boss: true, startTime: runStart.Add(time.Hour), endTime: runStart.Add(2 * time.Hour)}}
		return insertTimeParseInstance(t, pool, store, realm, timeParseInstanceOpts{instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40, qualified: true, durationMs: duration.Milliseconds(), startTime: runStart, guildID: guild, encounters: encounters})
	}
	target := insert(realmID, uuid.NullUUID{UUID: guild1, Valid: true}, 50*time.Minute, start)
	for i := 0; i < 5; i++ {
		runStart := start.AddDate(0, 0, -(i + 1))
		insert(realmID, uuid.NullUUID{UUID: guild1, Valid: true}, time.Duration(100+i*5)*time.Minute, runStart)
	}
	for i := 0; i < 5; i++ {
		runStart := start.AddDate(0, 0, -(i + 1))
		insert(realmID, uuid.NullUUID{UUID: guild2, Valid: true}, time.Duration(10+i*5)*time.Minute, runStart)
	}
	for i := 0; i < 5; i++ {
		runStart := start.AddDate(0, 0, -(i + 1))
		insert(realm2, uuid.NullUUID{}, time.Duration(20+i*5)*time.Minute, runStart)
	}
	insert(realm2, uuid.NullUUID{}, 5*time.Minute, start.AddDate(0, 0, -61))
	insert(realm2, uuid.NullUUID{}, 5*time.Minute, start.Add(time.Hour))

	refreshTimeParseMemberships(t, ctx, store)
	// Canonical publication can precede this independent raw-duration stage.
	_, err = servicerankings.RefreshRankingRuns(ctx, store, []uuid.UUID{target})
	require.NoError(t, err)
	worker := &servicerankings.WorkerComputeTimeParseScores{Store: store, Logger: slog.Default()}
	job := &river.Job[parseargs.ArgsComputeTimeParseScores]{Args: parseargs.ArgsComputeTimeParseScores{InstanceID: target, TenantID: tenantID, Force: true}}
	require.NoError(t, worker.Work(ctx, job))
	score, err := store.GetTimeParseScoreForContract(ctx, database.GetTimeParseScoreForContractParams{TenantID: tenantID, InstanceID: target, LookbackDays: servicerankings.TimeParseScoreLookbackDays, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion})
	require.NoError(t, err)
	assert.True(t, score.Cutoff.Time.Equal(start))
	assert.True(t, score.WindowStart.Time.Equal(start.AddDate(0, 0, -int(servicerankings.TimeParseScoreLookbackDays))))
	rows, err := store.ListTimeParseBossScoresForScore(ctx, score.ID)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, int32(15), score.ClearServerSampleSize.Int32)
	assert.Equal(t, int32(10), score.ClearRealmSampleSize.Int32)
	assert.Equal(t, int32(5), score.ClearGuildSampleSize.Int32)
	assert.Greater(t, score.ClearGuildDisplayScore.Int16, score.ClearRealmDisplayScore.Int16)
	assert.Greater(t, score.ClearRealmDisplayScore.Int16, score.ClearServerDisplayScore.Int16)
	assert.Equal(t, int32(15), rows[0].ServerSampleSize)
	assert.Equal(t, int32(10), rows[0].RealmSampleSize)
	assert.Equal(t, int32(5), rows[0].GuildSampleSize.Int32)

	insert(realm2, uuid.NullUUID{}, 200*time.Minute, start.Add(-24*time.Hour))
	refreshTimeParseMemberships(t, ctx, store)
	// Missing-only work is locked and leaves the successful score untouched.
	job.Args.Force = false
	require.NoError(t, worker.Work(ctx, job))
	locked, err := store.GetTimeParseScoreForContract(ctx, database.GetTimeParseScoreForContractParams{TenantID: tenantID, InstanceID: target, LookbackDays: servicerankings.TimeParseScoreLookbackDays, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion})
	require.NoError(t, err)
	assert.Equal(t, score.ID, locked.ID)

	job.Args.Force = true
	require.NoError(t, worker.Work(ctx, job))
	replaced, err := store.GetTimeParseScoreForContract(ctx, database.GetTimeParseScoreForContractParams{TenantID: tenantID, InstanceID: target, LookbackDays: servicerankings.TimeParseScoreLookbackDays, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion})
	require.NoError(t, err)
	tenantCtx := servicetenant.WithTenantID(ctx, tenantID)
	require.NoError(t, store.InTx(tenantCtx, func(tx database.Store) error {
		raw, ok := database.PGXTx(tx)
		require.True(t, ok)
		var source uuid.UUID
		var duration int64
		err := raw.QueryRow(tenantCtx, `SELECT source_time_parse_score_id,duration_ms FROM leaderboard_guild_clear_observations WHERE tenant_id=$1 AND run_id=$2`, tenantID, target).Scan(&source, &duration)
		require.NoError(t, err)
		require.Equal(t, replaced.ID, source)
		require.Equal(t, (50 * time.Minute).Milliseconds(), duration)
		var pending int
		require.NoError(t, raw.QueryRow(tenantCtx, `SELECT count(*) FROM leaderboard_dirty_runs WHERE tenant_id=$1`, tenantID).Scan(&pending))
		require.Zero(t, pending)
		return nil
	}, nil))
	assert.NotEqual(t, score.ID, replaced.ID)
}

func TestMixedDifficultyExcludesClearButKeepsBossCohorts(t *testing.T) {
	t.Parallel()
	pool, store, _ := setupTimeParseTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	tenantID, realmID := insertTimeParseTenantRealm(t, pool, "mixed-difficulty-time")
	start := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)

	instanceID := insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
		instanceName: "Icecrown Citadel", difficultyName: "25 Player", maxPlayers: 25,
		mixedDifficulty: true, qualified: true, durationMs: (2 * time.Hour).Milliseconds(), startTime: start,
		encounters: []timeParseEncounterOpts{
			{name: "Lord Marrowgar", killType: database.KillTypeClean, boss: true, difficultyName: "25 Player", maxPlayers: 25, startTime: start.Add(time.Hour), endTime: start.Add(70 * time.Minute)},
			{name: "Lady Deathwhisper", killType: database.KillTypeClean, boss: true, difficultyName: "25 Player (Heroic)", maxPlayers: 25, dynamicDifficulty: 1, startTime: start.Add(80 * time.Minute), endTime: start.Add(95 * time.Minute)},
		},
	})

	refreshTimeParseMemberships(t, ctx, store)
	clears, err := store.ListTimeParseClearTimeMemberships(ctx, database.ListTimeParseClearTimeMembershipsParams{
		TenantID: tenantID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	})
	require.NoError(t, err)
	require.Empty(t, clears)

	bosses, err := store.ListTimeParseBossKillMemberships(ctx, database.ListTimeParseBossKillMembershipsParams{
		TenantID: tenantID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	})
	require.NoError(t, err)
	require.Len(t, bosses, 2)
	byName := map[string]database.TimeParseBossKillMembership{}
	for _, boss := range bosses {
		byName[boss.EncounterName] = boss
	}
	require.Equal(t, instanceID, byName["Lord Marrowgar"].InstanceID)
	require.Equal(t, "25 Player", byName["Lord Marrowgar"].DifficultyName)
	require.Equal(t, "25 Player (Heroic)", byName["Lady Deathwhisper"].DifficultyName)
}

func TestWorkerComputeTimeParseScoresPersistsSampleTooSmall(t *testing.T) {
	t.Parallel()
	pool, store, _ := setupTimeParseTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	tenantID, realmID := insertTimeParseTenantRealm(t, pool, "locked-time-small")
	start := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	target := insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{instanceName: "Onyxia's Lair", difficultyName: "Normal", maxPlayers: 40, qualified: true, durationMs: int64(time.Hour / time.Millisecond), startTime: start})
	refreshTimeParseMemberships(t, ctx, store)
	worker := &servicerankings.WorkerComputeTimeParseScores{Store: store, Logger: slog.Default()}
	require.NoError(t, worker.Work(ctx, &river.Job[parseargs.ArgsComputeTimeParseScores]{Args: parseargs.ArgsComputeTimeParseScores{InstanceID: target, TenantID: tenantID, Force: true}}))
	score, err := store.GetTimeParseScoreForContract(ctx, database.GetTimeParseScoreForContractParams{TenantID: tenantID, InstanceID: target, LookbackDays: servicerankings.TimeParseScoreLookbackDays, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion})
	require.NoError(t, err)
	rows, err := store.ListTimeParseBossScoresForScore(ctx, score.ID)
	require.NoError(t, err)
	assert.Empty(t, rows)
	assert.Equal(t, string(timeparsepolicy.StatusSampleTooSmall), score.ClearServerStatus.String)
	assert.Equal(t, string(timeparsepolicy.StatusSampleTooSmall), score.ClearRealmStatus.String)
	assert.Zero(t, score.ClearServerSampleSize.Int32)
	assert.Zero(t, score.ClearRealmSampleSize.Int32)
}

func TestWorkerComputeTimeParseScoresRejectsMismatchedTenant(t *testing.T) {
	t.Parallel()
	pool, store, _ := setupTimeParseTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	_, realmID := insertTimeParseTenantRealm(t, pool, "locked-time-tenant-owner")
	otherTenantID, _ := insertTimeParseTenantRealm(t, pool, "locked-time-tenant-other")
	start := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	target := insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
		instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
		qualified: true, durationMs: int64(time.Hour / time.Millisecond), startTime: start,
	})
	refreshTimeParseMemberships(t, ctx, store)

	worker := &servicerankings.WorkerComputeTimeParseScores{Store: store, Logger: slog.Default()}
	err := worker.Work(ctx, &river.Job[parseargs.ArgsComputeTimeParseScores]{Args: parseargs.ArgsComputeTimeParseScores{
		InstanceID: target, TenantID: otherTenantID, Force: true,
	}})
	require.ErrorContains(t, err, "outside tenant")
	_, err = store.GetTimeParseScoreForContract(ctx, database.GetTimeParseScoreForContractParams{
		TenantID: otherTenantID, InstanceID: target, LookbackDays: servicerankings.TimeParseScoreLookbackDays,
		PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	})
	assert.True(t, errors.Is(err, pgx.ErrNoRows))
}

func TestWorkerComputeTimeParseScoresSerializesConcurrentReplacement(t *testing.T) {
	t.Parallel()
	pool, store, _ := setupTimeParseTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	tenantID, realmID := insertTimeParseTenantRealm(t, pool, "locked-time-concurrent")
	start := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	target := insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
		instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
		qualified: true, durationMs: int64(time.Hour / time.Millisecond), startTime: start,
	})
	refreshTimeParseMemberships(t, ctx, store)

	worker := &servicerankings.WorkerComputeTimeParseScores{Store: store, Logger: slog.Default()}
	args := parseargs.ArgsComputeTimeParseScores{InstanceID: target, TenantID: tenantID, Force: true}
	var group errgroup.Group
	for range 2 {
		group.Go(func() error {
			return worker.Work(ctx, &river.Job[parseargs.ArgsComputeTimeParseScores]{Args: args})
		})
	}
	require.NoError(t, group.Wait())

	score, err := store.GetTimeParseScoreForContract(ctx, database.GetTimeParseScoreForContractParams{
		TenantID: tenantID, InstanceID: target, LookbackDays: servicerankings.TimeParseScoreLookbackDays,
		PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	})
	require.NoError(t, err)
	rows, err := store.ListTimeParseBossScoresForScore(ctx, score.ID)
	require.NoError(t, err)
	assert.Empty(t, rows)
	var scoreCount int
	require.NoError(t, pool.QueryRow(ctx, "SELECT count(*) FROM time_parse_scores WHERE tenant_id = $1 AND instance_id = $2", tenantID, target).Scan(&scoreCount))
	assert.Equal(t, 1, scoreCount)
}

func TestWorkerComputeTimeParseScoresSkipsUnqualifiedClear(t *testing.T) {
	t.Parallel()
	pool, store, _ := setupTimeParseTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	tenantID, realmID := insertTimeParseTenantRealm(t, pool, "locked-time-unqualified")
	start := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	target := insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
		instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
		qualified: false, durationMs: int64(time.Hour / time.Millisecond), startTime: start,
	})
	refreshTimeParseMemberships(t, ctx, store)

	worker := &servicerankings.WorkerComputeTimeParseScores{Store: store, Logger: slog.Default()}
	require.NoError(t, worker.Work(ctx, &river.Job[parseargs.ArgsComputeTimeParseScores]{Args: parseargs.ArgsComputeTimeParseScores{
		InstanceID: target, TenantID: tenantID, Force: true,
	}}))
	score, err := store.GetTimeParseScoreForContract(ctx, database.GetTimeParseScoreForContractParams{
		TenantID: tenantID, InstanceID: target, LookbackDays: servicerankings.TimeParseScoreLookbackDays,
		PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	})
	require.NoError(t, err)
	rows, err := store.ListTimeParseBossScoresForScore(ctx, score.ID)
	require.NoError(t, err)
	assert.Empty(t, rows)
	resp, body := callTimeParsesWithContext(t, servicetenant.WithTenantID(ctx, tenantID), store, target.String(), "")
	assert.Equal(t, 200, resp.StatusCode)
	assert.True(t, body.Available)
	assert.Equal(t, "no_time_data", body.Scopes[servicerankings.TimeParseScopeServer].Reason)
	assert.False(t, score.ClearDurationMs.Valid)
	assert.False(t, score.ClearServerStatus.Valid)
	assert.False(t, score.ClearRealmStatus.Valid)
}

func refreshTimeParseMemberships(t *testing.T, ctx context.Context, store database.Store) {
	t.Helper()
	groups, err := store.ListAllWoWLogGroupsWithOwner(ctx)
	require.NoError(t, err)
	for _, group := range groups {
		_, err = store.RefreshTimeParseClearTimeMembershipsForLogGroup(ctx, database.RefreshTimeParseClearTimeMembershipsForLogGroupParams{LogGroupID: group.WoWLogGroup.ID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion})
		require.NoError(t, err)
		_, err = store.RefreshTimeParseBossKillMembershipsForLogGroup(ctx, database.RefreshTimeParseBossKillMembershipsForLogGroupParams{LogGroupID: group.WoWLogGroup.ID, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion})
		require.NoError(t, err)
	}
}

func TestArgsBackfillTimeParseScoresUniqueStates(t *testing.T) {
	t.Parallel()

	states := servicerankings.ArgsBackfillTimeParseScores{}.InsertOpts().UniqueOpts.ByState
	assert.Contains(t, states, rivertype.JobStateScheduled)
	assert.Contains(t, states, rivertype.JobStatePending)
	assert.Contains(t, states, rivertype.JobStateAvailable)
	assert.Contains(t, states, rivertype.JobStateRunning)
}

func TestWorkerBackfillTimeParseScoresMissingOnlyBatchAndTenant(t *testing.T) {
	t.Parallel()
	pool, store, _ := setupTimeParseTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	tenantID, realmID := insertTimeParseTenantRealm(t, pool, "locked-time-backfill")
	_, otherRealm := insertTimeParseTenantRealm(t, pool, "locked-time-backfill-other")
	start := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	makeRun := func(realm uuid.UUID) uuid.UUID {
		return insertTimeParseInstance(t, pool, store, realm, timeParseInstanceOpts{instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40, qualified: true, durationMs: int64(time.Hour / time.Millisecond), startTime: start})
	}
	first, second := makeRun(realmID), makeRun(realmID)
	_ = makeRun(otherRealm)
	refreshTimeParseMemberships(t, ctx, store)
	compute := &servicerankings.WorkerComputeTimeParseScores{Store: store, Logger: slog.Default()}
	require.NoError(t, compute.Work(ctx, &river.Job[parseargs.ArgsComputeTimeParseScores]{Args: parseargs.ArgsComputeTimeParseScores{InstanceID: first, TenantID: tenantID, Force: true}}))

	q := setupParseScoreQueueForTest(t, pool)
	worker := &servicerankings.WorkerBackfillTimeParseScores{Store: store, Queue: q, Logger: slog.Default()}
	require.NoError(t, worker.Work(ctx, &river.Job[servicerankings.ArgsBackfillTimeParseScores]{Args: servicerankings.ArgsBackfillTimeParseScores{TenantID: &tenantID, BatchSize: 1}}))
	var count int
	require.NoError(t, pool.QueryRow(ctx, `SELECT COUNT(*) FROM river_job WHERE kind = $1 AND args->>'tenant_id' = $2`, parseargs.KindComputeTimeParseScores, tenantID.String()).Scan(&count))
	assert.Equal(t, 1, count)
	var queuedID string
	require.NoError(t, pool.QueryRow(ctx, `SELECT args->>'instance_id' FROM river_job WHERE kind = $1 AND args->>'tenant_id' = $2 LIMIT 1`, parseargs.KindComputeTimeParseScores, tenantID.String()).Scan(&queuedID))
	assert.Equal(t, second.String(), queuedID)
}

func TestWorkerComputeTimeParseScoresSameBossDifficultyVariants(t *testing.T) {
	t.Parallel()
	pool, store, _ := setupTimeParseTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	tenantID, realmID := insertTimeParseTenantRealm(t, pool, "same-boss-difficulty")
	start := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	target := insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
		instanceName: "Icecrown Citadel", difficultyName: "25 Player", maxPlayers: 25,
		mixedDifficulty: true, qualified: true, durationMs: (2 * time.Hour).Milliseconds(), startTime: start,
		encounters: []timeParseEncounterOpts{
			{name: "Boss", killType: database.KillTypeClean, boss: true, startTime: start, endTime: start.Add(time.Minute)},
			{name: "Boss", killType: database.KillTypeClean, boss: true, startTime: start.Add(time.Hour), endTime: start.Add(time.Hour + 2*time.Minute)},
		},
	})
	_, err := pool.Exec(ctx, `UPDATE log_instance_encounters SET difficulty=CASE WHEN start_time=$2 THEN '' ELSE 'heroic' END WHERE instance_id=$1`, target, start)
	require.NoError(t, err)
	refreshTimeParseMemberships(t, ctx, store)
	worker := &servicerankings.WorkerComputeTimeParseScores{Store: store, Logger: slog.Default()}
	require.NoError(t, worker.Work(ctx, &river.Job[parseargs.ArgsComputeTimeParseScores]{Args: parseargs.ArgsComputeTimeParseScores{InstanceID: target, TenantID: tenantID, Force: true}}))
	score, err := store.GetTimeParseScoreForContract(ctx, database.GetTimeParseScoreForContractParams{TenantID: tenantID, InstanceID: target, LookbackDays: servicerankings.TimeParseScoreLookbackDays, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion})
	require.NoError(t, err)
	require.False(t, score.ClearDurationMs.Valid)
	bosses, err := store.ListTimeParseBossScoresForScore(ctx, score.ID)
	require.NoError(t, err)
	require.Len(t, bosses, 2)
	require.NotEqual(t, bosses[0].EncounterID, bosses[1].EncounterID)
	require.ElementsMatch(t, []int64{60000, 120000}, []int64{bosses[0].DurationMs, bosses[1].DurationMs})
}
