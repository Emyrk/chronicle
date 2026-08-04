package servicerankings_test

import (
	"context"
	"fmt"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/parseargs"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
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

	// No receipt should exist — receipt = success only.
	receipts, err := store.GetParseScoreReceiptForInstance(ctx, f.instanceID)
	require.NoError(t, err)
	assert.Empty(t, receipts, "exhausted no-snapshot should NOT create a receipt")
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

	snapshot := createPublishedSnapshot(t, ctx, store)

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
	err = store.BatchInsertSnapshotMembersFromRankings(ctx, snapshot.ID)
	require.NoError(t, err)

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
	receipt, err := store.GetParseScoreReceipt(ctx, database.GetParseScoreReceiptParams{
		InstanceID: f.instanceID,
		SnapshotID: snapshot.ID,
	})
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
	err = store.BatchInsertSnapshotMembersFromRankings(ctx, snapshot.ID)
	require.NoError(t, err)

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

	receipt, err := store.GetParseScoreReceipt(ctx, database.GetParseScoreReceiptParams{
		InstanceID: f.instanceID,
		SnapshotID: snapshot.ID,
	})
	require.NoError(t, err)
	assert.Equal(t, int32(len(results)), receipt.ResultCount)
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

	snapshot := createPublishedSnapshot(t, ctx, store)
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
	err = store.BatchInsertSnapshotMembersFromRankings(ctx, snapshot.ID)
	require.NoError(t, err)

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
	receipt, err := store.GetParseScoreReceipt(ctx, database.GetParseScoreReceiptParams{
		InstanceID: f.instanceID,
		SnapshotID: snapshot.ID,
	})
	require.NoError(t, err)
	assert.NotZero(t, receipt.ComputedAt)
}

func TestWorkerComputeParseScores_RetryTimings(t *testing.T) {
	t.Parallel()

	// Validate retry schedule without wall-clock sleeps.
	assert.Equal(t, 4, servicerankings.MaxParseScoreAttempts)
	assert.Len(t, servicerankings.RetryDelays, servicerankings.MaxParseScoreAttempts)

	assert.Equal(t, time.Duration(0), servicerankings.RetryDelays[0])
	assert.Equal(t, 24*time.Hour, servicerankings.RetryDelays[1])
	assert.Equal(t, 48*time.Hour, servicerankings.RetryDelays[2])
	assert.Equal(t, 7*24*time.Hour, servicerankings.RetryDelays[3])

	// Total time covered: 0 + 24 + 48 + 168 = 240h = 10 days.
	totalHours := 0.0
	for _, d := range servicerankings.RetryDelays {
		totalHours += d.Hours()
	}
	assert.InDelta(t, 240.0, totalHours, 0.01)
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
		MaxRows:       100,
	})
	require.NoError(t, err)
	assert.Empty(t, missing, "no snapshot → instance must not be returned")
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
	compatSnapshot := createPublishedSnapshot(t, ctx, store)

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
	err = store.BatchInsertSnapshotMembersFromRankings(ctx, compatSnapshot.ID)
	require.NoError(t, err)

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
	receipt, err := store.GetParseScoreReceipt(ctx, database.GetParseScoreReceiptParams{
		InstanceID: f.instanceID,
		SnapshotID: compatSnapshot.ID,
	})
	require.NoError(t, err)
	assert.Equal(t, compatSnapshot.ID, receipt.SnapshotID, "must use the compatible snapshot, not the newer incompatible one")
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
	err = store.BatchInsertSnapshotMembersFromRankings(ctx, snapshot.ID)
	require.NoError(t, err)

	// Insert a result for a DIFFERENT tenant on the same instance.
	otherTenantID := uuid.New()
	err = store.InsertParseScoreResult(ctx, database.InsertParseScoreResultParams{
		TenantID:      otherTenantID,
		InstanceID:    f.instanceID,
		RunID:         f.instanceID,
		SnapshotID:    snapshot.ID,
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

func TestSnapshotCascadeDeletesReceiptAndResults(t *testing.T) {
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
		SnapshotID:    snapshot.ID,
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

	// Delete the snapshot — should cascade.
	conn2, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn2.Exec(ctx, "DELETE FROM ranking_snapshots WHERE id = $1", snapshot.ID)
	conn2.Release()
	require.NoError(t, err)

	// Results should be gone.
	results, err := store.GetParseScoreResultsForInstance(ctx, f.instanceID)
	require.NoError(t, err)
	assert.Empty(t, results)

	// Receipts should be gone.
	receipts, err := store.GetParseScoreReceiptForInstance(ctx, f.instanceID)
	require.NoError(t, err)
	assert.Empty(t, receipts)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

	return scoringFixture{realmID: realmID, instanceID: instanceID}
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
