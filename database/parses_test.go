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
	encounterName   string
	instanceName    string
	playerGUID      string
	playerClass     string
	playerSpec      string
	playerSubSpec   string
	difficultyName  string
	maxPlayers      int16
	damageDone      int64
	healingDone     int64
	durationSecs    float64
	dps             float64
	alivePercentage pgtype.Float8
	playerDeaths    pgtype.Int4
	hps             float64
	killedAt        time.Time
	isBoss          bool
	instanceID      uuid.UUID
	dupGroupID      *uuid.UUID
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
		EncounterID:     encounterID,
		InstanceID:      instanceID,
		EncounterName:   opts.encounterName,
		InstanceName:    opts.instanceName,
		PlayerGuid:      opts.playerGUID,
		PlayerName:      "Player-" + opts.playerGUID,
		PlayerClass:     opts.playerClass,
		PlayerSpec:      opts.playerSpec,
		PlayerSubSpec:   opts.playerSubSpec,
		DifficultyName:  opts.difficultyName,
		MaxPlayers:      opts.maxPlayers,
		RealmID:         realmID,
		RealmName:       "test-realm",
		DamageDone:      opts.damageDone,
		HealingDone:     opts.healingDone,
		AlivePercentage: opts.alivePercentage,
		PlayerDeaths:    opts.playerDeaths,
		DurationSecs:    opts.durationSecs,
		Dps:             opts.dps,
		Hps:             opts.hps,
		KilledAt:        database.Timestamptz(opts.killedAt),
		LogHashedSlug:   "slug-" + uuid.NewString()[:8],
	})
	require.NoError(t, err)
}

func TestInstanceRankingRecordsIncludesZeroMetrics(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	instanceID := uuid.New()
	killedAt := time.Date(2026, 8, 28, 1, 0, 0, 0, time.UTC)

	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Baron Geddon", instanceName: "Molten Core",
		playerGUID: "P-ROGGIA", playerClass: "PALADIN", playerSpec: "Holy",
		difficultyName: "", maxPlayers: 0,
		durationSecs: 42.77, killedAt: killedAt, isBoss: true,
		instanceID: instanceID,
	})

	rows, err := store.InstanceRankingRecords(ctx, instanceID)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, "P-ROGGIA", rows[0].PlayerGuid)
	assert.Zero(t, rows[0].Dps)
	assert.False(t, rows[0].AlivePercentage.Valid)
	assert.False(t, rows[0].PlayerDeaths.Valid)
	assert.Zero(t, rows[0].Hps)
}

func TestInstanceRankingRecordsPreservePlayerDeathsNullability(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	instanceID := uuid.New()
	killedAt := time.Date(2026, 9, 21, 12, 0, 0, 0, time.UTC)

	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Ragnaros", instanceName: "Molten Core",
		playerGUID: "P-DEATHS", playerClass: "WARRIOR", playerSpec: "Fury",
		durationSecs: 120, damageDone: 120_000, dps: 1_000,
		alivePercentage: pgtype.Float8{Float64: 75, Valid: true},
		playerDeaths:    pgtype.Int4{Int32: 2, Valid: true},
		killedAt:        killedAt, isBoss: true, instanceID: instanceID,
	})

	rows, err := store.InstanceRankingRecords(ctx, instanceID)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.True(t, rows[0].AlivePercentage.Valid)
	assert.InDelta(t, 75, rows[0].AlivePercentage.Float64, 0.001)
	require.True(t, rows[0].PlayerDeaths.Valid)
	assert.Equal(t, int32(2), rows[0].PlayerDeaths.Int32)
}

func TestTrashRankingsAllowDistinctSubSpecs(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	instanceID := uuid.New()
	killedAt := time.Date(2026, 9, 20, 15, 44, 32, 0, time.UTC)

	insertRankingRow(t, pool, store, realmID, rankingOpts{
		encounterName: "Trash", instanceName: "Molten Core",
		playerGUID: "P-FERAL", playerClass: "DRUID", playerSpec: "Feral", playerSubSpec: "Cat",
		durationSecs: 300, damageDone: 150_000, dps: 500,
		killedAt: killedAt, instanceID: instanceID,
	})

	require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
		InstanceID:    instanceID,
		EncounterName: "Trash",
		InstanceName:  "Molten Core",
		PlayerGuid:    "P-FERAL",
		PlayerName:    "Player-P-FERAL",
		PlayerClass:   "DRUID",
		PlayerSpec:    "Feral",
		PlayerSubSpec: "Bear",
		RealmID:       realmID,
		RealmName:     "test-realm",
		DamageDone:    120_000,
		DurationSecs:  300,
		Dps:           400,
		KilledAt:      database.Timestamptz(killedAt.Add(time.Minute)),
		LogHashedSlug: "sub-spec-regression",
	}))

	rows, err := store.InstanceRankingRecords(ctx, instanceID)
	require.NoError(t, err)
	require.Len(t, rows, 2)
	assert.ElementsMatch(t, []string{"Cat", "Bear"}, []string{rows[0].PlayerSubSpec, rows[1].PlayerSubSpec})
}

func TestRankingsLeaderboardUsesSingleDuplicateInstance(t *testing.T) {
	t.Parallel()

	pool, store, realmID := setupParsesTest(t)
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
	incompleteID := uuid.New()
	for _, instanceID := range []uuid.UUID{canonicalID, duplicateID, incompleteID} {
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

	insertEncounterRanking := func(instanceID uuid.UUID, encounterName, playerClass, playerSpec, playerSubSpec string, healing int64, killedAt time.Time) {
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
			PlayerGuid: "P-HEALER", PlayerName: "Healer", PlayerClass: playerClass,
			PlayerSpec: playerSpec, PlayerSubSpec: playerSubSpec, PlayerRole: "heal", PlayerLevel: 60,
			DifficultyName: "", MaxPlayers: 40, RealmID: realmID, RealmName: "test-realm",
			HealingDone: healing, DurationSecs: 10, Hps: hps,
			KilledAt: database.Timestamptz(killedAt), LogHashedSlug: instanceID.String(),
		}))
	}

	// The group anchor is truncated before Ragnaros. The duplicate has the
	// complete, internally consistent run and must be selected as representative.
	insertEncounterRanking(canonicalID, "Lucifron", "PALADIN", "Holy", "", 100, baseTime)
	insertEncounterRanking(canonicalID, "Magmadar", "PALADIN", "Holy", "", 100, baseTime.Add(time.Minute))
	insertEncounterRanking(duplicateID, "Lucifron", "PRIEST", "Holy", "Bear", 900, baseTime)
	insertEncounterRanking(duplicateID, "Magmadar", "PRIEST", "Holy", "Bear", 900, baseTime.Add(time.Minute))
	insertEncounterRanking(duplicateID, "Ragnaros", "PRIEST", "Holy", "Bear", 900, baseTime.Add(2*time.Minute))
	// A separate truncated run has higher per-encounter HPS, but must not rank
	// when the query explicitly requires all three encounters.
	insertEncounterRanking(incompleteID, "Lucifron", "PRIEST", "Holy", "Bear", 2000, baseTime)
	insertEncounterRanking(incompleteID, "Magmadar", "PRIEST", "Holy", "Bear", 2000, baseTime.Add(time.Minute))

	// Slugless instances must remain linkable by their instance ID when an older
	// denormalized ranking row is also missing a slug.
	_, err = pool.Exec(ctx, "UPDATE encounter_dps_rankings SET log_hashed_slug = '' WHERE instance_id = $1", duplicateID)
	require.NoError(t, err)

	equivalenceParams := database.RankingsLeaderboardParams{
		Metric: "hps", QueryLimit: 10,
		InstanceNames:  []string{"Molten Core"},
		EncounterNames: []string{"Lucifron", "Magmadar", "Ragnaros"},
	}
	fallbackRows, err := store.RankingsLeaderboard(ctx, equivalenceParams)
	require.NoError(t, err)
	sources, err := store.RankingRunSources(ctx, []uuid.UUID{canonicalID, duplicateID})
	require.NoError(t, err)
	require.Len(t, sources, 1)
	_, err = store.UpsertRankingRun(ctx, database.UpsertRankingRunParams(sources[0]))
	require.NoError(t, err)
	persistedRows, err := store.RankingsLeaderboard(ctx, equivalenceParams)
	require.NoError(t, err)
	assert.Equal(t, fallbackRows, persistedRows)

	for _, params := range []database.RankingsLeaderboardParams{
		{
			Metric: "hps", QueryLimit: 10,
			InstanceNames:  []string{"Molten Core"},
			EncounterNames: []string{"Lucifron", "Magmadar", "Ragnaros"},
		},
		{
			Metric: "hps", QueryLimit: 10,
			InstanceNames:  []string{"Molten Core"},
			EncounterNames: []string{"Lucifron", "Magmadar", "Ragnaros"},
			Class:          "PRIEST",
			Spec:           "Holy",
		},
		{
			Metric: "hps", QueryLimit: 10,
			InstanceNames:  []string{"Molten Core"},
			EncounterNames: []string{"Lucifron", "Magmadar", "Ragnaros"},
			SubSpec:        "Bear",
		},
	} {
		rows, err := store.RankingsLeaderboard(ctx, params)
		require.NoError(t, err)
		require.Len(t, rows, 1)
		assert.Equal(t, duplicateID.String(), rows[0].LogHashedSlug)
		assert.Equal(t, int64(2700), rows[0].HealingDone)
		assert.Equal(t, 30.0, rows[0].DurationSecs)
		assert.Equal(t, 90.0, rows[0].Hps)
	}
}

func TestRankingsBoxPlotUsesSingleDuplicateInstance(t *testing.T) {
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
	incompleteID := uuid.New()
	unrelatedID := uuid.New()
	for _, instance := range []struct {
		id   uuid.UUID
		name string
	}{
		{id: canonicalID, name: "Molten Core"},
		{id: duplicateID, name: "Molten Core"},
		{id: incompleteID, name: "Molten Core"},
		{id: unrelatedID, name: "Blackwing Lair"},
	} {
		_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: instance.id, RealmID: realmID, LogGroupID: logGroupID,
			Name: instance.name, Capabilities: []string{},
		})
		require.NoError(t, err)
	}
	require.NoError(t, store.SetDuplicateGroupIDs(ctx, database.SetDuplicateGroupIDsParams{
		DuplicateGroupID: uuid.NullUUID{UUID: canonicalID, Valid: true},
		Ids:              []uuid.UUID{canonicalID, duplicateID},
	}))

	insertEncounterRanking := func(instanceID uuid.UUID, instanceName, encounterName string, healing int64, killedAt time.Time) {
		t.Helper()
		encounterID := uuid.New()
		_, err := store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID: encounterID, InstanceID: instanceID, Name: encounterName,
			KillType: database.KillTypeClean, Remaining: guid.GUIDs{}, Boss: true,
			StartTime: database.Timestamptz(killedAt.Add(-10 * time.Second)),
			EndTime:   database.Timestamptz(killedAt),
		})
		require.NoError(t, err)

		require.NoError(t, store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
			EncounterID: uuid.NullUUID{UUID: encounterID, Valid: true},
			InstanceID:  instanceID, EncounterName: encounterName, InstanceName: instanceName,
			PlayerGuid: "P-HEALER", PlayerName: "Healer", PlayerClass: "PRIEST",
			PlayerSpec: "Holy", PlayerRole: "heal", PlayerLevel: 60,
			DifficultyName: "", MaxPlayers: 40, RealmID: realmID, RealmName: "test-realm",
			HealingDone: healing, DurationSecs: 10, Hps: float64(healing) / 10,
			KilledAt: database.Timestamptz(killedAt), LogHashedSlug: instanceID.String(),
		}))
	}

	// The canonical upload is truncated, so only the complete duplicate should
	// contribute to the Molten Core distribution. The separate incomplete run
	// verifies explicit encounter selections require every requested encounter.
	// The unrelated instance ensures instance-scoped representative selection
	// preserves query results.
	insertEncounterRanking(canonicalID, "Molten Core", "Lucifron", 100, baseTime)
	insertEncounterRanking(duplicateID, "Molten Core", "Lucifron", 900, baseTime)
	insertEncounterRanking(duplicateID, "Molten Core", "Magmadar", 900, baseTime.Add(time.Minute))
	insertEncounterRanking(incompleteID, "Molten Core", "Lucifron", 2000, baseTime)
	insertEncounterRanking(unrelatedID, "Blackwing Lair", "Razorgore", 5000, baseTime)

	rows, err := store.RankingsBoxPlotStats(ctx, database.RankingsBoxPlotStatsParams{
		Metric:         "hps",
		InstanceNames:  []string{"Molten Core"},
		EncounterNames: []string{"Lucifron", "Magmadar"},
		GroupByClass:   false,
	})
	require.NoError(t, err)
	require.Len(t, rows, 1)
	assert.Equal(t, "PRIEST", rows[0].PlayerClass)
	assert.Equal(t, "Holy", rows[0].PlayerSpec)
	assert.Equal(t, int64(1), rows[0].Count)
	assert.Equal(t, 90.0, rows[0].MedianDps)
}
