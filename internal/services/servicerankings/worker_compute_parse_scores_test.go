package servicerankings_test

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/parseargs"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newSingleConnectionPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	connectionURL := dbtestutil.NewConnectionURL(t)
	migrationPool, err := database.NewPostgresDB(t.Context(), slog.Default(), connectionURL)
	require.NoError(t, err)
	migrationPool.Close()

	u, err := url.Parse(connectionURL)
	require.NoError(t, err)
	query := u.Query()
	query.Set("pool_max_conns", "1")
	u.RawQuery = query.Encode()
	pool, err := pgxpool.New(t.Context(), u.String())
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

func TestWorkerComputeParseScores_NoSnapshot(t *testing.T) {
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

	// No snapshot exists. Worker should handle gracefully.
	worker := &servicerankings.WorkerComputeParseScores{
		Store:  store,
		Logger: slog.Default(),
		// Queue is nil — retry enqueue will log and return nil.
	}

	job := &river.Job[parseargs.ArgsComputeParseScores]{
		JobRow: nil,
		Args: parseargs.ArgsComputeParseScores{
			InstanceID: f.instanceID,
			TenantID:   uuid.Nil,
			Attempt:    3, // Exhausted: should return nil without creating receipt.
		},
	}

	err = worker.Work(ctx, job)
	require.NoError(t, err)

	// Snapshot publication is no longer required. Even an empty source writes a
	// successful windowed receipt.
	receipts, err := store.GetParseScoreReceiptForInstance(ctx, f.instanceID)
	require.NoError(t, err)
	require.Len(t, receipts, 1)
	assert.False(t, receipts[0].SnapshotID.Valid)
}

func TestWorkerComputeParseScores_AttemptThreeRecordsMissingSnapshotReason(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)

	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	f := setupScoringFixture(t, pool, store)
	q := setupParseScoreQueueForTest(t, pool)

	worker := &servicerankings.WorkerComputeParseScores{
		Store:  store,
		Queue:  q,
		Logger: slog.Default(),
	}

	err := worker.Work(ctx, &river.Job[parseargs.ArgsComputeParseScores]{
		Args: parseargs.ArgsComputeParseScores{
			InstanceID: f.instanceID,
			TenantID:   uuid.Nil,
			Attempt:    2,
		},
	})
	require.NoError(t, err)

	var count int
	err = pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM river_job
		WHERE kind = $1 AND args->>'instance_id' = $2`,
		parseargs.KindComputeParseScores, f.instanceID.String()).Scan(&count)
	require.NoError(t, err)
	assert.Zero(t, count, "windowed scoring does not schedule snapshot retries")
	receipts, err := store.GetParseScoreReceiptForInstance(ctx, f.instanceID)
	require.NoError(t, err)
	require.Len(t, receipts, 1)
	assert.False(t, receipts[0].SnapshotID.Valid)
}

func TestWorkerComputeParseScores_OldInstanceDoesNotRetryMissingSnapshot(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)

	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	f := setupScoringFixture(t, pool, store)
	q := setupParseScoreQueueForTest(t, pool)

	_, err := pool.Exec(ctx, `UPDATE log_instances SET start_time = $1 WHERE id = $2`,
		time.Now().Add(-10*24*time.Hour-time.Hour), f.instanceID)
	require.NoError(t, err)

	worker := &servicerankings.WorkerComputeParseScores{
		Store:  store,
		Queue:  q,
		Logger: slog.Default(),
	}
	err = worker.Work(ctx, &river.Job[parseargs.ArgsComputeParseScores]{
		Args: parseargs.ArgsComputeParseScores{
			InstanceID: f.instanceID,
			TenantID:   uuid.Nil,
		},
	})
	require.NoError(t, err)

	var count int
	err = pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM river_job
		WHERE kind = $1 AND args->>'instance_id' = $2`,
		parseargs.KindComputeParseScores, f.instanceID.String()).Scan(&count)
	require.NoError(t, err)
	assert.Zero(t, count, "old instances cannot gain an eligible historical snapshot without a backfill")
}

func TestWorkerComputeParseScores_WithSnapshot(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)

	// Keep this pool at one connection to catch queries that bypass the tx handle
	// while a transaction is already holding the only connection.
	pool := newSingleConnectionPool(t)
	store := database.New(pool)

	f := setupScoringFixture(t, pool, store)

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	conn.Release()

	now := time.Now()

	// Insert the test instance's ranking (DPS=1000, HPS=200).
	insertRanking(t, ctx, store, f.instanceID, f.realmID, "Player-1234-0001", "TestPlayer",
		1000.0, 200.0, now.Add(-time.Hour))

	// Insert 10 other instances' rankings for cohort data.
	for i := range 10 {
		otherInstID := uuid.New()
		otherConn, acqErr := pool.Acquire(ctx)
		require.NoError(t, acqErr)
		_, err = otherConn.Exec(ctx,
			`INSERT INTO log_instances (id, realm_id, log_group_id, name, capabilities, start_time)
			 SELECT $1, $2, (SELECT id FROM wow_log_groups LIMIT 1), $3, '{}', $4`,
			otherInstID, f.realmID, "Molten Core", now.Add(-5*time.Hour))
		otherConn.Release()
		require.NoError(t, err)
		insertRanking(t, ctx, store, otherInstID, f.realmID,
			fmt.Sprintf("Player-1234-%04d", i+10),
			fmt.Sprintf("CohortPlayer%d", i),
			float64(500+i*100), float64(50+i*20), now.Add(-4*time.Hour))
	}

	// Populate snapshot from rankings.
	refreshScoringMemberships(t, ctx, store, f.logGroupID)

	// Run the worker.
	worker := &servicerankings.WorkerComputeParseScores{
		Store:  store,
		Logger: slog.Default(),
	}

	job := &river.Job[parseargs.ArgsComputeParseScores]{
		JobRow: nil,
		Args: parseargs.ArgsComputeParseScores{
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

	// Should have BOTH DPS and HPS results.
	var hasDPS, hasHPS bool
	for _, r := range results {
		if r.Metric == "dps" {
			hasDPS = true
			assert.Equal(t, "Ragnaros", r.EncounterName)
			assert.Equal(t, "Player-1234-0001", r.PlayerGuid)
			assert.Greater(t, r.MetricValue, 0.0)
		}
		if r.Metric == "hps" {
			hasHPS = true
			assert.Greater(t, r.MetricValue, 0.0)
		}
	}
	assert.True(t, hasDPS, "should have DPS results")
	assert.True(t, hasHPS, "should have HPS results")

	// Verify receipt was created (success = receipt exists).
	receipt, err := store.GetAnyParseScoreReceiptForTenantInstance(ctx, database.GetAnyParseScoreReceiptForTenantInstanceParams{TenantID: uuid.Nil, InstanceID: f.instanceID})
	require.NoError(t, err)
	assert.Equal(t, int16(parsepolicy.PolicyVersion), receipt.PolicyVersion)
	assert.Equal(t, int16(servicerankings.QueryVersion), receipt.QueryVersion)
	assert.Greater(t, receipt.ResultCount, int32(0))
}

func TestWorkerComputeParseScores_Atomicity(t *testing.T) {
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

	now := time.Now()

	insertRanking(t, ctx, store, f.instanceID, f.realmID, "Player-1234-0001", "TestPlayer",
		1000.0, 0, now.Add(-time.Hour))

	// Insert cohort.
	for i := range 10 {
		otherInstID := uuid.New()
		otherConn, acqErr := pool.Acquire(ctx)
		require.NoError(t, acqErr)
		_, err = otherConn.Exec(ctx,
			`INSERT INTO log_instances (id, realm_id, log_group_id, name, capabilities, start_time)
			 SELECT $1, $2, (SELECT id FROM wow_log_groups LIMIT 1), $3, '{}', $4`,
			otherInstID, f.realmID, "Molten Core", now.Add(-5*time.Hour))
		otherConn.Release()
		require.NoError(t, err)
		insertRanking(t, ctx, store, otherInstID, f.realmID,
			fmt.Sprintf("Player-1234-%04d", i+10),
			fmt.Sprintf("CohortPlayer%d", i),
			float64(500+i*100), 0, now.Add(-4*time.Hour))
	}
	refreshScoringMemberships(t, ctx, store, f.logGroupID)

	// Run worker successfully.
	worker := &servicerankings.WorkerComputeParseScores{
		Store:  store,
		Logger: slog.Default(),
	}
	job := &river.Job[parseargs.ArgsComputeParseScores]{
		JobRow: nil,
		Args: parseargs.ArgsComputeParseScores{
			InstanceID: f.instanceID,
			TenantID:   uuid.Nil,
		},
	}
	err = worker.Work(ctx, job)
	require.NoError(t, err)

	// Both results AND receipt should exist (atomic).
	results, err := store.GetParseScoreResultsForInstance(ctx, f.instanceID)
	require.NoError(t, err)
	assert.NotEmpty(t, results)

	receipt, err := store.GetAnyParseScoreReceiptForTenantInstance(ctx, database.GetAnyParseScoreReceiptForTenantInstanceParams{TenantID: uuid.Nil, InstanceID: f.instanceID})
	require.NoError(t, err)
	assert.Equal(t, int32(len(results)), receipt.ResultCount)
}

func TestWorkerComputeParseScores_ExistingResultsSkipRecompute(t *testing.T) {
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

	now := time.Now()
	insertRanking(t, ctx, store, f.instanceID, f.realmID, "Player-1234-0001", "TestPlayer",
		1000.0, 0, now.Add(-time.Hour))

	for i := range 10 {
		otherInstID := uuid.New()
		_, err = pool.Exec(ctx,
			`INSERT INTO log_instances (id, realm_id, log_group_id, name, capabilities, start_time)
			 SELECT $1, $2, (SELECT id FROM wow_log_groups LIMIT 1), $3, '{}', $4`,
			otherInstID, f.realmID, "Molten Core", now.Add(-5*time.Hour))
		require.NoError(t, err)
		insertRanking(t, ctx, store, otherInstID, f.realmID,
			fmt.Sprintf("Player-1234-%04d", i+10),
			fmt.Sprintf("CohortPlayer%d", i),
			float64(500+i*100), 0, now.Add(-4*time.Hour))
	}
	refreshScoringMemberships(t, ctx, store, f.logGroupID)

	job := &river.Job[parseargs.ArgsComputeParseScores]{
		Args: parseargs.ArgsComputeParseScores{
			InstanceID: f.instanceID,
			TenantID:   uuid.Nil,
		},
	}
	worker := &servicerankings.WorkerComputeParseScores{Store: store, Logger: slog.Default()}
	require.NoError(t, worker.Work(ctx, job))

	before, err := store.GetParseScoreResultsForInstance(ctx, f.instanceID)
	require.NoError(t, err)
	require.NotEmpty(t, before)

	// Simulate a missing receipt while retaining the last complete projection.
	_, err = pool.Exec(ctx, `DELETE FROM parse_score_receipts WHERE instance_id = $1`, f.instanceID)
	require.NoError(t, err)
	_, err = store.GetAnyParseScoreReceiptForTenantInstance(ctx, database.GetAnyParseScoreReceiptForTenantInstanceParams{TenantID: uuid.Nil, InstanceID: f.instanceID})
	require.ErrorIs(t, err, pgx.ErrNoRows)

	// A missing receipt does not make an existing projection safe to rewrite.
	err = worker.Work(ctx, job)
	require.NoError(t, err)

	after, err := store.GetParseScoreResultsForInstance(ctx, f.instanceID)
	require.NoError(t, err)
	assert.Equal(t, before, after, "existing results must prevent recomputation")

	_, err = store.GetAnyParseScoreReceiptForTenantInstance(ctx, database.GetAnyParseScoreReceiptForTenantInstanceParams{TenantID: uuid.Nil, InstanceID: f.instanceID})
	require.ErrorIs(t, err, pgx.ErrNoRows, "preservation guard must not create a replacement receipt")
}

func TestWorkerComputeParseScores_Idempotency(t *testing.T) {
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

	now := time.Now()

	insertRanking(t, ctx, store, f.instanceID, f.realmID, "Player-1234-0001", "TestPlayer",
		1000.0, 0, now.Add(-time.Hour))

	for i := range 10 {
		otherInstID := uuid.New()
		otherConn, acqErr := pool.Acquire(ctx)
		require.NoError(t, acqErr)
		_, err = otherConn.Exec(ctx,
			`INSERT INTO log_instances (id, realm_id, log_group_id, name, capabilities, start_time)
			 SELECT $1, $2, (SELECT id FROM wow_log_groups LIMIT 1), $3, '{}', $4`,
			otherInstID, f.realmID, "Molten Core", now.Add(-5*time.Hour))
		otherConn.Release()
		require.NoError(t, err)
		insertRanking(t, ctx, store, otherInstID, f.realmID,
			fmt.Sprintf("Player-1234-%04d", i+10),
			fmt.Sprintf("CohortPlayer%d", i),
			float64(500+i*100), 0, now.Add(-4*time.Hour))
	}
	refreshScoringMemberships(t, ctx, store, f.logGroupID)

	worker := &servicerankings.WorkerComputeParseScores{
		Store:  store,
		Logger: slog.Default(),
	}
	job := &river.Job[parseargs.ArgsComputeParseScores]{
		JobRow: nil,
		Args: parseargs.ArgsComputeParseScores{
			InstanceID: f.instanceID,
			TenantID:   uuid.Nil,
		},
	}

	// Run twice — should be idempotent.
	err = worker.Work(ctx, job)
	require.NoError(t, err)
	err = worker.Work(ctx, job)
	require.NoError(t, err)

	// Results should be deduplicated at read time.
	results, err := store.GetParseScoreResultsForInstance(ctx, f.instanceID)
	require.NoError(t, err)
	assert.NotEmpty(t, results)

	// Receipt should still exist (ON CONFLICT UPDATE).
	receipt, err := store.GetAnyParseScoreReceiptForTenantInstance(ctx, database.GetAnyParseScoreReceiptForTenantInstanceParams{TenantID: uuid.Nil, InstanceID: f.instanceID})
	require.NoError(t, err)
	assert.False(t, receipt.SnapshotID.Valid)
	assert.NotZero(t, receipt.ComputedAt)
}

func TestComputeCharacterScore(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		parses      []chroniclesdk.CharacterParse
		wantNil     bool
		wantValue   float64
		wantDisplay int
		wantGroups  int
		wantParses  int
	}{
		{
			name:    "nil_parses",
			parses:  nil,
			wantNil: true,
		},
		{
			name: "single_group_single_parse",
			parses: []chroniclesdk.CharacterParse{
				{InstanceName: "MC", EncounterName: "Ragnaros", PreciseScore: 80},
			},
			wantValue:   80,
			wantDisplay: 80,
			wantGroups:  1,
			wantParses:  1,
		},
		{
			name: "single_group_three_parses",
			parses: []chroniclesdk.CharacterParse{
				{InstanceName: "MC", EncounterName: "Ragnaros", PreciseScore: 80},
				{InstanceName: "MC", EncounterName: "Ragnaros", PreciseScore: 90},
				{InstanceName: "MC", EncounterName: "Ragnaros", PreciseScore: 70},
			},
			wantValue:   80, // avg(70,80,90) = 80
			wantDisplay: 80,
			wantGroups:  1,
			wantParses:  3,
		},
		{
			name: "single_group_five_parses_best3",
			parses: []chroniclesdk.CharacterParse{
				{InstanceName: "MC", EncounterName: "Ragnaros", PreciseScore: 50},
				{InstanceName: "MC", EncounterName: "Ragnaros", PreciseScore: 60},
				{InstanceName: "MC", EncounterName: "Ragnaros", PreciseScore: 70},
				{InstanceName: "MC", EncounterName: "Ragnaros", PreciseScore: 80},
				{InstanceName: "MC", EncounterName: "Ragnaros", PreciseScore: 90},
			},
			wantValue:   80, // best 3: avg(70,80,90) = 80
			wantDisplay: 80,
			wantGroups:  1,
			wantParses:  5,
		},
		{
			name: "two_groups",
			parses: []chroniclesdk.CharacterParse{
				{InstanceName: "MC", EncounterName: "Ragnaros", PreciseScore: 80},
				{InstanceName: "MC", EncounterName: "Ragnaros", PreciseScore: 90},
				{InstanceName: "MC", EncounterName: "Ragnaros", PreciseScore: 70},
				{InstanceName: "MC", EncounterName: "Golemagg", PreciseScore: 60},
				{InstanceName: "MC", EncounterName: "Golemagg", PreciseScore: 50},
			},
			// Group 1 (Ragnaros): best 3 = avg(70,80,90) = 80
			// Group 2 (Golemagg): best 3 (only 2) = avg(50,60) = 55
			// Average groups: (80+55)/2 = 67.5
			wantValue:   67.5,
			wantDisplay: 68,
			wantGroups:  2,
			wantParses:  5,
		},
		{
			name: "different_instances_same_encounter",
			parses: []chroniclesdk.CharacterParse{
				{InstanceName: "MC", EncounterName: "Ragnaros", PreciseScore: 80},
				{InstanceName: "BWL", EncounterName: "Ragnaros", PreciseScore: 90},
			},
			// Different (instance_name, encounter_name) = different groups.
			// Group 1 (MC, Ragnaros): avg(80) = 80
			// Group 2 (BWL, Ragnaros): avg(90) = 90
			// Average: (80+90)/2 = 85
			wantValue:   85,
			wantDisplay: 85,
			wantGroups:  2,
			wantParses:  2,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			score := servicerankings.ComputeCharacterScore(tc.parses)
			if tc.wantNil {
				assert.Nil(t, score)
				return
			}
			require.NotNil(t, score)
			assert.InDelta(t, tc.wantValue, score.Value, 1e-9)
			assert.Equal(t, tc.wantDisplay, score.DisplayValue)
			assert.Equal(t, tc.wantGroups, score.EncounterGroups)
			assert.Equal(t, tc.wantParses, score.NumParses)
		})
	}
}

func TestListInstancesMissingParseReceipt(t *testing.T) {
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

	snapshot := createPublishedSnapshot(t, ctx, store)
	now := time.Now()

	// Insert a ranking row for the instance.
	insertRanking(t, ctx, store, f.instanceID, f.realmID, "Player-1234-0001", "TestPlayer",
		1000.0, 0, now.Add(-time.Hour))

	// Instance should appear as missing receipt.
	missing, err := store.ListInstancesMissingParseReceipt(ctx, database.ListInstancesMissingParseReceiptParams{
		SnapshotID:    snapshot.ID,
		PolicyVersion: int16(parsepolicy.PolicyVersion),
		QueryVersion:  int16(servicerankings.QueryVersion),
		MaxRows:       100,
	})
	require.NoError(t, err)
	assert.Len(t, missing, 1)
	assert.Equal(t, f.instanceID, missing[0].InstanceID)

	// Create receipt for that snapshot.
	_, err = store.InsertParseScoreReceipt(ctx, database.InsertParseScoreReceiptParams{
		TenantID:      uuid.Nil,
		InstanceID:    f.instanceID,
		SnapshotID:    snapshot.ID,
		PolicyVersion: int16(parsepolicy.PolicyVersion),
		QueryVersion:  int16(servicerankings.QueryVersion),
		LookbackDays:  int16(parsepolicy.DefaultLookbackDays),
		SourceCount:   1,
		ResultCount:   1,
	})
	require.NoError(t, err)

	// Should no longer be missing.
	missing, err = store.ListInstancesMissingParseReceipt(ctx, database.ListInstancesMissingParseReceiptParams{
		SnapshotID:    snapshot.ID,
		PolicyVersion: int16(parsepolicy.PolicyVersion),
		QueryVersion:  int16(servicerankings.QueryVersion),
		MaxRows:       100,
	})
	require.NoError(t, err)
	assert.Empty(t, missing)
}

func TestListInstancesMissingParseReceiptWithSnapshot_PerInstanceResolution(t *testing.T) {
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

	snapshot := createPublishedSnapshot(t, ctx, store)
	now := time.Now()

	// Insert a ranking row for the instance.
	insertRanking(t, ctx, store, f.instanceID, f.realmID, "Player-1234-0001", "TestPlayer",
		1000.0, 0, now.Add(-time.Hour))

	// LATERAL join should resolve snapshot per instance.
	missing, err := store.ListInstancesMissingParseReceiptWithSnapshot(ctx, database.ListInstancesMissingParseReceiptWithSnapshotParams{
		TenantID:      uuid.Nil,
		LookbackDays:  int32(parsepolicy.DefaultLookbackDays),
		PolicyVersion: int16(parsepolicy.PolicyVersion),
		QueryVersion:  int16(servicerankings.QueryVersion),
		RepairSince:   database.Timestamptz(now.AddDate(0, 0, -servicerankings.RepairLookbackDays)),
		MaxRows:       100,
	})
	require.NoError(t, err)
	assert.Len(t, missing, 1)
	assert.Equal(t, f.instanceID, missing[0].InstanceID)
	assert.Equal(t, snapshot.ID, missing[0].SnapshotID)
}

func TestListInstancesMissingParseReceiptWithSnapshot_NoEligibleSnapshot(t *testing.T) {
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

	now := time.Now()
	insertRanking(t, ctx, store, f.instanceID, f.realmID, "Player-1234-0001", "TestPlayer",
		1000.0, 0, now.Add(-time.Hour))

	// No snapshot exists at all — LATERAL join excludes the instance.
	missing, err := store.ListInstancesMissingParseReceiptWithSnapshot(ctx, database.ListInstancesMissingParseReceiptWithSnapshotParams{
		TenantID:      uuid.Nil,
		LookbackDays:  int32(parsepolicy.DefaultLookbackDays),
		PolicyVersion: int16(parsepolicy.PolicyVersion),
		QueryVersion:  int16(servicerankings.QueryVersion),
		RepairSince:   database.Timestamptz(now.AddDate(0, 0, -servicerankings.RepairLookbackDays)),
		MaxRows:       100,
	})
	require.NoError(t, err)
	assert.Empty(t, missing, "no snapshot → instance must not be returned")
}

func TestListInstancesMissingParseReceiptWithSnapshot_IgnoresOldInstances(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)

	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	f := setupScoringFixture(t, pool, store)

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)

	now := time.Now()
	oldStart := now.AddDate(0, 0, -(servicerankings.RepairLookbackDays + 1))
	_, err = conn.Exec(ctx, "UPDATE log_instances SET start_time = $2 WHERE id = $1", f.instanceID, oldStart)
	require.NoError(t, err)
	conn.Release()

	snapshot, err := store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
		TenantID:      uuid.Nil,
		Cutoff:        database.Timestamptz(oldStart.Add(-time.Hour)),
		LookbackDays:  int32(parsepolicy.DefaultLookbackDays),
		CohortMode:    string(parsepolicy.CohortModeSpec),
		PolicyVersion: int16(parsepolicy.PolicyVersion),
		QueryVersion:  int16(servicerankings.QueryVersion),
	})
	require.NoError(t, err)
	_, err = store.PublishRankingSnapshot(ctx, snapshot.ID)
	require.NoError(t, err)

	insertRanking(t, ctx, store, f.instanceID, f.realmID, "Player-1234-0001", "TestPlayer",
		1000.0, 0, oldStart.Add(time.Hour))

	missing, err := store.ListInstancesMissingParseReceiptWithSnapshot(ctx, database.ListInstancesMissingParseReceiptWithSnapshotParams{
		TenantID:      uuid.Nil,
		LookbackDays:  int32(parsepolicy.DefaultLookbackDays),
		PolicyVersion: int16(parsepolicy.PolicyVersion),
		QueryVersion:  int16(servicerankings.QueryVersion),
		RepairSince:   database.Timestamptz(now.AddDate(0, 0, -servicerankings.RepairLookbackDays)),
		MaxRows:       100,
	})
	require.NoError(t, err)
	assert.Empty(t, missing, "instances older than the 30-day repair window must be ignored")
}

func TestWorkerComputeParseScores_IncompatibleSnapshotFallback(t *testing.T) {
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

	now := time.Now()

	// Create a compatible snapshot (current versions).

	// Create an incompatible newer snapshot (higher query version) by
	// directly inserting via SQL to bypass normal helpers.
	incompatID := uuid.New()
	incompatConn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = incompatConn.Exec(ctx,
		`INSERT INTO ranking_snapshots (id, tenant_id, cutoff, lookback_days, cohort_mode,
			policy_version, query_version, status, published_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, 'published', now())`,
		incompatID, uuid.Nil,
		now.Add(-100*time.Minute),
		parsepolicy.DefaultLookbackDays,
		string(parsepolicy.CohortModeSpec),
		parsepolicy.PolicyVersion,
		servicerankings.QueryVersion+99, // incompatible query version
	)
	incompatConn.Release()
	require.NoError(t, err)

	insertRanking(t, ctx, store, f.instanceID, f.realmID, "Player-1234-0001", "TestPlayer",
		1000.0, 0, now.Add(-time.Hour))

	// Insert cohort.
	for i := range 10 {
		otherInstID := uuid.New()
		otherConn, acqErr := pool.Acquire(ctx)
		require.NoError(t, acqErr)
		_, err = otherConn.Exec(ctx,
			`INSERT INTO log_instances (id, realm_id, log_group_id, name, capabilities, start_time)
			 SELECT $1, $2, (SELECT id FROM wow_log_groups LIMIT 1), $3, '{}', $4`,
			otherInstID, f.realmID, "Molten Core", now.Add(-5*time.Hour))
		otherConn.Release()
		require.NoError(t, err)
		insertRanking(t, ctx, store, otherInstID, f.realmID,
			fmt.Sprintf("Player-1234-%04d", i+10),
			fmt.Sprintf("CohortPlayer%d", i),
			float64(500+i*100), 0, now.Add(-4*time.Hour))
	}
	refreshScoringMemberships(t, ctx, store, f.logGroupID)

	// Worker should skip the incompatible snapshot and use the compatible one.
	worker := &servicerankings.WorkerComputeParseScores{
		Store:  store,
		Logger: slog.Default(),
	}
	job := &river.Job[parseargs.ArgsComputeParseScores]{
		JobRow: nil,
		Args: parseargs.ArgsComputeParseScores{
			InstanceID: f.instanceID,
			TenantID:   uuid.Nil,
		},
	}
	err = worker.Work(ctx, job)
	require.NoError(t, err)

	// Receipt should be for the compatible snapshot.
	receipt, err := store.GetAnyParseScoreReceiptForTenantInstance(ctx, database.GetAnyParseScoreReceiptForTenantInstanceParams{TenantID: uuid.Nil, InstanceID: f.instanceID})
	require.NoError(t, err)
	assert.False(t, receipt.SnapshotID.Valid, "snapshot versions do not affect windowed scoring")
}

func TestWorkerComputeParseScores_TenantIsolation(t *testing.T) {
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

	snapshot := createPublishedSnapshot(t, ctx, store)
	now := time.Now()

	insertRanking(t, ctx, store, f.instanceID, f.realmID, "Player-1234-0001", "TestPlayer",
		1000.0, 0, now.Add(-time.Hour))

	// Insert cohort.
	for i := range 10 {
		otherInstID := uuid.New()
		otherConn, acqErr := pool.Acquire(ctx)
		require.NoError(t, acqErr)
		_, err = otherConn.Exec(ctx,
			`INSERT INTO log_instances (id, realm_id, log_group_id, name, capabilities, start_time)
			 SELECT $1, $2, (SELECT id FROM wow_log_groups LIMIT 1), $3, '{}', $4`,
			otherInstID, f.realmID, "Molten Core", now.Add(-5*time.Hour))
		otherConn.Release()
		require.NoError(t, err)
		insertRanking(t, ctx, store, otherInstID, f.realmID,
			fmt.Sprintf("Player-1234-%04d", i+10),
			fmt.Sprintf("CohortPlayer%d", i),
			float64(500+i*100), 0, now.Add(-4*time.Hour))
	}
	refreshScoringMemberships(t, ctx, store, f.logGroupID)

	// Insert a result for a DIFFERENT tenant on the same instance.
	otherTenantID := uuid.New()
	err = store.InsertParseScoreResult(ctx, database.InsertParseScoreResultParams{
		TenantID:      otherTenantID,
		InstanceID:    f.instanceID,
		RunID:         f.instanceID,
		SnapshotID:    uuid.NullUUID{UUID: snapshot.ID, Valid: true},
		EncounterName: "Ragnaros",
		PlayerGuid:    "Player-1234-9999",
		Metric:        "dps",
		MetricValue:   999,
		PreciseScore:  50,
		DisplayScore:  50,
		Rank:          5,
		SampleSize:    10,
		Status:        "ok",
		InstanceName:  "Molten Core",
	})
	require.NoError(t, err)

	// Run worker for tenant uuid.Nil — should NOT delete other tenant's results.
	worker := &servicerankings.WorkerComputeParseScores{
		Store:  store,
		Logger: slog.Default(),
	}
	job := &river.Job[parseargs.ArgsComputeParseScores]{
		JobRow: nil,
		Args: parseargs.ArgsComputeParseScores{
			InstanceID: f.instanceID,
			TenantID:   uuid.Nil,
		},
	}
	err = worker.Work(ctx, job)
	require.NoError(t, err)

	// All results for the instance — should include both tenants.
	results, err := store.GetParseScoreResultsForInstance(ctx, f.instanceID)
	require.NoError(t, err)

	var hasOtherTenant bool
	for _, r := range results {
		if r.TenantID == otherTenantID {
			hasOtherTenant = true
		}
	}
	assert.True(t, hasOtherTenant, "other tenant's results must not be deleted by tenant uuid.Nil recompute")
}

func TestSnapshotDeletionPreservesResultsAndDeletesReceipt(t *testing.T) {
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

	snapshot := createPublishedSnapshot(t, ctx, store)

	// Insert a result and receipt.
	err = store.InsertParseScoreResult(ctx, database.InsertParseScoreResultParams{
		TenantID:      uuid.Nil,
		InstanceID:    f.instanceID,
		RunID:         f.instanceID,
		SnapshotID:    uuid.NullUUID{UUID: snapshot.ID, Valid: true},
		EncounterName: "Ragnaros",
		PlayerGuid:    "Player-1234-0001",
		Metric:        "dps",
		MetricValue:   1000,
		PreciseScore:  80,
		DisplayScore:  80,
		Rank:          1,
		SampleSize:    10,
		Status:        "ok",
		InstanceName:  "Molten Core",
	})
	require.NoError(t, err)

	_, err = store.InsertParseScoreReceipt(ctx, database.InsertParseScoreReceiptParams{
		TenantID:      uuid.Nil,
		InstanceID:    f.instanceID,
		SnapshotID:    snapshot.ID,
		PolicyVersion: int16(parsepolicy.PolicyVersion),
		QueryVersion:  int16(servicerankings.QueryVersion),
		LookbackDays:  int16(parsepolicy.DefaultLookbackDays),
		SourceCount:   1,
		ResultCount:   1,
	})
	require.NoError(t, err)

	// Delete the snapshot. Results retain their historical score with a NULL
	// snapshot reference, while the receipt is removed to make recent data repairable.
	conn2, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn2.Exec(ctx, "DELETE FROM ranking_snapshots WHERE id = $1", snapshot.ID)
	conn2.Release()
	require.NoError(t, err)

	// Results should remain, but no longer reference the deleted snapshot.
	results, err := store.GetParseScoreResultsForInstance(ctx, f.instanceID)
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.False(t, results[0].SnapshotID.Valid)

	// Receipts are gone, but orphaned legacy results make the instance ineligible
	// for repair and prevent the worker from rewriting historical scores.
	receipts, err := store.GetParseScoreReceiptForInstance(ctx, f.instanceID)
	require.NoError(t, err)
	assert.Empty(t, receipts)

	missing, err := store.ListInstancesMissingParseReceiptWindowed(ctx, database.ListInstancesMissingParseReceiptWindowedParams{
		TenantID: uuid.Nil, RepairSince: database.Timestamptz(time.Now().AddDate(0, 0, -servicerankings.RepairLookbackDays)), MaxRows: 100,
	})
	require.NoError(t, err)
	assert.Empty(t, missing)

	worker := &servicerankings.WorkerComputeParseScores{Store: store, Logger: slog.Default()}
	require.NoError(t, worker.Work(ctx, &river.Job[parseargs.ArgsComputeParseScores]{Args: parseargs.ArgsComputeParseScores{
		InstanceID: f.instanceID, TenantID: uuid.Nil,
	}}))

	results, err = store.GetParseScoreResultsForInstance(ctx, f.instanceID)
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, 80.0, results[0].PreciseScore)
	assert.False(t, results[0].SnapshotID.Valid)
	receipts, err = store.GetParseScoreReceiptForInstance(ctx, f.instanceID)
	require.NoError(t, err)
	assert.Empty(t, receipts)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func TestWorkerComputeParseScores_PreservesLegacyReceipt(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	fixture := setupScoringFixture(t, pool, store)

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	conn.Release()

	snapshot := createPublishedSnapshot(t, ctx, store)
	legacy, err := store.InsertParseScoreReceipt(ctx, database.InsertParseScoreReceiptParams{
		TenantID: uuid.Nil, InstanceID: fixture.instanceID, SnapshotID: snapshot.ID,
		PolicyVersion: parsepolicy.PolicyVersion, QueryVersion: int16(servicerankings.QueryVersion - 1),
		LookbackDays: int16(parsepolicy.DefaultLookbackDays), SourceCount: 1, ResultCount: 1,
	})
	require.NoError(t, err)

	worker := &servicerankings.WorkerComputeParseScores{Store: store, Logger: slog.Default()}
	require.NoError(t, worker.Work(ctx, &river.Job[parseargs.ArgsComputeParseScores]{Args: parseargs.ArgsComputeParseScores{
		InstanceID: fixture.instanceID, TenantID: uuid.Nil,
	}}))

	receipts, err := store.GetParseScoreReceiptForInstance(ctx, fixture.instanceID)
	require.NoError(t, err)
	require.Len(t, receipts, 1)
	assert.Equal(t, legacy.ID, receipts[0].ID, "cutover must not replace a legacy successful receipt")
}

func TestWorkerComputeParseScores_WindowedMemberships(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	fixture := setupScoringFixture(t, pool, store)

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	conn.Release()

	target, err := store.GetLogInstanceForScoring(ctx, fixture.instanceID)
	require.NoError(t, err)
	cutoff := target.StartTime.Time
	windowStart := cutoff.AddDate(0, 0, -int(parsepolicy.DefaultLookbackDays))

	insertRanking(t, ctx, store, fixture.instanceID, fixture.realmID, "Player-target", "Target", 1500, 0, cutoff)
	for i, killedAt := range []time.Time{
		windowStart,
		windowStart.Add(time.Hour),
		cutoff.Add(-3 * time.Hour),
		cutoff.Add(-2 * time.Hour),
		cutoff.Add(-time.Hour),
		cutoff, // exclusive upper boundary
	} {
		instanceID := uuid.New()
		_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: instanceID, RealmID: fixture.realmID, LogGroupID: fixture.logGroupID,
			Name: "Molten Core", Capabilities: []string{}, StartTime: database.Timestamptz(killedAt.Add(-time.Hour)),
		})
		require.NoError(t, err)
		insertRanking(t, ctx, store, instanceID, fixture.realmID, fmt.Sprintf("Player-%d", i), fmt.Sprintf("Player %d", i), float64(1000+i*100), 0, killedAt)
	}

	_, err = pool.Exec(ctx, `UPDATE encounter_dps_rankings SET instance_name = 'MC Alias' WHERE id = (SELECT id FROM encounter_dps_rankings WHERE instance_id <> $1 ORDER BY id LIMIT 1)`, fixture.instanceID)
	require.NoError(t, err)

	refresh := database.RefreshParseScoreMembershipsForLogGroupParams{
		LogGroupID: fixture.logGroupID, PolicyVersion: parsepolicy.PolicyVersion, QueryVersion: parsepolicy.QueryVersion,
	}
	first, err := store.RefreshParseScoreMembershipsForLogGroup(ctx, refresh)
	require.NoError(t, err)
	second, err := store.RefreshParseScoreMembershipsForLogGroup(ctx, refresh)
	require.NoError(t, err)
	assert.Equal(t, first.UpsertedCount, second.UpsertedCount)
	members, err := store.ListParseScoreMemberships(ctx, database.ListParseScoreMembershipsParams{
		TenantID: uuid.Nil, PolicyVersion: parsepolicy.PolicyVersion, QueryVersion: parsepolicy.QueryVersion,
	})
	require.NoError(t, err)
	assert.Len(t, members, 7, "refresh remains idempotent")

	worker := &servicerankings.WorkerComputeParseScores{Store: store, Logger: slog.Default()}
	require.NoError(t, worker.Work(ctx, &river.Job[parseargs.ArgsComputeParseScores]{Args: parseargs.ArgsComputeParseScores{
		InstanceID: fixture.instanceID, TenantID: uuid.Nil,
	}}))

	receipt, err := store.GetAnyParseScoreReceiptForTenantInstance(ctx, database.GetAnyParseScoreReceiptForTenantInstanceParams{
		TenantID: uuid.Nil, InstanceID: fixture.instanceID,
	})
	require.NoError(t, err)
	assert.False(t, receipt.SnapshotID.Valid, "new scores do not require ranking snapshots")
	assert.Equal(t, cutoff.UTC(), receipt.Cutoff.Time.UTC())
	results, err := store.ListWindowedParseScoreResultsForContract(ctx, database.ListWindowedParseScoreResultsForContractParams{
		TenantID: uuid.Nil, InstanceID: fixture.instanceID, Metric: "dps",
	})
	require.NoError(t, err)
	require.Len(t, results, 1)
	assert.Equal(t, int32(5), results[0].SampleSize, "instance-name aliases share the same encounter/difficulty/size/class/spec cohort")
}

func TestGetParseScoreMembershipCohort_TenantVisibility(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitMedium)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	fixture := setupScoringFixture(t, pool, store)

	included, err := store.InsertTenant(ctx, database.InsertTenantParams{
		ID: uuid.New(), Name: "included", IncludeInAll: true, AvailableFormats: []string{},
	})
	require.NoError(t, err)
	excluded, err := store.InsertTenant(ctx, database.InsertTenantParams{
		ID: uuid.New(), Name: "excluded", IncludeInAll: false, AvailableFormats: []string{},
	})
	require.NoError(t, err)

	for i, row := range []struct {
		tenantID uuid.UUID
		dps      float64
	}{
		{tenantID: uuid.Nil, dps: 100},
		{tenantID: included.ID, dps: 200},
		{tenantID: excluded.ID, dps: 300},
	} {
		_, err = pool.Exec(ctx, `
			INSERT INTO parse_score_memberships (
				tenant_id, policy_version, query_version, run_id, encounter_name, player_guid,
				instance_id, log_group_id, difficulty_name, max_players,
				player_class, player_spec, player_sub_spec, killed_at, dps, hps
			) VALUES ($1, $2, $3, $4, 'Ragnaros', $5, $6, $7, 'Normal', 40,
				'Warrior', 'Fury', '', $8, $9, 0)`,
			row.tenantID, parsepolicy.PolicyVersion, parsepolicy.QueryVersion, uuid.New(),
			fmt.Sprintf("Player-%d", i), fixture.instanceID, fixture.logGroupID, time.Now().Add(-time.Hour), row.dps)
		require.NoError(t, err)
	}

	query := func(tenantID uuid.UUID) []float64 {
		values, queryErr := store.GetParseScoreMembershipCohort(ctx, database.GetParseScoreMembershipCohortParams{
			Metric: "dps", TenantID: tenantID, PolicyVersion: parsepolicy.PolicyVersion,
			QueryVersion: parsepolicy.QueryVersion, Cutoff: database.Timestamptz(time.Now()),
			ExcludeRunID: uuid.New(), EncounterName: "Ragnaros", DifficultyName: "Normal",
			MaxPlayers: 40, PlayerClass: "Warrior", CohortMode: string(parsepolicy.CohortModeSpec),
			PlayerSpec: "Fury", PlayerSubSpec: "",
		})
		require.NoError(t, queryErr)
		return values
	}

	assert.ElementsMatch(t, []float64{100, 200}, query(uuid.Nil), "root includes untenanted and include_in_all memberships only")
	assert.Equal(t, []float64{200}, query(included.ID), "tenant scoring uses exact membership")
	assert.Equal(t, []float64{300}, query(excluded.ID), "excluded tenant remains isolated from root and other tenants")
}

func refreshScoringMemberships(t *testing.T, ctx context.Context, store database.Store, logGroupID uuid.UUID) {
	t.Helper()
	_, err := store.RefreshParseScoreMembershipsForLogGroup(ctx, database.RefreshParseScoreMembershipsForLogGroupParams{
		LogGroupID: logGroupID, PolicyVersion: parsepolicy.PolicyVersion, QueryVersion: parsepolicy.QueryVersion,
	})
	require.NoError(t, err)
}

type scoringFixture struct {
	realmID    uuid.UUID
	instanceID uuid.UUID
	logGroupID uuid.UUID
}

func setupScoringFixture(t *testing.T, pool *pgxpool.Pool, store database.Store) scoringFixture {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)

	serverID := uuid.New()
	realmID := uuid.New()
	instanceID := uuid.New()

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_servers (id, name) VALUES ($1, $2)", serverID, "test-server")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realmID, serverID, "test-realm")
	require.NoError(t, err)
	conn.Release()

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

	return scoringFixture{realmID: realmID, instanceID: instanceID, logGroupID: logGroupID}
}

func setupParseScoreQueueForTest(t *testing.T, pool *pgxpool.Pool) *riverqueue.Queues {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)

	q, err := riverqueue.New(ctx, riverqueue.Options{
		Logger: slog.Default(),
		Pool:   pool,
	})
	require.NoError(t, err)
	riverqueue.AddWorker(q, &servicerankings.WorkerComputeParseScores{
		Store:  database.New(pool),
		Logger: slog.Default(),
	})
	riverqueue.AddWorker(q, &servicerankings.WorkerComputeTimeParseScores{
		Store:  database.New(pool),
		Logger: slog.Default(),
	})
	q.AddQueue(riverqueue.QueueRankings, river.QueueConfig{MaxWorkers: 1})
	require.NoError(t, q.Start(ctx))
	t.Cleanup(func() { _ = q.Stop(context.Background()) })
	return q
}

func createPublishedSnapshot(t *testing.T, ctx context.Context, store database.Store) database.RankingSnapshot {
	t.Helper()
	cutoff := time.Now().Add(-150 * time.Minute)
	snapshot, err := store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
		TenantID:       uuid.Nil,
		Cutoff:         pgtype.Timestamptz{Time: cutoff, Valid: true},
		LookbackDays:   int32(parsepolicy.DefaultLookbackDays),
		CohortMode:     string(parsepolicy.CohortModeSpec),
		PolicyVersion:  int16(parsepolicy.PolicyVersion),
		QueryVersion:   int16(servicerankings.QueryVersion),
		SourceRowCount: 0,
	})
	require.NoError(t, err)
	snapshot, err = store.PublishRankingSnapshot(ctx, snapshot.ID)
	require.NoError(t, err)
	return snapshot
}

func insertRanking(t *testing.T, ctx context.Context, store database.Store,
	instID, realmID uuid.UUID, playerGUID, playerName string, dps, hps float64, killedAt time.Time,
) {
	t.Helper()
	encID := uuid.New()
	_, err := store.InsertEncounter(ctx, database.InsertEncounterParams{
		ID: encID, InstanceID: instID, Name: "Ragnaros",
		KillType: database.KillTypeClean, Boss: true,
		Remaining: guid.GUIDs{},
		StartTime: pgtype.Timestamptz{Time: killedAt.Add(-time.Minute), Valid: true},
		EndTime:   pgtype.Timestamptz{Time: killedAt, Valid: true},
	})
	require.NoError(t, err)
	err = store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
		EncounterID:   uuid.NullUUID{UUID: encID, Valid: true},
		InstanceID:    instID,
		EncounterName: "Ragnaros",
		InstanceName:  "Molten Core",
		PlayerGuid:    playerGUID,
		PlayerName:    playerName,
		PlayerClass:   "WARRIOR",
		PlayerSpec:    "Fury",
		PlayerRole:    "dps",
		RealmID:       realmID,
		RealmName:     "test-realm",
		DamageDone:    int64(dps * 100),
		HealingDone:   int64(hps * 100),
		DurationSecs:  100,
		Dps:           dps,
		Hps:           hps,
		KilledAt:      pgtype.Timestamptz{Time: killedAt, Valid: true},
	})
	require.NoError(t, err)
}
