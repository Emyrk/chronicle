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
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
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
	encounter := func() []timeParseEncounterOpts {
		return []timeParseEncounterOpts{{name: "Ragnaros", killType: database.KillTypeClean, boss: true, startTime: start.Add(time.Hour), endTime: start.Add(2 * time.Hour)}}
	}
	insert := func(realm uuid.UUID, guild uuid.NullUUID, duration time.Duration) uuid.UUID {
		return insertTimeParseInstance(t, pool, store, realm, timeParseInstanceOpts{instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40, qualified: true, durationMs: duration.Milliseconds(), startTime: start, guildID: guild, encounters: encounter()})
	}
	target := insert(realmID, uuid.NullUUID{UUID: guild1, Valid: true}, 50*time.Minute)
	for i := 0; i < 5; i++ {
		insert(realmID, uuid.NullUUID{UUID: guild1, Valid: true}, time.Duration(100+i*5)*time.Minute)
	}
	for i := 0; i < 5; i++ {
		insert(realmID, uuid.NullUUID{UUID: guild2, Valid: true}, time.Duration(10+i*5)*time.Minute)
	}
	for i := 0; i < 5; i++ {
		insert(realm2, uuid.NullUUID{}, time.Duration(20+i*5)*time.Minute)
	}

	refreshTimeParseMemberships(t, ctx, store)
	worker := &servicerankings.WorkerComputeTimeParseScores{Store: store, Logger: slog.Default()}
	job := &river.Job[parseargs.ArgsComputeTimeParseScores]{Args: parseargs.ArgsComputeTimeParseScores{InstanceID: target, TenantID: tenantID, Force: true, CutoffDate: "2026-10-14"}}
	require.NoError(t, worker.Work(ctx, job))
	receipt, err := store.GetTimeParseScoreReceiptForContract(ctx, database.GetTimeParseScoreReceiptForContractParams{TenantID: tenantID, InstanceID: target, LookbackDays: servicerankings.TimeParseScoreLookbackDays, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion})
	require.NoError(t, err)
	rows, err := store.ListTimeParseScoreResultsForReceipt(ctx, receipt.ID)
	require.NoError(t, err)
	require.Len(t, rows, 6)
	clearSamples := map[string]int32{}
	clearScores := map[string]int16{}
	for _, row := range rows {
		if row.MetricKind == "clear_time" {
			clearSamples[row.Scope], clearScores[row.Scope] = row.SampleSize, row.DisplayScore
		}
	}
	assert.Equal(t, int32(15), clearSamples[servicerankings.TimeParseScopeServer])
	assert.Equal(t, int32(10), clearSamples[servicerankings.TimeParseScopeRealm])
	assert.Equal(t, int32(5), clearSamples[servicerankings.TimeParseScopeGuild])
	assert.Greater(t, clearScores[servicerankings.TimeParseScopeGuild], clearScores[servicerankings.TimeParseScopeRealm])
	assert.Greater(t, clearScores[servicerankings.TimeParseScopeRealm], clearScores[servicerankings.TimeParseScopeServer])

	insert(realm2, uuid.NullUUID{}, 200*time.Minute)
	refreshTimeParseMemberships(t, ctx, store)
	// Missing-only work is locked and leaves the successful receipt untouched.
	job.Args.Force = false
	require.NoError(t, worker.Work(ctx, job))
	locked, err := store.GetTimeParseScoreReceiptForContract(ctx, database.GetTimeParseScoreReceiptForContractParams{TenantID: tenantID, InstanceID: target, LookbackDays: servicerankings.TimeParseScoreLookbackDays, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion})
	require.NoError(t, err)
	assert.Equal(t, receipt.ID, locked.ID)

	job.Args.Force = true
	require.NoError(t, worker.Work(ctx, job))
	replaced, err := store.GetTimeParseScoreReceiptForContract(ctx, database.GetTimeParseScoreReceiptForContractParams{TenantID: tenantID, InstanceID: target, LookbackDays: servicerankings.TimeParseScoreLookbackDays, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion})
	require.NoError(t, err)
	assert.NotEqual(t, receipt.ID, replaced.ID)
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
	require.NoError(t, worker.Work(ctx, &river.Job[parseargs.ArgsComputeTimeParseScores]{Args: parseargs.ArgsComputeTimeParseScores{InstanceID: target, TenantID: tenantID, Force: true, CutoffDate: "2026-10-14"}}))
	receipt, err := store.GetTimeParseScoreReceiptForContract(ctx, database.GetTimeParseScoreReceiptForContractParams{TenantID: tenantID, InstanceID: target, LookbackDays: servicerankings.TimeParseScoreLookbackDays, PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion})
	require.NoError(t, err)
	rows, err := store.ListTimeParseScoreResultsForReceipt(ctx, receipt.ID)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	for _, row := range rows {
		assert.Equal(t, string(timeparsepolicy.StatusSampleTooSmall), row.Status)
		assert.Zero(t, row.SampleSize)
	}
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
		InstanceID: target, TenantID: otherTenantID, Force: true, CutoffDate: "2026-10-14",
	}})
	require.ErrorContains(t, err, "outside tenant")
	_, err = store.GetTimeParseScoreReceiptForContract(ctx, database.GetTimeParseScoreReceiptForContractParams{
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
	args := parseargs.ArgsComputeTimeParseScores{InstanceID: target, TenantID: tenantID, Force: true, CutoffDate: "2026-10-14"}
	var group errgroup.Group
	for range 2 {
		group.Go(func() error {
			return worker.Work(ctx, &river.Job[parseargs.ArgsComputeTimeParseScores]{Args: args})
		})
	}
	require.NoError(t, group.Wait())

	receipt, err := store.GetTimeParseScoreReceiptForContract(ctx, database.GetTimeParseScoreReceiptForContractParams{
		TenantID: tenantID, InstanceID: target, LookbackDays: servicerankings.TimeParseScoreLookbackDays,
		PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	})
	require.NoError(t, err)
	rows, err := store.ListTimeParseScoreResultsForReceipt(ctx, receipt.ID)
	require.NoError(t, err)
	assert.Equal(t, int(receipt.ResultCount), len(rows))
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
		InstanceID: target, TenantID: tenantID, Force: true, CutoffDate: "2026-10-14",
	}}))
	receipt, err := store.GetTimeParseScoreReceiptForContract(ctx, database.GetTimeParseScoreReceiptForContractParams{
		TenantID: tenantID, InstanceID: target, LookbackDays: servicerankings.TimeParseScoreLookbackDays,
		PolicyVersion: timeparsepolicy.PolicyVersion, QueryVersion: timeparsepolicy.QueryVersion,
	})
	require.NoError(t, err)
	rows, err := store.ListTimeParseScoreResultsForReceipt(ctx, receipt.ID)
	require.NoError(t, err)
	assert.Empty(t, rows)
	assert.Zero(t, receipt.SourceCount)
	assert.Zero(t, receipt.ResultCount)
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
	require.NoError(t, compute.Work(ctx, &river.Job[parseargs.ArgsComputeTimeParseScores]{Args: parseargs.ArgsComputeTimeParseScores{InstanceID: first, TenantID: tenantID, Force: true, CutoffDate: "2026-10-14"}}))

	q := setupParseScoreQueueForTest(t, pool)
	worker := &servicerankings.WorkerBackfillTimeParseScores{Store: store, Queue: q, Logger: slog.Default()}
	require.NoError(t, worker.Work(ctx, &river.Job[servicerankings.ArgsBackfillTimeParseScores]{Args: servicerankings.ArgsBackfillTimeParseScores{TenantID: &tenantID, BatchSize: 1, CutoffDate: "2026-10-14"}}))
	var count int
	require.NoError(t, pool.QueryRow(ctx, `SELECT COUNT(*) FROM river_job WHERE kind = $1 AND args->>'tenant_id' = $2`, parseargs.KindComputeTimeParseScores, tenantID.String()).Scan(&count))
	assert.Equal(t, 1, count)
	var queuedID string
	require.NoError(t, pool.QueryRow(ctx, `SELECT args->>'instance_id' FROM river_job WHERE kind = $1 AND args->>'tenant_id' = $2 LIMIT 1`, parseargs.KindComputeTimeParseScores, tenantID.String()).Scan(&queuedID))
	assert.Equal(t, second.String(), queuedID)
}
