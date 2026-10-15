package servicerankings_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type cohortMembership struct {
	tenantID      uuid.UUID
	killedAt      time.Time
	dps           float64
	hps           float64
	playerClass   string
	playerSpec    string
	playerSubSpec string
	difficulty    string
	maxPlayers    int16
	playerGUID    string
	playerName    string
}

func cohortGUID(value int) string {
	return fmt.Sprintf("0x%016X", value)
}

func insertCohortMembership(t *testing.T, pool *pgxpool.Pool, store database.Store, realmID uuid.UUID, row cohortMembership) (uuid.UUID, uuid.UUID) {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)

	userID := uuid.New()
	_, err := store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "cohort-" + userID.String()[:8]})
	require.NoError(t, err)
	logGroupID := uuid.New()
	now := database.Timestamptz(time.Now())
	_, err = store.InsertWoWLogGroup(ctx, database.InsertWoWLogGroupParams{
		ID: logGroupID, Owner: userID, LogType: database.LogTypeV1, CreatedAt: now, UpdatedAt: now,
	})
	require.NoError(t, err)
	require.NoError(t, store.InsertParsedLogGroup(ctx, logGroupID))

	instanceID := uuid.New()
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID, Name: "Molten Core",
		HashedSlug: pgtype.Text{String: "cohort-" + instanceID.String()[:8], Valid: true},
		StartTime:  database.Timestamptz(row.killedAt.Add(-5 * time.Minute)),
		EndTime:    database.Timestamptz(row.killedAt), Capabilities: []string{},
		DifficultyName: row.difficulty, MaxPlayers: int32(row.maxPlayers),
	})
	require.NoError(t, err)

	runID := uuid.New()
	_, err = pool.Exec(ctx, `
		INSERT INTO parse_score_memberships (
			tenant_id, policy_version, query_version, run_id, encounter_name, player_guid,
			instance_id, log_group_id, difficulty_name, max_players, player_class,
			player_spec, player_sub_spec, killed_at, dps, hps
		) VALUES ($1, $2, $3, $4, 'Ragnaros', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
		row.tenantID, int16(parsepolicy.PolicyVersion), int16(parsepolicy.QueryVersion), runID,
		row.playerGUID, instanceID, logGroupID, row.difficulty, row.maxPlayers, row.playerClass,
		row.playerSpec, row.playerSubSpec, row.killedAt, row.dps, row.hps)
	require.NoError(t, err)

	if row.playerName != "" {
		_, err = pool.Exec(ctx, `
			INSERT INTO log_instance_players (instance_id, unit_guid, name, level, class, race)
			VALUES ($1, $2::wow_guid, $3, 60, 'WARRIOR', 'Human')`,
			instanceID, row.playerGUID, row.playerName)
		require.NoError(t, err)
	}
	return runID, instanceID
}

func insertCohortTenant(t *testing.T, store database.Store, name string, includeInAll bool, cohortMode string) database.Tenant {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)
	parseConfig := []byte(nil)
	if cohortMode != "" {
		parseConfig = []byte(fmt.Sprintf(`{"cohort_mode":%q}`, cohortMode))
	}
	tenant, err := store.InsertTenant(ctx, database.InsertTenantParams{
		ID: uuid.New(), Name: name, IncludeInAll: includeInAll, ParseConfig: parseConfig, AvailableFormats: []string{},
	})
	require.NoError(t, err)
	return tenant
}

func callParseScoreBuckets(t *testing.T, svc *servicerankings.TestableService, tenantID uuid.UUID, query string) chroniclesdk.ParseScoreCohortBucketsResponse {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/parse-score-cohorts/buckets?"+query, nil)
	if tenantID != uuid.Nil {
		req = req.WithContext(servicetenant.WithTenantID(req.Context(), tenantID))
	}
	w := httptest.NewRecorder()
	svc.HandleParseScoreCohortBuckets(w, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var response chroniclesdk.ParseScoreCohortBucketsResponse
	require.NoError(t, json.NewDecoder(w.Body).Decode(&response))
	return response
}

func callParseScoreCohort(t *testing.T, svc *servicerankings.TestableService, tenantID uuid.UUID, query string) chroniclesdk.ParseScoreCohortResponse {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/parse-score-cohorts/cohort?"+query, nil)
	if tenantID != uuid.Nil {
		req = req.WithContext(servicetenant.WithTenantID(req.Context(), tenantID))
	}
	w := httptest.NewRecorder()
	svc.HandleParseScoreCohort(w, req)
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var response chroniclesdk.ParseScoreCohortResponse
	require.NoError(t, json.NewDecoder(w.Body).Decode(&response))
	return response
}

func TestParseScoreCohorts_WindowMetricsScoringAndDuplicateNames(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupRankingsTest(t)
	svc := servicerankings.NewTestableService(store, nil)
	windowStart := time.Date(2026, time.September, 15, 0, 0, 0, 0, time.UTC)

	for i := 1; i <= 6; i++ {
		_, instanceID := insertCohortMembership(t, pool, store, realmID, cohortMembership{
			tenantID: uuid.Nil, killedAt: windowStart.Add(time.Duration(i-1) * time.Hour),
			dps: float64(i * 100), hps: float64(i * 10), playerClass: "WARRIOR",
			playerSpec: "Fury", playerSubSpec: "Dual Wield", difficulty: "Mythic", maxPlayers: 40,
			playerGUID: cohortGUID(1000 + i), playerName: fmt.Sprintf("Player %d", i),
		})
		if i == 1 {
			ctx := testutil.Context(t, testutil.WaitShort)
			_, err := pool.Exec(ctx, `
				INSERT INTO log_instance_players (instance_id, unit_guid, name, level, class, race)
				VALUES ($1, $2::wow_guid, 'Z Duplicate', 60, 'WARRIOR', 'Human')`, instanceID, cohortGUID(1000+i))
			require.NoError(t, err)
		}
	}
	insertCohortMembership(t, pool, store, realmID, cohortMembership{
		tenantID: uuid.Nil, killedAt: windowStart.Add(-time.Nanosecond), dps: 9999, hps: 999,
		playerClass: "WARRIOR", playerSpec: "Fury", playerSubSpec: "Dual Wield", difficulty: "Mythic", maxPlayers: 40,
		playerGUID: cohortGUID(2001), playerName: "Before Window",
	})
	insertCohortMembership(t, pool, store, realmID, cohortMembership{
		tenantID: uuid.Nil, killedAt: time.Date(2026, time.October, 15, 0, 0, 0, 0, time.UTC), dps: 9999, hps: 999,
		playerClass: "WARRIOR", playerSpec: "Fury", playerSubSpec: "Dual Wield", difficulty: "Mythic", maxPlayers: 40,
		playerGUID: cohortGUID(2002), playerName: "At Cutoff",
	})
	insertCohortMembership(t, pool, store, realmID, cohortMembership{
		tenantID: uuid.Nil, killedAt: windowStart, dps: 700, hps: 0,
		playerClass: "WARRIOR", playerSpec: "Fury", playerSubSpec: "Dual Wield", difficulty: "Mythic", maxPlayers: 40,
		playerGUID: cohortGUID(2003), playerName: "No HPS",
	})
	insertCohortMembership(t, pool, store, realmID, cohortMembership{
		tenantID: uuid.Nil, killedAt: windowStart, dps: 800, hps: 80,
		playerClass: "WARRIOR", playerSpec: "Arms", difficulty: "Mythic", maxPlayers: 40,
		playerGUID: cohortGUID(2004), playerName: "Other Spec",
	})
	insertCohortMembership(t, pool, store, realmID, cohortMembership{
		tenantID: uuid.Nil, killedAt: windowStart, dps: 900, hps: 90,
		playerClass: "WARRIOR", playerSpec: "Fury", playerSubSpec: "Dual Wield", difficulty: "Normal", maxPlayers: 40,
		playerGUID: cohortGUID(2005), playerName: "Other Difficulty",
	})
	insertCohortMembership(t, pool, store, realmID, cohortMembership{
		tenantID: uuid.Nil, killedAt: windowStart, dps: 1000, hps: 100,
		playerClass: "WARRIOR", playerSpec: "Fury", playerSubSpec: "Dual Wield", difficulty: "Mythic", maxPlayers: 20,
		playerGUID: cohortGUID(2006), playerName: "Other Size",
	})
	insertCohortMembership(t, pool, store, realmID, cohortMembership{
		tenantID: uuid.Nil, killedAt: windowStart, dps: 1100, hps: 110,
		playerClass: "MAGE", playerSpec: "Fire", difficulty: "Mythic", maxPlayers: 40,
		playerGUID: cohortGUID(2007), playerName: "Other Class",
	})
	insertCohortMembership(t, pool, store, realmID, cohortMembership{
		tenantID: uuid.Nil, killedAt: windowStart, dps: 1200, hps: 120,
		playerClass: "WARRIOR", playerSpec: "Unknown", difficulty: "Mythic", maxPlayers: 40,
		playerGUID: cohortGUID(2008), playerName: "Unknown Spec",
	})
	insertCohortMembership(t, pool, store, realmID, cohortMembership{
		tenantID: uuid.Nil, killedAt: windowStart, dps: 1300, hps: 130,
		playerClass: "WARRIOR", playerSpec: "Fury", playerSubSpec: "Dual Wield", difficulty: "Mythic", maxPlayers: 40,
		playerGUID: cohortGUID(2009), playerName: "Old Query Version",
	})
	ctx := testutil.Context(t, testutil.WaitShort)
	_, err := pool.Exec(ctx, `UPDATE parse_score_memberships SET query_version = query_version - 1 WHERE player_guid = $1`, cohortGUID(2009))
	require.NoError(t, err)

	buckets := callParseScoreBuckets(t, svc, uuid.Nil, "date=2026-10-15&period=30d&metric=hps")
	require.True(t, buckets.Available)
	assert.Equal(t, "spec", buckets.CohortMode)
	assert.Equal(t, windowStart, *buckets.WindowStart)
	require.Len(t, buckets.Buckets, 5)
	var exactBucket *chroniclesdk.ParseScoreCohortBucket
	for i := range buckets.Buckets {
		bucket := &buckets.Buckets[i]
		if bucket.EncounterName == "Ragnaros" && bucket.PlayerClass == "WARRIOR" &&
			bucket.PlayerSpec == "Fury" && bucket.PlayerSubSpec == "Dual Wield" &&
			bucket.DifficultyName == "Mythic" && bucket.MaxPlayers == 40 {
			exactBucket = bucket
			break
		}
	}
	require.NotNil(t, exactBucket)
	assert.Equal(t, int64(6), exactBucket.SampleSize)

	query := "date=2026-10-15&period=30d&metric=hps&encounter_name=Ragnaros&class=WARRIOR&spec=Fury&sub_spec=Dual+Wield&difficulty=Mythic&max_players=40"
	cohort := callParseScoreCohort(t, svc, uuid.Nil, query)
	require.True(t, cohort.Available)
	require.Len(t, cohort.Entries, 6)
	assert.Equal(t, 6, cohort.SampleSize)
	assert.Equal(t, "low_confidence", cohort.Status)
	assert.Equal(t, 60.0, cohort.Entries[0].MetricValue)
	assert.Equal(t, 100, cohort.Entries[0].DisplayScore)
	assert.Equal(t, 1, cohort.Entries[0].Rank)
	assert.Equal(t, "Player 1", cohort.Entries[5].PlayerName)
	assert.Equal(t, 6, cohort.Entries[5].Rank)
	for _, entry := range cohort.Entries {
		assert.Equal(t, "low_confidence", entry.Status)
	}
}

func TestParseScoreCohorts_TenantVisibilityAndModes(t *testing.T) {
	t.Parallel()
	pool, store, realmID := setupRankingsTest(t)
	svc := servicerankings.NewTestableService(store, nil)
	included := insertCohortTenant(t, store, "included", true, "class")
	private := insertCohortTenant(t, store, "private", false, "spec")
	disabled := insertCohortTenant(t, store, "disabled", true, "disabled")
	killedAt := time.Date(2026, time.October, 1, 0, 0, 0, 0, time.UTC)

	for _, row := range []cohortMembership{
		{tenantID: uuid.Nil, killedAt: killedAt, dps: 100, hps: 10, playerClass: "WARRIOR", playerSpec: "Fury", difficulty: "", maxPlayers: 40, playerGUID: cohortGUID(3001), playerName: "Root"},
		{tenantID: included.ID, killedAt: killedAt, dps: 200, hps: 20, playerClass: "WARRIOR", playerSpec: "Fury", difficulty: "", maxPlayers: 40, playerGUID: cohortGUID(3002), playerName: "Included Fury"},
		{tenantID: included.ID, killedAt: killedAt, dps: 300, hps: 30, playerClass: "WARRIOR", playerSpec: "Arms", difficulty: "", maxPlayers: 40, playerGUID: cohortGUID(3003), playerName: "Included Arms"},
		{tenantID: private.ID, killedAt: killedAt, dps: 400, hps: 40, playerClass: "WARRIOR", playerSpec: "Fury", difficulty: "", maxPlayers: 40, playerGUID: cohortGUID(3004), playerName: "Private"},
	} {
		insertCohortMembership(t, pool, store, realmID, row)
	}

	root := callParseScoreBuckets(t, svc, uuid.Nil, "date=2026-10-15&period=30d&metric=dps")
	require.Len(t, root.Buckets, 2)
	var rootCount int64
	for _, bucket := range root.Buckets {
		rootCount += bucket.SampleSize
	}
	assert.Equal(t, int64(3), rootCount, "root must omit tenants excluded from all")

	tenantBuckets := callParseScoreBuckets(t, svc, included.ID, "date=2026-10-15&period=30d&metric=dps")
	require.Len(t, tenantBuckets.Buckets, 1)
	assert.Equal(t, "class", tenantBuckets.CohortMode)
	assert.Empty(t, tenantBuckets.Buckets[0].PlayerSpec)
	assert.Empty(t, tenantBuckets.Buckets[0].PlayerSubSpec)
	assert.Equal(t, int64(2), tenantBuckets.Buckets[0].SampleSize)

	tenantCohort := callParseScoreCohort(t, svc, included.ID, "date=2026-10-15&period=30d&metric=dps&encounter_name=Ragnaros&class=WARRIOR&difficulty=&max_players=40")
	require.Len(t, tenantCohort.Entries, 2)
	assert.Equal(t, 300.0, tenantCohort.Entries[0].MetricValue)
	assert.Equal(t, 200.0, tenantCohort.Entries[1].MetricValue)

	disabledBuckets := callParseScoreBuckets(t, svc, disabled.ID, "date=2026-10-15&period=30d")
	assert.False(t, disabledBuckets.Available)
	assert.Equal(t, "disabled", disabledBuckets.Reason)
	assert.Empty(t, disabledBuckets.Buckets)
}
