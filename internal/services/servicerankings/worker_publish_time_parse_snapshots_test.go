package servicerankings_test

import (
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupTimeParseTest creates a realm with tenant bypass and returns pool, store, and realmID.
func setupTimeParseTest(t *testing.T) (*pgxpool.Pool, database.Store, uuid.UUID) {
	t.Helper()

	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	ctx := testutil.Context(t, testutil.WaitShort)

	serverID := uuid.New()
	realmID := uuid.New()
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_servers (id, name) VALUES ($1, $2)", serverID, "test-server")
	require.NoError(t, err)
	_, err = conn.Exec(ctx, "INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realmID, serverID, "test-realm")
	require.NoError(t, err)
	conn.Release()

	return pool, store, realmID
}

// insertTimeParseInstance creates a log_instance, an instance_speedrun, and
// optional encounters. Returns the instance ID.
type timeParseInstanceOpts struct {
	instanceName   string
	difficultyName string
	maxPlayers     int32
	qualified      bool
	durationMs     int64
	startTime      time.Time
	encounters     []timeParseEncounterOpts
	// duplicateGroupID if set, links this instance to a duplicate group.
	duplicateGroupID uuid.NullUUID
}

type timeParseEncounterOpts struct {
	name      string
	killType  database.KillType
	boss      bool
	startTime time.Time
	endTime   time.Time
}

func insertTimeParseInstance(t *testing.T, pool *pgxpool.Pool, store database.Store, realmID uuid.UUID, opts timeParseInstanceOpts) uuid.UUID {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "u-" + userID.String()[:8],
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

	instanceID := uuid.New()
	completionTime := opts.startTime.Add(time.Duration(opts.durationMs) * time.Millisecond)
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID:             instanceID,
		RealmID:        realmID,
		LogGroupID:     logGroupID,
		Name:           opts.instanceName,
		Capabilities:   []string{},
		StartTime:      database.Timestamptz(opts.startTime),
		EndTime:        database.Timestamptz(completionTime),
		DifficultyName: opts.difficultyName,
		MaxPlayers:     opts.maxPlayers,
	})
	require.NoError(t, err)

	// Set duplicate_group_id if provided.
	if opts.duplicateGroupID.Valid {
		conn, acqErr := pool.Acquire(ctx)
		require.NoError(t, acqErr)
		_, err = conn.Exec(ctx, "UPDATE log_instances SET duplicate_group_id = $1 WHERE id = $2",
			opts.duplicateGroupID.UUID, instanceID)
		require.NoError(t, err)
		conn.Release()
	}

	err = store.InsertInstanceSpeedrun(ctx, database.InsertInstanceSpeedrunParams{
		InstanceID:   instanceID,
		InstanceName: opts.instanceName,
		RealmID:      realmID,
		Qualified:    opts.qualified,
		StartTime:    database.Timestamptz(opts.startTime),
		CompletionTime: pgtype.Timestamptz{
			Time:  completionTime,
			Valid: opts.durationMs > 0,
		},
		DurationMs: opts.durationMs,
		Proof:      []byte("{}"),
	})
	require.NoError(t, err)

	for _, enc := range opts.encounters {
		_, err = store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID:         uuid.New(),
			InstanceID: instanceID,
			Name:       enc.name,
			KillType:   enc.killType,
			Remaining:  guid.GUIDs{},
			Boss:       enc.boss,
			StartTime:  database.Timestamptz(enc.startTime),
			EndTime:    database.Timestamptz(enc.endTime),
		})
		require.NoError(t, err)
	}

	return instanceID
}

// runTimeParseWorker creates and publishes a time-parse snapshot.
func runTimeParseWorker(t *testing.T, ctx context.Context, store database.Store, tenantID uuid.UUID, cutoff time.Time, lookbackDays int32) {
	t.Helper()
	worker := &servicerankings.WorkerPublishTimeParseSnapshotTenant{
		Store:  store,
		Logger: slog.Default(),
	}
	job := &river.Job[servicerankings.ArgsPublishTimeParseSnapshotTenant]{
		Args: servicerankings.ArgsPublishTimeParseSnapshotTenant{
			TenantID:      tenantID,
			Cutoff:        cutoff,
			LookbackDays:  lookbackDays,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion),
			AdminBackfill: true, // bypass staleness guard for test setup
		},
	}
	err := worker.Work(ctx, job)
	require.NoError(t, err)
}

func TestWorkerPublishTimeParseSnapshotTenant(t *testing.T) {
	t.Parallel()

	t.Run("PendingInvisible", func(t *testing.T) {
		t.Parallel()
		_, store, realmID := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitMedium)

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
		cutoff := time.Date(2024, 6, 2, 0, 0, 0, 0, time.UTC)

		// Insert a qualified run.
		insertTimeParseInstance(t, nil, store, realmID, timeParseInstanceOpts{
			instanceName:   "Molten Core",
			difficultyName: "Normal",
			maxPlayers:     40,
			qualified:      true,
			durationMs:     600000,
			startTime:      baseTime,
		})

		// Manually create a pending snapshot (not published).
		snap, err := store.InsertTimeParseSnapshot(ctx, database.InsertTimeParseSnapshotParams{
			TenantID:      uuid.Nil,
			Cutoff:        database.Timestamptz(cutoff),
			LookbackDays:  0,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion),
			QueryVersion:  1,
		})
		require.NoError(t, err)
		assert.Equal(t, "pending", snap.Status)

		// GetLatestPublished should return no rows.
		_, err = store.GetLatestPublishedTimeParseSnapshot(ctx, database.GetLatestPublishedTimeParseSnapshotParams{
			TenantID:      uuid.Nil,
			LookbackDays:  0,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion),
			QueryVersion:  1,
		})
		require.ErrorIs(t, err, pgx.ErrNoRows)
	})

	t.Run("ClearDuplicateFastestSelection", func(t *testing.T) {
		t.Parallel()
		pool, store, realmID := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitMedium)

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
		cutoff := time.Date(2024, 6, 2, 0, 0, 0, 0, time.UTC)
		dupGroupID := uuid.New()

		// Insert 5+ instances to meet min sample, two are in the same duplicate group.
		// The faster duplicate (300s) should be selected, the slower (600s) dropped.
		insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
			instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
			qualified: true, durationMs: 300000, startTime: baseTime,
			duplicateGroupID: uuid.NullUUID{UUID: dupGroupID, Valid: true},
		})
		insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
			instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
			qualified: true, durationMs: 600000, startTime: baseTime.Add(time.Hour),
			duplicateGroupID: uuid.NullUUID{UUID: dupGroupID, Valid: true},
		})
		// 4 more unique runs to reach sample >= 5 after dedup.
		for i := 0; i < 4; i++ {
			insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
				instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
				qualified: true, durationMs: int64(400000 + i*50000),
				startTime: baseTime.Add(time.Duration(2+i) * time.Hour),
			})
		}

		runTimeParseWorker(t, ctx, store, uuid.Nil, cutoff, 0)

		snap, err := store.GetLatestPublishedTimeParseSnapshot(ctx, database.GetLatestPublishedTimeParseSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion), QueryVersion: 1,
		})
		require.NoError(t, err)

		// Should have 5 clear-time members (not 6).
		clearCount, err := store.CountTimeParseSnapshotClearTimeMembers(ctx, snap.ID)
		require.NoError(t, err)
		assert.Equal(t, int64(5), clearCount)

		// Verify the fastest from the dup group was selected (300s = 300000ms).
		cohort, err := store.GetTimeParseSnapshotClearTimeCohort(ctx, database.GetTimeParseSnapshotClearTimeCohortParams{
			SnapshotID:     snap.ID,
			InstanceName:   "Molten Core",
			DifficultyName: "Normal",
			MaxPlayers:     40,
		})
		require.NoError(t, err)
		require.Len(t, cohort, 5)
		// 300000 should be in cohort, 600000 should not.
		has300 := false
		has600 := false
		for _, d := range cohort {
			if d == 300000 {
				has300 = true
			}
			if d == 600000 {
				has600 = true
			}
		}
		assert.True(t, has300, "fastest duplicate should be selected")
		assert.False(t, has600, "slower duplicate should be dropped")
	})

	t.Run("PartialKillExcludedFromBoss", func(t *testing.T) {
		t.Parallel()
		pool, store, realmID := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitMedium)

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
		cutoff := time.Date(2024, 6, 2, 0, 0, 0, 0, time.UTC)

		// Insert 5 instances with both clean and partial boss kills.
		for i := 0; i < 5; i++ {
			st := baseTime.Add(time.Duration(i) * time.Hour)
			encounters := []timeParseEncounterOpts{
				{
					name: "Ragnaros", killType: database.KillTypeClean, boss: true,
					startTime: st, endTime: st.Add(5 * time.Minute),
				},
			}
			// Add a partial kill for Ragnaros on 2 of the instances.
			if i < 2 {
				encounters = append(encounters, timeParseEncounterOpts{
					name: "Sulfuron", killType: database.KillTypePartial, boss: true,
					startTime: st.Add(6 * time.Minute), endTime: st.Add(10 * time.Minute),
				})
			}
			insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
				instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
				qualified: true, durationMs: 600000 + int64(i*10000),
				startTime: st, encounters: encounters,
			})
		}

		runTimeParseWorker(t, ctx, store, uuid.Nil, cutoff, 0)

		snap, err := store.GetLatestPublishedTimeParseSnapshot(ctx, database.GetLatestPublishedTimeParseSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion), QueryVersion: 1,
		})
		require.NoError(t, err)

		// Ragnaros clean kills: 5 members.
		ragCohort, err := store.GetTimeParseSnapshotBossKillCohort(ctx, database.GetTimeParseSnapshotBossKillCohortParams{
			SnapshotID: snap.ID, InstanceName: "Molten Core",
			EncounterName: "Ragnaros", DifficultyName: "Normal", MaxPlayers: 40,
		})
		require.NoError(t, err)
		assert.Len(t, ragCohort, 5, "clean Ragnaros kills should be included")

		// Sulfuron partial kills: 0 members (partial excluded).
		sulCohort, err := store.GetTimeParseSnapshotBossKillCohort(ctx, database.GetTimeParseSnapshotBossKillCohortParams{
			SnapshotID: snap.ID, InstanceName: "Molten Core",
			EncounterName: "Sulfuron", DifficultyName: "Normal", MaxPlayers: 40,
		})
		require.NoError(t, err)
		assert.Len(t, sulCohort, 0, "partial kills should be excluded")
	})

	t.Run("WipeResetExclusion", func(t *testing.T) {
		t.Parallel()
		pool, store, realmID := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitMedium)

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
		cutoff := time.Date(2024, 6, 2, 0, 0, 0, 0, time.UTC)

		for i := 0; i < 5; i++ {
			st := baseTime.Add(time.Duration(i) * time.Hour)
			encounters := []timeParseEncounterOpts{
				{
					name: "Ragnaros", killType: database.KillTypeClean, boss: true,
					startTime: st, endTime: st.Add(5 * time.Minute),
				},
			}
			// Add a wipe on 2 instances and a reset on another.
			if i == 0 {
				encounters = append(encounters, timeParseEncounterOpts{
					name: "Golemagg", killType: database.KillTypeWipe, boss: true,
					startTime: st.Add(6 * time.Minute), endTime: st.Add(10 * time.Minute),
				})
			}
			if i == 1 {
				encounters = append(encounters, timeParseEncounterOpts{
					name: "Golemagg", killType: database.KillTypeReset, boss: true,
					startTime: st.Add(6 * time.Minute), endTime: st.Add(10 * time.Minute),
				})
			}
			insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
				instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
				qualified: true, durationMs: 600000 + int64(i*10000),
				startTime: st, encounters: encounters,
			})
		}

		runTimeParseWorker(t, ctx, store, uuid.Nil, cutoff, 0)

		snap, err := store.GetLatestPublishedTimeParseSnapshot(ctx, database.GetLatestPublishedTimeParseSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion), QueryVersion: 1,
		})
		require.NoError(t, err)

		// Golemagg wipe/reset encounters should NOT appear.
		golCohort, err := store.GetTimeParseSnapshotBossKillCohort(ctx, database.GetTimeParseSnapshotBossKillCohortParams{
			SnapshotID: snap.ID, InstanceName: "Molten Core",
			EncounterName: "Golemagg", DifficultyName: "Normal", MaxPlayers: 40,
		})
		require.NoError(t, err)
		assert.Empty(t, golCohort, "wipe/reset encounters must be excluded")
	})

	t.Run("StalenessOnBossSourceChange", func(t *testing.T) {
		t.Parallel()
		pool, store, realmID := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitMedium)

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
		cutoff := time.Date(2024, 6, 3, 0, 0, 0, 0, time.UTC)

		// Insert 5 qualified runs with a clean boss kill.
		for i := 0; i < 5; i++ {
			st := baseTime.Add(time.Duration(i) * time.Hour)
			insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
				instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
				qualified: true, durationMs: 600000 + int64(i*10000),
				startTime: st,
				encounters: []timeParseEncounterOpts{
					{
						name: "Ragnaros", killType: database.KillTypeClean, boss: true,
						startTime: st, endTime: st.Add(5 * time.Minute),
					},
				},
			})
		}

		// First publication — creates a snapshot.
		runTimeParseWorker(t, ctx, store, uuid.Nil, cutoff, 0)

		snap1, err := store.GetLatestPublishedTimeParseSnapshot(ctx, database.GetLatestPublishedTimeParseSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion), QueryVersion: 1,
		})
		require.NoError(t, err)
		bossCount1, err := store.CountTimeParseSnapshotBossKillMembers(ctx, snap1.ID)
		require.NoError(t, err)
		assert.Equal(t, int64(5), bossCount1)

		// Add a new boss encounter (simulating a reparse adding a boss).
		st := baseTime.Add(10 * time.Hour)
		insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
			instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
			qualified: true, durationMs: 650000, startTime: st,
			encounters: []timeParseEncounterOpts{
				{
					name: "Ragnaros", killType: database.KillTypeClean, boss: true,
					startTime: st, endTime: st.Add(5 * time.Minute),
				},
			},
		})

		// Second publication with a different cutoff — staleness guard should
		// detect the boss source change and publish a new snapshot.
		cutoff2 := time.Date(2024, 6, 4, 0, 0, 0, 0, time.UTC)
		worker := &servicerankings.WorkerPublishTimeParseSnapshotTenant{
			Store:  store,
			Logger: slog.Default(),
		}
		job := &river.Job[servicerankings.ArgsPublishTimeParseSnapshotTenant]{
			Args: servicerankings.ArgsPublishTimeParseSnapshotTenant{
				TenantID:      uuid.Nil,
				Cutoff:        cutoff2,
				LookbackDays:  0,
				PolicyVersion: int16(timeparsepolicy.PolicyVersion),
			},
		}
		err = worker.Work(ctx, job)
		require.NoError(t, err)

		snap2, err := store.GetLatestPublishedTimeParseSnapshot(ctx, database.GetLatestPublishedTimeParseSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion), QueryVersion: 1,
		})
		require.NoError(t, err)
		assert.NotEqual(t, snap1.ID, snap2.ID, "new snapshot should be published after boss source change")
		bossCount2, err := store.CountTimeParseSnapshotBossKillMembers(ctx, snap2.ID)
		require.NoError(t, err)
		assert.Equal(t, int64(6), bossCount2, "new boss source should be included")
	})

	// StalenessOnReparseDurationChange proves that the content fingerprint
	// detects a reparse-like duration change even when row_count and
	// gameplay watermark (max start_time) remain identical.
	//
	// Scenario: 5 qualified speedruns are published, then one run's
	// duration_ms is updated in-place (simulating a reparse that corrects
	// the clear time). The staleness guard must detect the fingerprint
	// change and publish a new snapshot.
	t.Run("StalenessOnReparseDurationChange", func(t *testing.T) {
		t.Parallel()
		pool, store, realmID := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitMedium)

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
		cutoff := time.Date(2024, 6, 3, 0, 0, 0, 0, time.UTC)

		// Insert 5 qualified runs. All start times are before the cutoff.
		var firstInstanceID uuid.UUID
		for i := 0; i < 5; i++ {
			st := baseTime.Add(time.Duration(i) * time.Hour)
			id := insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
				instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
				qualified: true, durationMs: 600000 + int64(i*10000),
				startTime: st,
			})
			if i == 0 {
				firstInstanceID = id
			}
		}

		// First publication.
		worker := &servicerankings.WorkerPublishTimeParseSnapshotTenant{
			Store:  store,
			Logger: slog.Default(),
		}
		job1 := &river.Job[servicerankings.ArgsPublishTimeParseSnapshotTenant]{
			Args: servicerankings.ArgsPublishTimeParseSnapshotTenant{
				TenantID:      uuid.Nil,
				Cutoff:        cutoff,
				LookbackDays:  0,
				PolicyVersion: int16(timeparsepolicy.PolicyVersion),
			},
		}
		err := worker.Work(ctx, job1)
		require.NoError(t, err)

		snap1, err := store.GetLatestPublishedTimeParseSnapshot(ctx, database.GetLatestPublishedTimeParseSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion), QueryVersion: 1,
		})
		require.NoError(t, err)
		clearCount1, err := store.CountTimeParseSnapshotClearTimeMembers(ctx, snap1.ID)
		require.NoError(t, err)
		assert.Equal(t, int64(5), clearCount1)

		// Simulate a reparse: update the first instance's duration in-place.
		// Row count and max(start_time) watermark stay identical.
		conn, err := pool.Acquire(ctx)
		require.NoError(t, err)
		_, err = conn.Exec(ctx,
			"UPDATE instance_speedruns SET duration_ms = $1 WHERE instance_id = $2",
			555000, firstInstanceID)
		require.NoError(t, err)
		conn.Release()

		// Second publication with a different cutoff.
		cutoff2 := time.Date(2024, 6, 4, 0, 0, 0, 0, time.UTC)
		job2 := &river.Job[servicerankings.ArgsPublishTimeParseSnapshotTenant]{
			Args: servicerankings.ArgsPublishTimeParseSnapshotTenant{
				TenantID:      uuid.Nil,
				Cutoff:        cutoff2,
				LookbackDays:  0,
				PolicyVersion: int16(timeparsepolicy.PolicyVersion),
			},
		}
		err = worker.Work(ctx, job2)
		require.NoError(t, err)

		snap2, err := store.GetLatestPublishedTimeParseSnapshot(ctx, database.GetLatestPublishedTimeParseSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion), QueryVersion: 1,
		})
		require.NoError(t, err)
		assert.NotEqual(t, snap1.ID, snap2.ID,
			"fingerprint must detect duration change even when row_count and watermark are unchanged")

		// The new snapshot should reflect the updated duration.
		cohort, err := store.GetTimeParseSnapshotClearTimeCohort(ctx, database.GetTimeParseSnapshotClearTimeCohortParams{
			SnapshotID: snap2.ID, InstanceName: "Molten Core",
			DifficultyName: "Normal", MaxPlayers: 40,
		})
		require.NoError(t, err)
		require.Len(t, cohort, 5)
		has555 := false
		for _, d := range cohort {
			if d == 555000 {
				has555 = true
			}
		}
		assert.True(t, has555, "updated duration (555000) should appear in the new snapshot")
	})

	t.Run("HistoricalSelection", func(t *testing.T) {
		t.Parallel()
		pool, store, realmID := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitMedium)

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)

		// Insert 5 runs to have data.
		for i := 0; i < 5; i++ {
			st := baseTime.Add(time.Duration(i) * time.Hour)
			insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
				instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
				qualified: true, durationMs: 600000 + int64(i*10000), startTime: st,
			})
		}

		// Publish snapshots for two different cutoffs.
		cutoff1 := time.Date(2024, 6, 2, 0, 0, 0, 0, time.UTC)
		cutoff2 := time.Date(2024, 6, 10, 0, 0, 0, 0, time.UTC)
		runTimeParseWorker(t, ctx, store, uuid.Nil, cutoff1, 0)
		runTimeParseWorker(t, ctx, store, uuid.Nil, cutoff2, 0)

		// Historical lookup with "before" at cutoff1+1s should return cutoff1 snapshot.
		beforeTime := pgtype.Timestamptz{Time: cutoff1.Add(time.Second), Valid: true}
		snap, err := store.GetLatestPublishedTimeParseSnapshotBefore(ctx, database.GetLatestPublishedTimeParseSnapshotBeforeParams{
			TenantID: uuid.Nil, LookbackDays: 0,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion), QueryVersion: 1,
			Before: beforeTime,
		})
		require.NoError(t, err)
		assert.Equal(t, cutoff1.UTC(), snap.Cutoff.Time.UTC())

		// Historical lookup with "before" at cutoff2+1s should return cutoff2 snapshot.
		beforeTime2 := pgtype.Timestamptz{Time: cutoff2.Add(time.Second), Valid: true}
		snap2, err := store.GetLatestPublishedTimeParseSnapshotBefore(ctx, database.GetLatestPublishedTimeParseSnapshotBeforeParams{
			TenantID: uuid.Nil, LookbackDays: 0,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion), QueryVersion: 1,
			Before: beforeTime2,
		})
		require.NoError(t, err)
		assert.Equal(t, cutoff2.UTC(), snap2.Cutoff.Time.UTC())
	})

	t.Run("IdempotentPublication", func(t *testing.T) {
		t.Parallel()
		pool, store, realmID := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitMedium)

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
		cutoff := time.Date(2024, 6, 2, 0, 0, 0, 0, time.UTC)

		for i := 0; i < 5; i++ {
			insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
				instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
				qualified: true, durationMs: 600000 + int64(i*10000),
				startTime: baseTime.Add(time.Duration(i) * time.Hour),
			})
		}

		// Publish twice with the same cutoff — second run should be idempotent.
		runTimeParseWorker(t, ctx, store, uuid.Nil, cutoff, 0)
		snap1, err := store.GetLatestPublishedTimeParseSnapshot(ctx, database.GetLatestPublishedTimeParseSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion), QueryVersion: 1,
		})
		require.NoError(t, err)

		runTimeParseWorker(t, ctx, store, uuid.Nil, cutoff, 0)
		snap2, err := store.GetLatestPublishedTimeParseSnapshot(ctx, database.GetLatestPublishedTimeParseSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion), QueryVersion: 1,
		})
		require.NoError(t, err)

		assert.Equal(t, snap1.ID, snap2.ID, "second run with same cutoff should not create new snapshot")
	})

	t.Run("PublishedMembershipImmutability", func(t *testing.T) {
		t.Parallel()
		pool, store, realmID := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitMedium)

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
		cutoff := time.Date(2024, 6, 2, 0, 0, 0, 0, time.UTC)

		for i := 0; i < 5; i++ {
			insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
				instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
				qualified: true, durationMs: 600000 + int64(i*10000),
				startTime: baseTime.Add(time.Duration(i) * time.Hour),
			})
		}

		runTimeParseWorker(t, ctx, store, uuid.Nil, cutoff, 0)

		snap, err := store.GetLatestPublishedTimeParseSnapshot(ctx, database.GetLatestPublishedTimeParseSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion), QueryVersion: 1,
		})
		require.NoError(t, err)

		clearCount1, err := store.CountTimeParseSnapshotClearTimeMembers(ctx, snap.ID)
		require.NoError(t, err)

		// Add more data after the snapshot.
		for i := 0; i < 3; i++ {
			insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
				instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
				qualified: true, durationMs: 700000 + int64(i*10000),
				startTime: baseTime.Add(time.Duration(10+i) * time.Hour),
			})
		}

		// Re-read member count — should be unchanged.
		clearCount2, err := store.CountTimeParseSnapshotClearTimeMembers(ctx, snap.ID)
		require.NoError(t, err)
		assert.Equal(t, clearCount1, clearCount2, "published snapshot membership must not change")

		// The cohort durations should also be unchanged.
		cohort, err := store.GetTimeParseSnapshotClearTimeCohort(ctx, database.GetTimeParseSnapshotClearTimeCohortParams{
			SnapshotID: snap.ID, InstanceName: "Molten Core",
			DifficultyName: "Normal", MaxPlayers: 40,
		})
		require.NoError(t, err)
		assert.Equal(t, int(clearCount1), len(cohort), "cohort size must match member count")
	})

	t.Run("PolicyVersionFilter", func(t *testing.T) {
		t.Parallel()
		pool, store, realmID := setupTimeParseTest(t)
		ctx := testutil.Context(t, testutil.WaitMedium)

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
		cutoff := time.Date(2024, 6, 2, 0, 0, 0, 0, time.UTC)

		for i := 0; i < 5; i++ {
			insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
				instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
				qualified: true, durationMs: 600000 + int64(i*10000),
				startTime: baseTime.Add(time.Duration(i) * time.Hour),
			})
		}

		runTimeParseWorker(t, ctx, store, uuid.Nil, cutoff, 0)

		// Query with a different policy_version should return no rows.
		_, err := store.GetLatestPublishedTimeParseSnapshot(ctx, database.GetLatestPublishedTimeParseSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion) + 1, QueryVersion: 1,
		})
		require.ErrorIs(t, err, pgx.ErrNoRows, "mismatched policy_version should find nothing")

		// Query with a different query_version should also return no rows.
		_, err = store.GetLatestPublishedTimeParseSnapshot(ctx, database.GetLatestPublishedTimeParseSnapshotParams{
			TenantID: uuid.Nil, LookbackDays: 0,
			PolicyVersion: int16(timeparsepolicy.PolicyVersion), QueryVersion: 99,
		})
		require.ErrorIs(t, err, pgx.ErrNoRows, "mismatched query_version should find nothing")
	})
}
