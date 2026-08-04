package servicerankings_test

import (
	"fmt"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWorkerComputeParseScores_NoSnapshot(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)

	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)

	// Setup: server, realm, user, log group, instance.
	f := setupScoringFixture(t, pool, store)

	// Insert a receipt for the instance.
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	conn.Release()

	_, err = store.UpsertParseScoreReceipt(ctx, database.UpsertParseScoreReceiptParams{
		TenantID:   uuid.Nil,
		InstanceID: f.instanceID,
	})
	require.NoError(t, err)

	// No snapshot exists. Worker should handle gracefully and not error
	// (it will schedule a retry, but we don't have a queue here).
	worker := &servicerankings.WorkerComputeParseScores{
		Store:  store,
		Logger: slog.Default(),
		// Queue is nil — retry enqueue will fail silently.
	}

	job := &river.Job[servicerankings.ArgsComputeParseScores]{
		JobRow: nil,
		Args: servicerankings.ArgsComputeParseScores{
			InstanceID: f.instanceID,
			TenantID:   uuid.Nil,
			Attempt:    0,
		},
	}

	// With no queue, the handleNoSnapshot path will error on enqueue.
	// But with attempt=3 (exhausted), it marks failed and returns nil.
	job.Args.Attempt = 3
	err = worker.Work(ctx, job)
	require.NoError(t, err)

	// Verify receipt was marked failed.
	receipt, err := store.GetParseScoreReceipt(ctx, f.instanceID)
	require.NoError(t, err)
	assert.Equal(t, "failed", receipt.Status)
	assert.True(t, receipt.ErrorMessage.Valid)
}

func TestWorkerComputeParseScores_WithSnapshot(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)

	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)

	f := setupScoringFixture(t, pool, store)

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	conn.Release()

	// Create a published snapshot.
	cutoff := time.Now().Add(time.Hour) // In the future so instance is before cutoff.
	snapshot, err := store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
		TenantID:       uuid.Nil,
		Cutoff:         pgtype.Timestamptz{Time: cutoff, Valid: true},
		LookbackDays:   int32(parsepolicy.DefaultLookbackDays),
		CohortMode:     string(parsepolicy.CohortModeSpec),
		PolicyVersion:  int16(parsepolicy.PolicyVersion),
		QueryVersion:   1,
		SourceRowCount: 0,
	})
	require.NoError(t, err)

	snapshot, err = store.PublishRankingSnapshot(ctx, snapshot.ID)
	require.NoError(t, err)

	// Insert ranking rows for the instance and cohort members.
	// The instance's own ranking + several other instances for cohort data.
	now := time.Now()

	// First insert the test instance's ranking.
	err = store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
		EncounterID:   uuid.NullUUID{UUID: uuid.New(), Valid: true},
		InstanceID:    f.instanceID,
		EncounterName: "Ragnaros",
		InstanceName:  "Molten Core",
		PlayerGuid:    "Player-1234-0001",
		PlayerName:    "TestPlayer",
		PlayerClass:   "WARRIOR",
		PlayerSpec:    "Fury",
		PlayerRole:    "dps",
		RealmID:       f.realmID,
		RealmName:     "test-realm",
		DamageDone:    100000,
		DurationSecs:  100,
		Dps:           1000.0,
		KilledAt:      pgtype.Timestamptz{Time: now.Add(-time.Hour), Valid: true},
	})
	require.NoError(t, err)

	// Insert 10 other instances' rankings to build a cohort.
	for i := range 10 {
		otherInstID := uuid.New()
		// Use raw pool exec for cohort instances (reuse existing log_group).
		otherConn, acqErr := pool.Acquire(ctx)
		require.NoError(t, acqErr)
		_, err = otherConn.Exec(ctx,
			`INSERT INTO log_instances (id, realm_id, log_group_id, name, capabilities, start_time)
			 SELECT $1, $2, (SELECT id FROM wow_log_groups LIMIT 1), $3, '{}', $4`,
			otherInstID, f.realmID, "Molten Core", now.Add(-3*time.Hour))
		otherConn.Release()
		if err != nil {
			continue // Skip if FK fails.
		}
		err = store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
			EncounterID:   uuid.NullUUID{UUID: uuid.New(), Valid: true},
			InstanceID:    otherInstID,
			EncounterName: "Ragnaros",
			InstanceName:  "Molten Core",
			PlayerGuid:    fmt.Sprintf("Player-1234-%04d", i+10),
			PlayerName:    fmt.Sprintf("CohortPlayer%d", i),
			PlayerClass:   "WARRIOR",
			PlayerSpec:    "Fury",
			PlayerRole:    "dps",
			RealmID:       f.realmID,
			RealmName:     "test-realm",
			DamageDone:    int64(50000 + i*10000),
			DurationSecs:  100,
			Dps:           float64(500 + i*100),
			KilledAt:      pgtype.Timestamptz{Time: now.Add(-2 * time.Hour), Valid: true},
		})
		require.NoError(t, err)
	}

	// Populate snapshot from rankings.
	err = store.BatchInsertSnapshotMembersFromRankings(ctx, snapshot.ID)
	require.NoError(t, err)

	// Create receipt.
	_, err = store.UpsertParseScoreReceipt(ctx, database.UpsertParseScoreReceiptParams{
		TenantID:   uuid.Nil,
		InstanceID: f.instanceID,
	})
	require.NoError(t, err)

	// Run the worker.
	worker := &servicerankings.WorkerComputeParseScores{
		Store:  store,
		Logger: slog.Default(),
	}

	job := &river.Job[servicerankings.ArgsComputeParseScores]{
		JobRow: nil,
		Args: servicerankings.ArgsComputeParseScores{
			InstanceID: f.instanceID,
			TenantID:   uuid.Nil,
			Attempt:    0,
		},
	}

	err = worker.Work(ctx, job)
	require.NoError(t, err)

	// Verify results were persisted.
	results, err := store.GetParseScoreResultsForInstance(ctx, f.instanceID)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(results), 1, "should have at least one score result")

	// Verify receipt was marked completed.
	receipt, err := store.GetParseScoreReceipt(ctx, f.instanceID)
	require.NoError(t, err)
	assert.Equal(t, "completed", receipt.Status)
	assert.True(t, receipt.CompletedAt.Valid)

	// Verify the score result looks reasonable.
	r := results[0]
	assert.Equal(t, "Ragnaros", r.EncounterName)
	assert.Equal(t, "Player-1234-0001", r.PlayerGuid)
	assert.Equal(t, "dps", r.Metric)
	assert.Greater(t, r.PreciseScore, 0.0)
	assert.Greater(t, r.MetricValue, 0.0)
}

type scoringFixture struct {
	realmID    uuid.UUID
	instanceID uuid.UUID
}

func setupScoringFixture(t *testing.T, pool *pgxpool.Pool, store database.Store) scoringFixture {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)

	serverID := uuid.New()
	realmID := uuid.New()
	instanceID := uuid.New()

	// Use raw SQL with tenant bypass for setup.
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_servers (id, name) VALUES ($1, $2)", serverID, "test-server")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realmID, serverID, "test-realm")
	require.NoError(t, err)
	conn.Release()

	// Create user, log group, instance.
	userID := uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "test-user-" + userID.String()[:8],
	})
	require.NoError(t, err)

	logGroupID := uuid.New()
	now := time.Now()
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(now), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	err = store.InsertParsedLogGroup(ctx, logGroupID)
	require.NoError(t, err)

	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
		Name: "Molten Core", Capabilities: []string{},
		StartTime: database.Timestamptz(now.Add(-2 * time.Hour)),
	})
	require.NoError(t, err)

	return scoringFixture{
		realmID:    realmID,
		instanceID: instanceID,
	}
}
