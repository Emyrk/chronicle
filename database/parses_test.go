package database_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupParsesTest creates a realm with tenant bypass and returns pool, store, and realmID.
func setupParsesTest(t *testing.T) (*pgxpool.Pool, database.Store, uuid.UUID) {
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

type rankingOpts struct {
	encounterName  string
	instanceName   string
	playerGUID     string
	playerClass    string
	playerSpec     string
	difficultyName string
	maxPlayers     int16
	damageDone     int64
	healingDone    int64
	durationSecs   float64
	dps            float64
	hps            float64
	killedAt       time.Time
	isBoss         bool
	instanceID     uuid.UUID
	dupGroupID     *uuid.UUID
}

// insertRankingRow creates an encounter_dps_rankings row and supporting log data.
func insertRankingRow(t *testing.T, pool *pgxpool.Pool, store database.Store, realmID uuid.UUID, opts rankingOpts) {
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

	instanceID := opts.instanceID
	if instanceID == uuid.Nil {
		instanceID = uuid.New()
	}
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
		Name: opts.instanceName, Capabilities: []string{},
	})
	require.NoError(t, err)

	// Set duplicate_group_id if provided.
	if opts.dupGroupID != nil {
		conn, err := pool.Acquire(ctx)
		require.NoError(t, err)
		_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
		require.NoError(t, err)
		_, err = conn.Exec(ctx,
			"UPDATE log_instances SET duplicate_group_id = $1 WHERE id = $2",
			*opts.dupGroupID, instanceID)
		require.NoError(t, err)
		conn.Release()
	}

	var encounterID uuid.NullUUID
	if opts.isBoss {
		encID := uuid.New()
		_, err = store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID:         encID,
			InstanceID: instanceID,
			Name:       opts.encounterName,
			KillType:   database.KillTypeClean,
			Remaining:  guid.GUIDs{},
			Boss:       true,
			StartTime:  database.Timestamptz(opts.killedAt.Add(-time.Duration(opts.durationSecs) * time.Second)),
			EndTime:    database.Timestamptz(opts.killedAt),
		})
		require.NoError(t, err)
		encounterID = uuid.NullUUID{UUID: encID, Valid: true}
	}

	err = store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
		EncounterID:    encounterID,
		InstanceID:     instanceID,
		EncounterName:  opts.encounterName,
		InstanceName:   opts.instanceName,
		PlayerGuid:     opts.playerGUID,
		PlayerName:     "Player-" + opts.playerGUID,
		PlayerClass:    opts.playerClass,
		PlayerSpec:     opts.playerSpec,
		DifficultyName: opts.difficultyName,
		MaxPlayers:     opts.maxPlayers,
		RealmID:        realmID,
		RealmName:      "test-realm",
		DamageDone:     opts.damageDone,
		HealingDone:    opts.healingDone,
		DurationSecs:   opts.durationSecs,
		Dps:            opts.dps,
		Hps:            opts.hps,
		KilledAt:       database.Timestamptz(opts.killedAt),
		LogHashedSlug:  "slug-" + uuid.NewString()[:8],
	})
	require.NoError(t, err)
}

func TestRankingsLeaderboardUsesSingleDuplicateInstance(t *testing.T) {
	t.Parallel()

	_, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "u-" + userID.String()[:8],
	})
	require.NoError(t, err)

	logGroupID := uuid.New()
	baseTime := time.Date(2026, 7, 26, 18, 0, 0, 0, time.UTC)
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1,
		CreatedAt: database.Timestamptz(baseTime), UpdatedAt: database.Timestamptz(baseTime),
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))

	canonicalID := uuid.New()
	duplicateID := uuid.New()
	for _, instanceID := range []uuid.UUID{canonicalID, duplicateID} {
		_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
			Name: "Molten Core", Capabilities: []string{},
		})
		require.NoError(t, err)
	}
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: canonicalID, Valid: true},
		Ids:              []uuid.UUID{canonicalID, duplicateID},
	}))

	insertEncounterRanking := func(instanceID uuid.UUID, encounterName string, healing int64, killedAt time.Time) {
		t.Helper()
		encounterID := uuid.New()
		_, err := store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID: encounterID, InstanceID: instanceID, Name: encounterName,
			KillType: database.KillTypeClean, Remaining: guid.GUIDs{}, Boss: true,
			StartTime: database.Timestamptz(killedAt.Add(-10 * time.Second)),
			EndTime:   database.Timestamptz(killedAt),
		})
		require.NoError(t, err)

		hps := float64(healing) / 10
		require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
			EncounterID: uuid.NullUUID{UUID: encounterID, Valid: true},
			InstanceID:  instanceID, EncounterName: encounterName, InstanceName: "Molten Core",
			PlayerGuid: "P-HEALER", PlayerName: "Healer", PlayerClass: "PRIEST",
			PlayerSpec: "Holy", PlayerRole: "heal", PlayerLevel: 60,
			DifficultyName: "", MaxPlayers: 40, RealmID: realmID, RealmName: "test-realm",
			HealingDone: healing, DurationSecs: 10, Hps: hps,
			KilledAt: database.Timestamptz(killedAt), LogHashedSlug: instanceID.String(),
		}))
	}

	// The canonical upload has the internally consistent run. The duplicate has
	// higher per-encounter HPS, which previously won each DISTINCT ON independently.
	insertEncounterRanking(canonicalID, "Lucifron", 100, baseTime)
	insertEncounterRanking(canonicalID, "Magmadar", 100, baseTime.Add(time.Minute))
	insertEncounterRanking(duplicateID, "Lucifron", 900, baseTime)
	insertEncounterRanking(duplicateID, "Magmadar", 900, baseTime.Add(time.Minute))

	rows, err := store.RankingsLeaderboard(ctx, database.RankingsLeaderboardParams{
		Metric: "hps", QueryLimit: 10,
		InstanceNames:  []string{"Molten Core"},
		EncounterNames: []string{"Lucifron", "Magmadar"},
	})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, canonicalID.String(), rows[0].LogHashedSlug)
	assert.Equal(t, int64(200), rows[0].HealingDone)
	assert.Equal(t, 20.0, rows[0].DurationSecs)
	assert.Equal(t, 10.0, rows[0].Hps)
}

func TestRankingSnapshots(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)

	// Player A — Warrior Fury: 500 DPS on boss "Ragnaros"
	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Ragnaros", instanceName: "Molten Core",
		playerGUID: "P-A", playerClass: "Warrior", playerSpec: "Fury",
		difficultyName: "Normal", maxPlayers: 40,
		damageDone: 150000, durationSecs: 300, dps: 500,
		killedAt: baseTime, isBoss: true,
	})

	// Player B — Warrior Fury: 400 DPS on "Ragnaros"
	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Ragnaros", instanceName: "Molten Core",
		playerGUID: "P-B", playerClass: "Warrior", playerSpec: "Fury",
		difficultyName: "Normal", maxPlayers: 40,
		damageDone: 120000, durationSecs: 300, dps: 400,
		killedAt: baseTime, isBoss: true,
	})

	// Player C — Warrior Arms: 350 DPS on "Ragnaros" (different spec)
	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Ragnaros", instanceName: "Molten Core",
		playerGUID: "P-C", playerClass: "Warrior", playerSpec: "Arms",
		difficultyName: "Normal", maxPlayers: 40,
		damageDone: 105000, durationSecs: 300, dps: 350,
		killedAt: baseTime, isBoss: true,
	})

	// Player D — Mage Fire: 600 DPS on "Ragnaros" (different class)
	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Ragnaros", instanceName: "Molten Core",
		playerGUID: "P-D", playerClass: "Mage", playerSpec: "Fire",
		difficultyName: "Normal", maxPlayers: 40,
		damageDone: 180000, durationSecs: 300, dps: 600,
		killedAt: baseTime, isBoss: true,
	})

	// Trash row (no encounter_id) — should be excluded.
	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Trash", instanceName: "Molten Core",
		playerGUID: "P-A", playerClass: "Warrior", playerSpec: "Fury",
		difficultyName: "Normal", maxPlayers: 40,
		damageDone: 200000, durationSecs: 600, dps: 333,
		killedAt: baseTime, isBoss: false,
	})

	ctx := testutil.Context(t, testutil.WaitMedium)

	t.Run("CreateAndPublishSnapshot", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitMedium)

		// Unique lookback for this subtest: sibling parallel subtests also
		// publish root-tenant snapshots, and GetLatestPublishedSnapshot on a
		// shared (tenant, lookback) key would race with them.
		const lookbackDays = 7
		snapshot, err := store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
			TenantID:      uuid.UUID{}, // nil = root
			Cutoff:        database.Timestamptz(baseTime.Add(time.Hour)),
			LookbackDays:  lookbackDays,
			CohortMode:    "spec",
			PolicyVersion: 1,
			QueryVersion:  1,
		})
		require.NoError(t, err)
		assert.Equal(t, "pending", snapshot.Status)

		// Populate members.
		err = store.BatchInsertSnapshotMembersFromRankings(ctx, snapshot.ID)
		require.NoError(t, err)

		// Publish.
		published, err := store.PublishRankingSnapshot(ctx, snapshot.ID)
		require.NoError(t, err)
		assert.Equal(t, "published", published.Status)
		assert.True(t, published.PublishedAt.Valid)

		// Verify latest published.
		latest, err := store.GetLatestPublishedSnapshot(ctx, database.GetLatestPublishedSnapshotParams{
			TenantID:     uuid.UUID{},
			LookbackDays: lookbackDays,
		})
		require.NoError(t, err)
		assert.Equal(t, snapshot.ID, latest.ID)
	})

	t.Run("BossKillsOnly", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitMedium)

		snapshot, err := store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
			TenantID:      uuid.UUID{},
			Cutoff:        database.Timestamptz(baseTime.Add(time.Hour)),
			LookbackDays:  0,
			CohortMode:    "spec",
			PolicyVersion: 1,
			QueryVersion:  1,
		})
		require.NoError(t, err)

		err = store.BatchInsertSnapshotMembersFromRankings(ctx, snapshot.ID)
		require.NoError(t, err)

		// Get all members — should be 4 (boss kills only, no trash).
		members, err := store.ListSnapshotMembersByPlayerGUID(ctx, database.ListSnapshotMembersByPlayerGUIDParams{
			SnapshotID: snapshot.ID,
			PlayerGuid: "P-A",
		})
		require.NoError(t, err)
		// P-A only has 1 boss kill on Ragnaros.
		assert.Len(t, members, 1)
		assert.Equal(t, "Ragnaros", members[0].EncounterName)
	})

	t.Run("CohortIsolationBySpec", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitMedium)

		snapshot, err := store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
			TenantID:      uuid.UUID{},
			Cutoff:        database.Timestamptz(baseTime.Add(time.Hour)),
			LookbackDays:  0,
			CohortMode:    "spec",
			PolicyVersion: 1,
			QueryVersion:  1,
		})
		require.NoError(t, err)
		err = store.BatchInsertSnapshotMembersFromRankings(ctx, snapshot.ID)
		require.NoError(t, err)

		// Fury Warriors: should be P-A (500) and P-B (400)
		furyValues, err := store.GetSnapshotCohortValues(ctx, database.GetSnapshotCohortValuesParams{
			SnapshotID:     snapshot.ID,
			EncounterName:  "Ragnaros",
			DifficultyName: "Normal",
			MaxPlayers:     40,
			PlayerClass:    "Warrior",
			PlayerSpec:     pgtype.Text{String: "Fury", Valid: true},
			Metric:         "dps",
		})
		require.NoError(t, err)
		assert.Len(t, furyValues, 2)

		// Arms Warriors: should be P-C (350) only
		armsValues, err := store.GetSnapshotCohortValues(ctx, database.GetSnapshotCohortValuesParams{
			SnapshotID:     snapshot.ID,
			EncounterName:  "Ragnaros",
			DifficultyName: "Normal",
			MaxPlayers:     40,
			PlayerClass:    "Warrior",
			PlayerSpec:     pgtype.Text{String: "Arms", Valid: true},
			Metric:         "dps",
		})
		require.NoError(t, err)
		assert.Len(t, armsValues, 1)
		assert.Equal(t, 350.0, armsValues[0].MetricValue)

		// Mage Fire: should be P-D (600)
		mageValues, err := store.GetSnapshotCohortValues(ctx, database.GetSnapshotCohortValuesParams{
			SnapshotID:     snapshot.ID,
			EncounterName:  "Ragnaros",
			DifficultyName: "Normal",
			MaxPlayers:     40,
			PlayerClass:    "Mage",
			PlayerSpec:     pgtype.Text{String: "Fire", Valid: true},
			Metric:         "dps",
		})
		require.NoError(t, err)
		assert.Len(t, mageValues, 1)
		assert.Equal(t, 600.0, mageValues[0].MetricValue)
	})

	t.Run("CohortIsolationByClass", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitMedium)

		snapshot, err := store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
			TenantID:      uuid.UUID{},
			Cutoff:        database.Timestamptz(baseTime.Add(time.Hour)),
			LookbackDays:  0,
			CohortMode:    "class",
			PolicyVersion: 1,
			QueryVersion:  1,
		})
		require.NoError(t, err)
		err = store.BatchInsertSnapshotMembersFromRankings(ctx, snapshot.ID)
		require.NoError(t, err)

		// All Warriors (class mode, no spec filter): should include P-A, P-B, P-C at minimum.
		warriorValues, err := store.GetSnapshotCohortValues(ctx, database.GetSnapshotCohortValuesParams{
			SnapshotID:     snapshot.ID,
			EncounterName:  "Ragnaros",
			DifficultyName: "Normal",
			MaxPlayers:     40,
			PlayerClass:    "Warrior",
			Metric:         "dps",
		})
		require.NoError(t, err)
		assert.GreaterOrEqual(t, len(warriorValues), 3, "should include at least P-A, P-B, P-C Warriors")

		// Verify class mode does NOT include non-Warriors (P-D is Mage).
		for _, v := range warriorValues {
			assert.NotEqual(t, "P-D", v.PlayerGuid, "Mage should not be in Warrior class cohort")
		}
	})

	t.Run("SnapshotImmutability", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitMedium)

		// Create and publish a snapshot with cutoff just after baseTime.
		snapshot, err := store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
			TenantID:      uuid.UUID{},
			Cutoff:        database.Timestamptz(baseTime.Add(time.Hour)),
			LookbackDays:  0,
			CohortMode:    "spec",
			PolicyVersion: 1,
			QueryVersion:  1,
		})
		require.NoError(t, err)
		err = store.BatchInsertSnapshotMembersFromRankings(ctx, snapshot.ID)
		require.NoError(t, err)
		_, err = store.PublishRankingSnapshot(ctx, snapshot.ID)
		require.NoError(t, err)

		// Check that P-IMMU is NOT in the old snapshot.
		membersOld, err := store.ListSnapshotMembersByPlayerGUID(ctx, database.ListSnapshotMembersByPlayerGUIDParams{
			SnapshotID: snapshot.ID,
			PlayerGuid: "P-IMMU",
		})
		require.NoError(t, err)
		assert.Len(t, membersOld, 0, "P-IMMU should not be in old snapshot")

		// Insert a new ranking row AFTER the snapshot cutoff.
		// Unique encounter name: parallel sibling subtests snapshot the shared
		// rankings table, and per-encounter cohort assertions (e.g.
		// CohortIsolationBySpec on "Ragnaros") must not see this row.
		insertRankingRow(t, pool, store, realmID, rankingOpts{
			encounterName: "Ragnaros-Immutability", instanceName: "Molten Core",
			playerGUID: "P-IMMU", playerClass: "Warrior", playerSpec: "Fury",
			difficultyName: "Normal", maxPlayers: 40,
			damageDone: 180000, durationSecs: 300, dps: 600,
			killedAt: baseTime.Add(2 * time.Hour), isBoss: true,
		})

		// Old snapshot should STILL not contain P-IMMU (immutable).
		membersStill, err := store.ListSnapshotMembersByPlayerGUID(ctx, database.ListSnapshotMembersByPlayerGUIDParams{
			SnapshotID: snapshot.ID,
			PlayerGuid: "P-IMMU",
		})
		require.NoError(t, err)
		assert.Len(t, membersStill, 0, "old snapshot should not include later data")

		// A new snapshot with a later cutoff SHOULD include P-IMMU.
		snapshot2, err := store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
			TenantID:      uuid.UUID{},
			Cutoff:        database.Timestamptz(baseTime.Add(3 * time.Hour)),
			LookbackDays:  0,
			CohortMode:    "spec",
			PolicyVersion: 1,
			QueryVersion:  1,
		})
		require.NoError(t, err)
		err = store.BatchInsertSnapshotMembersFromRankings(ctx, snapshot2.ID)
		require.NoError(t, err)

		membersNew, err := store.ListSnapshotMembersByPlayerGUID(ctx, database.ListSnapshotMembersByPlayerGUIDParams{
			SnapshotID: snapshot2.ID,
			PlayerGuid: "P-IMMU",
		})
		require.NoError(t, err)
		assert.Len(t, membersNew, 1, "new snapshot should include later data")
	})

	t.Run("WindowBoundaries", func(t *testing.T) {
		t.Parallel()
		ctx := testutil.Context(t, testutil.WaitMedium)

		// Insert an old kill outside the window. Unique encounter name: with
		// an all-time cutoff this old row is eligible for parallel sibling
		// subtests' snapshots and would pollute their "Ragnaros" cohorts.
		insertRankingRow(t, pool, store, realmID, rankingOpts{
			encounterName: "Ragnaros-Window", instanceName: "Molten Core",
			playerGUID: "P-OLD", playerClass: "Warrior", playerSpec: "Fury",
			difficultyName: "Normal", maxPlayers: 40,
			damageDone: 100000, durationSecs: 300, dps: 333,
			killedAt: baseTime.Add(-365 * 24 * time.Hour), isBoss: true,
		})

		windowStart := baseTime.Add(-30 * 24 * time.Hour)
		snapshot, err := store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
			TenantID:      uuid.UUID{},
			Cutoff:        database.Timestamptz(baseTime.Add(time.Hour)),
			WindowStart:   database.Timestamptz(windowStart),
			LookbackDays:  30,
			CohortMode:    "spec",
			PolicyVersion: 1,
			QueryVersion:  1,
		})
		require.NoError(t, err)
		err = store.BatchInsertSnapshotMembersFromRankings(ctx, snapshot.ID)
		require.NoError(t, err)

		// P-OLD's kill is before window_start, should be excluded.
		members, err := store.ListSnapshotMembersByPlayerGUID(ctx, database.ListSnapshotMembersByPlayerGUIDParams{
			SnapshotID: snapshot.ID,
			PlayerGuid: "P-OLD",
		})
		require.NoError(t, err)
		assert.Len(t, members, 0, "old kill outside window should be excluded")

		// P-A's kill is within window.
		membersA, err := store.ListSnapshotMembersByPlayerGUID(ctx, database.ListSnapshotMembersByPlayerGUIDParams{
			SnapshotID: snapshot.ID,
			PlayerGuid: "P-A",
		})
		require.NoError(t, err)
		assert.Len(t, membersA, 1, "recent kill within window should be included")
	})

	_ = ctx // parent context used for setup
}

func TestSnapshotDedupe(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)

	dupGroup := uuid.New()

	// Same player, same boss, two uploads in the same duplicate group.
	// Upload 1: 400 DPS, non-canonical.
	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Ragnaros", instanceName: "Molten Core",
		playerGUID: "P-DUP", playerClass: "Warrior", playerSpec: "Fury",
		difficultyName: "Normal", maxPlayers: 40,
		damageDone: 120000, durationSecs: 300, dps: 400,
		killedAt: baseTime, isBoss: true,
		dupGroupID: &dupGroup,
	})
	// Upload 2: 450 DPS, canonical because its instance ID anchors the group.
	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Ragnaros", instanceName: "Molten Core",
		playerGUID: "P-DUP", playerClass: "Warrior", playerSpec: "Fury",
		difficultyName: "Normal", maxPlayers: 40,
		damageDone: 135000, durationSecs: 300, dps: 450,
		killedAt: baseTime, isBoss: true,
		instanceID: dupGroup, dupGroupID: &dupGroup,
	})

	ctx := testutil.Context(t, testutil.WaitMedium)

	snapshot, err := store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
		TenantID:      uuid.UUID{},
		Cutoff:        database.Timestamptz(baseTime.Add(time.Hour)),
		LookbackDays:  0,
		CohortMode:    "spec",
		PolicyVersion: 1,
		QueryVersion:  1,
	})
	require.NoError(t, err)
	err = store.BatchInsertSnapshotMembersFromRankings(ctx, snapshot.ID)
	require.NoError(t, err)

	// Should have exactly 1 member for P-DUP from the canonical instance.
	members, err := store.ListSnapshotMembersByPlayerGUID(ctx, database.ListSnapshotMembersByPlayerGUIDParams{
		SnapshotID: snapshot.ID,
		PlayerGuid: "P-DUP",
	})
	require.NoError(t, err)
	assert.Len(t, members, 1, "duplicate group should collapse to 1 member")
	if len(members) > 0 {
		assert.Equal(t, 450.0, members[0].Dps, "should keep the canonical upload")
	}
}

func TestCohortAllKills(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)

	// Player X kills Ragnaros-AllKills in two separate raids — both should
	// appear as separate cohort datapoints.
	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Ragnaros-AllKills", instanceName: "Molten Core",
		playerGUID: "P-X", playerClass: "Warrior", playerSpec: "Fury",
		difficultyName: "Normal", maxPlayers: 40,
		damageDone: 150000, durationSecs: 300, dps: 500,
		killedAt: baseTime, isBoss: true,
	})
	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Ragnaros-AllKills", instanceName: "Molten Core",
		playerGUID: "P-X", playerClass: "Warrior", playerSpec: "Fury",
		difficultyName: "Normal", maxPlayers: 40,
		damageDone: 120000, durationSecs: 300, dps: 400,
		killedAt: baseTime.Add(24 * time.Hour), isBoss: true,
	})

	// Player Y kills the same boss once.
	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Ragnaros-AllKills", instanceName: "Molten Core",
		playerGUID: "P-Y", playerClass: "Warrior", playerSpec: "Fury",
		difficultyName: "Normal", maxPlayers: 40,
		damageDone: 135000, durationSecs: 300, dps: 450,
		killedAt: baseTime, isBoss: true,
	})

	// Player Z has two uploads of the SAME kill (duplicate group). Only the
	// canonical copy should appear, even though it is inserted first.
	dupGroup := uuid.New()
	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Ragnaros-AllKills", instanceName: "Molten Core",
		playerGUID: "P-Z", playerClass: "Warrior", playerSpec: "Fury",
		difficultyName: "Normal", maxPlayers: 40,
		damageDone: 105000, durationSecs: 300, dps: 350,
		killedAt: baseTime, isBoss: true,
		instanceID: dupGroup, dupGroupID: &dupGroup,
	})
	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Ragnaros-AllKills", instanceName: "Molten Core",
		playerGUID: "P-Z", playerClass: "Warrior", playerSpec: "Fury",
		difficultyName: "Normal", maxPlayers: 40,
		damageDone: 99000, durationSecs: 300, dps: 330,
		killedAt: baseTime, isBoss: true,
		dupGroupID: &dupGroup,
	})

	ctx := testutil.Context(t, testutil.WaitMedium)
	snapshot, err := store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
		TenantID:      uuid.UUID{},
		Cutoff:        database.Timestamptz(baseTime.Add(48 * time.Hour)),
		LookbackDays:  0,
		CohortMode:    "spec",
		PolicyVersion: 1,
		QueryVersion:  1,
	})
	require.NoError(t, err)
	err = store.BatchInsertSnapshotMembersFromRankings(ctx, snapshot.ID)
	require.NoError(t, err)

	cohort, err := store.GetSnapshotCohortValues(ctx, database.GetSnapshotCohortValuesParams{
		SnapshotID:     snapshot.ID,
		EncounterName:  "Ragnaros-AllKills",
		DifficultyName: "Normal",
		MaxPlayers:     40,
		PlayerClass:    "Warrior",
		PlayerSpec:     pgtype.Text{String: "Fury", Valid: true},
		Metric:         "dps",
	})
	require.NoError(t, err)

	// Expect 4 rows: P-X(500), P-X(400), P-Y(450), P-Z(350 canonical copy).
	// NOT 3 (best-per-player) and NOT 5 (both dup copies).
	assert.Len(t, cohort, 4, "all-kills cohort: 2 from P-X + 1 from P-Y + 1 from P-Z (dup collapsed)")

	// Verify individual values.
	values := make([]float64, 0, len(cohort))
	for _, c := range cohort {
		switch v := c.MetricValue.(type) {
		case float64:
			values = append(values, v)
		}
	}
	assert.ElementsMatch(t, []float64{500, 400, 450, 350}, values)
}
func TestSnapshotMetricNeutralMembership(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)

	// Healer with zero DPS but positive HPS — should become a member.
	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Ragnaros-Neutral", instanceName: "Molten Core",
		playerGUID: "P-HEAL", playerClass: "Priest", playerSpec: "Holy",
		difficultyName: "Normal", maxPlayers: 40,
		damageDone: 0, healingDone: 90000, durationSecs: 300, dps: 0, hps: 300,
		killedAt: baseTime, isBoss: true,
	})

	// DPS player with positive DPS and zero HPS.
	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Ragnaros-Neutral", instanceName: "Molten Core",
		playerGUID: "P-DPS", playerClass: "Warrior", playerSpec: "Fury",
		difficultyName: "Normal", maxPlayers: 40,
		damageDone: 150000, durationSecs: 300, dps: 500, hps: 0,
		killedAt: baseTime, isBoss: true,
	})

	ctx := testutil.Context(t, testutil.WaitMedium)

	snapshot, err := store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
		TenantID:      uuid.UUID{},
		Cutoff:        database.Timestamptz(baseTime.Add(time.Hour)),
		LookbackDays:  0,
		CohortMode:    "spec",
		PolicyVersion: 1,
		QueryVersion:  1,
	})
	require.NoError(t, err)
	err = store.BatchInsertSnapshotMembersFromRankings(ctx, snapshot.ID)
	require.NoError(t, err)

	t.Run("ZeroDPSHealerIsMember", func(t *testing.T) {
		t.Parallel()
		members, err := store.ListSnapshotMembersByPlayerGUID(ctx, database.ListSnapshotMembersByPlayerGUIDParams{
			SnapshotID: snapshot.ID,
			PlayerGuid: "P-HEAL",
		})
		require.NoError(t, err)
		assert.Len(t, members, 1, "zero-DPS healer with positive HPS must be a snapshot member")
	})

	t.Run("HealerInHPSCohortNotDPS", func(t *testing.T) {
		t.Parallel()
		// HPS cohort should include the healer.
		hpsValues, err := store.GetSnapshotCohortValues(ctx, database.GetSnapshotCohortValuesParams{
			SnapshotID:     snapshot.ID,
			EncounterName:  "Ragnaros-Neutral",
			DifficultyName: "Normal",
			MaxPlayers:     40,
			PlayerClass:    "Priest",
			PlayerSpec:     pgtype.Text{String: "Holy", Valid: true},
			Metric:         "hps",
		})
		require.NoError(t, err)
		assert.Len(t, hpsValues, 1, "healer should appear in HPS cohort")

		// DPS cohort should NOT include the zero-DPS healer.
		dpsValues, err := store.GetSnapshotCohortValues(ctx, database.GetSnapshotCohortValuesParams{
			SnapshotID:     snapshot.ID,
			EncounterName:  "Ragnaros-Neutral",
			DifficultyName: "Normal",
			MaxPlayers:     40,
			PlayerClass:    "Priest",
			PlayerSpec:     pgtype.Text{String: "Holy", Valid: true},
			Metric:         "dps",
		})
		require.NoError(t, err)
		assert.Len(t, dpsValues, 0, "zero-DPS healer must not appear in DPS cohort")
	})
}

func TestSnapshotDedupeSingleRepresentative(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)

	dupGroup := uuid.New()

	// Two copies of the same kill with different HPS. The representative
	// instance is selected once for the duplicate group, rather than per metric.
	// Copy 1: 400 DPS, 200 HPS
	// Copy 2: 400 DPS, 250 HPS
	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Ragnaros-DetDup", instanceName: "Molten Core",
		playerGUID: "P-DDUP", playerClass: "Paladin", playerSpec: "Retribution",
		difficultyName: "Normal", maxPlayers: 40,
		damageDone: 120000, healingDone: 60000, durationSecs: 300, dps: 400, hps: 200,
		killedAt: baseTime, isBoss: true,
		dupGroupID: &dupGroup,
	})
	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Ragnaros-DetDup", instanceName: "Molten Core",
		playerGUID: "P-DDUP", playerClass: "Paladin", playerSpec: "Retribution",
		difficultyName: "Normal", maxPlayers: 40,
		damageDone: 120000, healingDone: 75000, durationSecs: 300, dps: 400, hps: 250,
		killedAt: baseTime, isBoss: true,
		dupGroupID: &dupGroup,
	})

	ctx := testutil.Context(t, testutil.WaitMedium)

	snapshot, err := store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
		TenantID:      uuid.UUID{},
		Cutoff:        database.Timestamptz(baseTime.Add(time.Hour)),
		LookbackDays:  0,
		CohortMode:    "spec",
		PolicyVersion: 1,
		QueryVersion:  1,
	})
	require.NoError(t, err)
	err = store.BatchInsertSnapshotMembersFromRankings(ctx, snapshot.ID)
	require.NoError(t, err)

	members, err := store.ListSnapshotMembersByPlayerGUID(ctx, database.ListSnapshotMembersByPlayerGUIDParams{
		SnapshotID: snapshot.ID,
		PlayerGuid: "P-DDUP",
	})
	require.NoError(t, err)
	require.Len(t, members, 1, "duplicate group should collapse to 1 member")
	assert.Contains(t, []float64{200, 250}, members[0].Hps, "should keep exactly one whole duplicate instance")
}
