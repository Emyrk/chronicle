package servicerankings_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"fmt"
	"github.com/Emyrk/chronicle/api/chroniclesdk"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type noMembershipCohortStore struct {
	database.Store
	queries int
}

func (s *noMembershipCohortStore) GetParseScoreMembershipCohort(context.Context, database.GetParseScoreMembershipCohortParams) ([]float64, error) {
	s.queries++
	return nil, fmt.Errorf("membership cohort query must not run")
}

// parsesTestFixture holds state for instance parses handler tests.
type parsesTestFixture struct {
	pool       *pgxpool.Pool
	store      database.Store
	logGroupID uuid.UUID
	realmID    uuid.UUID
	instanceID uuid.UUID
}

func setupParsesTest(t *testing.T) parsesTestFixture {
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

	// Create user, log group, instance (shared for all rankings in this fixture).
	userID := uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "test-user",
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
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
		Name: "Molten Core", Capabilities: []string{},
		StartTime: database.Timestamptz(now.Add(time.Hour)),
	})
	require.NoError(t, err)

	return parsesTestFixture{
		pool:       pool,
		store:      store,
		realmID:    realmID,
		logGroupID: logGroupID,
		instanceID: instanceID,
	}
}

// insertTestRanking inserts an encounter_dps_ranking row for the fixture's instance.
func (f parsesTestFixture) insertTestRanking(t *testing.T, opts struct {
	encounterName  string
	playerGUID     string
	playerName     string
	playerClass    string
	playerSpec     string
	dps            float64
	hps            float64
	difficultyName string
	maxPlayers     int16
	killedAt       time.Time
}) {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)

	encID := uuid.New()
	_, err := f.store.InsertEncounter(ctx, database.InsertEncounterParams{
		ID:         encID,
		InstanceID: f.instanceID,
		Name:       opts.encounterName,
		KillType:   database.KillTypeClean,
		Remaining:  guid.GUIDs{},
		Boss:       true,
		StartTime:  database.Timestamptz(opts.killedAt.Add(-60 * time.Second)),
		EndTime:    database.Timestamptz(opts.killedAt),
	})
	require.NoError(t, err)

	err = f.store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
		EncounterID:    uuid.NullUUID{UUID: encID, Valid: true},
		InstanceID:     f.instanceID,
		EncounterName:  opts.encounterName,
		InstanceName:   "Molten Core",
		PlayerGuid:     opts.playerGUID,
		PlayerName:     opts.playerName,
		PlayerClass:    opts.playerClass,
		PlayerSpec:     opts.playerSpec,
		DifficultyName: opts.difficultyName,
		MaxPlayers:     opts.maxPlayers,
		RealmID:        f.realmID,
		RealmName:      "test-realm",
		DamageDone:     int64(opts.dps * 60),
		HealingDone:    int64(opts.hps * 60),
		DurationSecs:   60,
		Dps:            opts.dps,
		Hps:            opts.hps,
		KilledAt:       database.Timestamptz(opts.killedAt),
		LogHashedSlug:  "slug-" + uuid.NewString()[:8],
	})
	require.NoError(t, err)
}

// publishSnapshot refreshes the current membership rows and returns an opaque
// legacy snapshot provenance ID for persisted-result tests.
type legacySnapshotRef struct {
	ID uuid.UUID
}

func (f parsesTestFixture) publishSnapshot(t *testing.T) legacySnapshotRef {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)
	conn, err := f.pool.Acquire(ctx)
	require.NoError(t, err)
	_, err = conn.Exec(ctx, `
		INSERT INTO parse_score_memberships (
			tenant_id, policy_version, query_version, run_id, encounter_name, player_guid,
			instance_id, log_group_id, difficulty_name, max_players,
			player_class, player_spec, player_sub_spec, killed_at, dps, hps
		)
		SELECT
			'00000000-0000-0000-0000-000000000000'::uuid, $2, $3, gen_random_uuid(),
			ranking.encounter_name, ranking.player_guid, ranking.instance_id, instance.log_group_id,
			ranking.difficulty_name, ranking.max_players, ranking.player_class,
			ranking.player_spec, ranking.player_sub_spec, ranking.killed_at, ranking.dps, ranking.hps
		FROM encounter_dps_rankings ranking
		JOIN log_instances instance ON instance.id = ranking.instance_id
		WHERE ranking.instance_id = $1
		ON CONFLICT (tenant_id, policy_version, query_version, run_id, encounter_name, player_guid)
		DO NOTHING`, f.instanceID, parsepolicy.PolicyVersion, parsepolicy.QueryVersion)
	conn.Release()
	require.NoError(t, err)
	return legacySnapshotRef{ID: uuid.New()}
}

func (f parsesTestFixture) setPlayerSubSpec(t *testing.T, playerGUID, subSpec string) {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)
	conn, err := f.pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()
	_, err = conn.Exec(ctx, "SET app.tenant_bypass = 'true'")
	require.NoError(t, err)
	_, err = conn.Exec(ctx,
		"UPDATE encounter_dps_rankings SET player_sub_spec = $1 WHERE instance_id = $2 AND player_guid = $3",
		subSpec, f.instanceID, playerGUID)
	require.NoError(t, err)
}

func (f parsesTestFixture) insertSimpleRanking(
	t *testing.T,
	encounterName, playerGUID string,
	dps, hps float64,
) {
	t.Helper()
	f.insertTestRanking(t, struct {
		encounterName  string
		playerGUID     string
		playerName     string
		playerClass    string
		playerSpec     string
		dps            float64
		hps            float64
		difficultyName string
		maxPlayers     int16
		killedAt       time.Time
	}{
		encounterName:  encounterName,
		playerGUID:     playerGUID,
		playerName:     "PersistedPlayer",
		playerClass:    "WARRIOR",
		playerSpec:     "Arms",
		dps:            dps,
		hps:            hps,
		difficultyName: "Normal",
		maxPlayers:     40,
		killedAt:       time.Now(),
	})
}

func (f parsesTestFixture) insertPersistedParseResult(t *testing.T, params struct {
	tenantID      uuid.UUID
	snapshotID    uuid.NullUUID
	encounterName string
	playerGUID    string
	playerName    string
	metric        string
	metricValue   float64
	preciseScore  float64
	displayScore  int16
	rank          int32
	sampleSize    int32
	status        string
}) {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)
	require.NoError(t, f.store.InsertParseScoreResult(ctx, database.InsertParseScoreResultParams{
		TenantID:       params.tenantID,
		InstanceID:     f.instanceID,
		RunID:          f.instanceID,
		SnapshotID:     params.snapshotID,
		EncounterName:  params.encounterName,
		PlayerGuid:     params.playerGUID,
		PlayerName:     params.playerName,
		PlayerClass:    "WARRIOR",
		PlayerSpec:     "Arms",
		PlayerRole:     "dps",
		Metric:         params.metric,
		MetricValue:    params.metricValue,
		PreciseScore:   params.preciseScore,
		DisplayScore:   params.displayScore,
		Rank:           params.rank,
		SampleSize:     params.sampleSize,
		Status:         params.status,
		InstanceName:   "Molten Core",
		DifficultyName: "Normal",
		MaxPlayers:     40,
		KilledAt:       database.Timestamptz(time.Now()),
	}))
}

func (f parsesTestFixture) insertPersistedParseReceipt(
	t *testing.T,
	tenantID uuid.UUID,
	snapshotID uuid.UUID,
	resultCount int32,
) {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)
	cutoff := time.Now().UTC().Add(-time.Hour)
	_, err := f.pool.Exec(ctx, `
		INSERT INTO parse_score_receipts (
			tenant_id, instance_id, snapshot_id, policy_version, query_version,
			lookback_days, source_count, result_count, cutoff, window_start, cohort_mode
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10)`,
		tenantID, f.instanceID, snapshotID, parsepolicy.PolicyVersion, servicerankings.QueryVersion,
		parsepolicy.DefaultLookbackDays, resultCount, cutoff,
		cutoff.AddDate(0, 0, -int(parsepolicy.DefaultLookbackDays)), string(parsepolicy.CohortModeSpec))
	require.NoError(t, err)
}

func requestInstanceParses(
	t *testing.T,
	store database.Store,
	instanceID uuid.UUID,
	query string,
) chroniclesdk.InstanceParsesResponse {
	t.Helper()
	svc := newTestService(t, store)
	return requestInstanceParsesWithHandler(t, svc.HandleInstanceParses, instanceID, query)
}

func requestGuardedInstanceParses(
	t *testing.T,
	store *noMembershipCohortStore,
	instanceID uuid.UUID,
	query string,
) chroniclesdk.InstanceParsesResponse {
	t.Helper()
	svc := servicerankings.NewTestableParsesService(store, slog.Default())
	return requestInstanceParsesWithHandler(t, svc.HandleInstanceParses, instanceID, query)
}

func requestInstanceParsesWithHandler(
	t *testing.T,
	handler http.HandlerFunc,
	instanceID uuid.UUID,
	query string,
) chroniclesdk.InstanceParsesResponse {
	t.Helper()
	r := chi.NewRouter()
	r.Get("/instances/{instanceID}/parses", handler)

	req := httptest.NewRequest("GET", "/instances/"+instanceID.String()+"/parses"+query, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var response chroniclesdk.InstanceParsesResponse
	require.NoError(t, json.NewDecoder(w.Body).Decode(&response))
	return response
}

// newTestService creates a minimal Service that can handle instance parses requests.
func newTestService(t *testing.T, store database.Store) *servicerankings.TestableService {
	t.Helper()
	return servicerankings.NewTestableService(store, slog.Default())
}

func TestHandleInstanceParses_InvalidInstanceIsUnavailable(t *testing.T) {
	t.Parallel()
	f := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)
	require.NoError(t, f.store.InvalidateWoWLogGroup(ctx, database.InvalidateWoWLogGroupParams{
		LogGroupID: f.logGroupID,
		Reason:     "corrupt combat log",
	}))

	response := requestInstanceParses(t, f.store, f.instanceID, "?metric=hps")
	assert.False(t, response.Available)
	assert.Equal(t, "invalid", response.Reason)
	assert.Equal(t, "hps", response.Metric)
	assert.Empty(t, response.Players)
}

func TestHandleInstanceParses_PersistedProjection(t *testing.T) {
	t.Parallel()

	persistedResult := func(
		f parsesTestFixture,
		t *testing.T,
		snapshotID uuid.NullUUID,
		tenantID uuid.UUID,
		encounterName, metric string,
		score int16,
	) {
		f.insertPersistedParseResult(t, struct {
			tenantID      uuid.UUID
			snapshotID    uuid.NullUUID
			encounterName string
			playerGUID    string
			playerName    string
			metric        string
			metricValue   float64
			preciseScore  float64
			displayScore  int16
			rank          int32
			sampleSize    int32
			status        string
		}{
			tenantID:      tenantID,
			snapshotID:    snapshotID,
			encounterName: encounterName,
			playerGUID:    "Player-persisted",
			playerName:    "PersistedPlayer",
			metric:        metric,
			metricValue:   1234,
			preciseScore:  float64(score),
			displayScore:  score,
			rank:          2,
			sampleSize:    25,
			status:        string(parsepolicy.StatusOK),
		})
	}

	t.Run("PrefersDPSAndHPSResultsAndPreservesMultiEncounterAverage", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)
		f.insertSimpleRanking(t, "Ragnaros", "Player-persisted", 1000, 500)
		f.insertSimpleRanking(t, "Golemagg", "Player-persisted", 900, 400)
		f.setPlayerSubSpec(t, "Player-persisted", "Bear")
		snapshot := f.publishSnapshot(t)
		snapshotID := uuid.NullUUID{UUID: snapshot.ID, Valid: true}

		persistedResult(f, t, snapshotID, uuid.Nil, "Ragnaros", "dps", 90)
		persistedResult(f, t, snapshotID, uuid.Nil, "Golemagg", "dps", 70)
		persistedResult(f, t, snapshotID, uuid.Nil, "Ragnaros", "hps", 80)
		persistedResult(f, t, snapshotID, uuid.Nil, "Golemagg", "hps", 60)
		f.insertPersistedParseReceipt(t, uuid.Nil, snapshot.ID, 4)

		for _, test := range []struct {
			metric      string
			period      string
			wantScores  []int
			wantAverage int
		}{
			{metric: "dps", wantScores: []int{90, 70}, wantAverage: 80},
			{metric: "hps", period: "&period=60d", wantScores: []int{80, 60}, wantAverage: 70},
		} {
			response := requestInstanceParses(
				t,
				f.store,
				f.instanceID,
				"?encounter_names=Ragnaros,Golemagg&metric="+test.metric+test.period,
			)
			require.True(t, response.Available)
			require.Len(t, response.Players, 1)
			require.Len(t, response.Players[0].Bosses, 2)
			assert.Equal(t, "Bear", response.Players[0].PlayerSubSpec)
			assert.Equal(t, test.wantScores[0], response.Players[0].Bosses[0].DisplayScore)
			assert.Equal(t, test.wantScores[1], response.Players[0].Bosses[1].DisplayScore)
			require.NotNil(t, response.Players[0].AverageParse)
			assert.Equal(t, test.wantAverage, response.Players[0].AverageParse.DisplayScore)
		}
	})

	t.Run("ScoresKnownPersistedEncounterAfterUnknownSpecEncounter", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)
		baseTime := time.Now().Add(-time.Hour)
		for _, ranking := range []struct {
			encounterName string
			playerSpec    string
		}{
			{encounterName: "Boss1", playerSpec: "Unknown"},
			{encounterName: "Boss2", playerSpec: "Arms"},
		} {
			f.insertTestRanking(t, struct {
				encounterName  string
				playerGUID     string
				playerName     string
				playerClass    string
				playerSpec     string
				dps            float64
				hps            float64
				difficultyName string
				maxPlayers     int16
				killedAt       time.Time
			}{
				encounterName:  ranking.encounterName,
				playerGUID:     "Player-persisted",
				playerName:     "PersistedPlayer",
				playerClass:    "WARRIOR",
				playerSpec:     ranking.playerSpec,
				dps:            1000,
				difficultyName: "Normal",
				maxPlayers:     40,
				killedAt:       baseTime,
			})
		}
		snapshot := f.publishSnapshot(t)
		persistedResult(f, t, uuid.NullUUID{UUID: snapshot.ID, Valid: true}, uuid.Nil, "Boss2", "dps", 91)
		f.insertPersistedParseReceipt(t, uuid.Nil, snapshot.ID, 1)

		guardedStore := &noMembershipCohortStore{Store: f.store}
		response := requestGuardedInstanceParses(
			t,
			guardedStore,
			f.instanceID,
			"?encounter_names=Boss1,Boss2&metric=dps",
		)
		require.True(t, response.Available)
		require.Len(t, response.Players, 1)
		player := response.Players[0]
		assert.Empty(t, player.Status)
		assert.Equal(t, "Arms", player.PlayerSpec)
		require.NotNil(t, player.AverageParse)
		assert.Equal(t, 1, player.AverageParse.Killed)
		assert.Equal(t, 2, player.AverageParse.Selected)
		bosses := make(map[string]chroniclesdk.InstanceParseBoss, len(player.Bosses))
		for _, boss := range player.Bosses {
			bosses[boss.EncounterName] = boss
		}
		assert.Equal(t, "unknown_spec", bosses["Boss1"].Status)
		assert.Equal(t, 91, bosses["Boss2"].DisplayScore)
		assert.Zero(t, guardedStore.queries, "persisted parses must not query memberships")
	})

	t.Run("MissingReceiptServesOrphanedPersistedResults", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)
		f.insertSimpleRanking(t, "Ragnaros", "Player-persisted", 1000, 0)
		f.setPlayerSubSpec(t, "Player-persisted", "Bear")
		snapshot := f.publishSnapshot(t)
		persistedResult(f, t, uuid.NullUUID{UUID: snapshot.ID, Valid: true}, uuid.Nil, "Ragnaros", "dps", 99)

		guardedStore := &noMembershipCohortStore{Store: f.store}
		svc := servicerankings.NewTestableParsesService(guardedStore, slog.Default())
		router := chi.NewRouter()
		router.Get("/instances/{instanceID}/parses", svc.HandleInstanceParses)
		req := httptest.NewRequest("GET", "/instances/"+f.instanceID.String()+"/parses?encounter_names=Ragnaros&metric=dps", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		require.Equal(t, http.StatusOK, w.Code)
		var response chroniclesdk.InstanceParsesResponse
		require.NoError(t, json.NewDecoder(w.Body).Decode(&response))
		require.Len(t, response.Players, 1)
		require.Len(t, response.Players[0].Bosses, 1)
		assert.Equal(t, "Bear", response.Players[0].PlayerSubSpec)
		assert.Equal(t, 99, response.Players[0].Bosses[0].DisplayScore)
		assert.Equal(t, string(parsepolicy.StatusOK), response.Players[0].Bosses[0].Status)
		assert.Zero(t, guardedStore.queries, "orphaned persisted results must not query memberships")
	})

	t.Run("ReceiptWithNoRowsDoesNotRecalculate", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)
		f.insertSimpleRanking(t, "Ragnaros", "Player-persisted", 1000, 0)
		snapshot := f.publishSnapshot(t)
		f.insertPersistedParseReceipt(t, uuid.Nil, snapshot.ID, 1)

		guardedStore := &noMembershipCohortStore{Store: f.store}
		response := requestGuardedInstanceParses(t, guardedStore, f.instanceID, "?encounter_names=Ragnaros&metric=dps")
		assert.False(t, response.Available)
		assert.Equal(t, "persisted_results_incomplete", response.Reason)
		assert.Empty(t, response.Players)
		assert.Zero(t, guardedStore.queries, "authoritative receipts must not query memberships")
	})

	t.Run("ReceiptWithIncompleteRowsDoesNotRecalculate", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)
		f.insertSimpleRanking(t, "Ragnaros", "Player-persisted", 1000, 0)
		f.insertSimpleRanking(t, "Golemagg", "Player-persisted", 900, 0)
		snapshot := f.publishSnapshot(t)
		snapshotID := uuid.NullUUID{UUID: snapshot.ID, Valid: true}
		persistedResult(f, t, snapshotID, uuid.Nil, "Ragnaros", "dps", 90)
		f.insertPersistedParseReceipt(t, uuid.Nil, snapshot.ID, 2)

		guardedStore := &noMembershipCohortStore{Store: f.store}
		response := requestGuardedInstanceParses(t, guardedStore, f.instanceID, "?encounter_names=Ragnaros,Golemagg&metric=dps")
		assert.False(t, response.Available)
		assert.Equal(t, "persisted_results_incomplete", response.Reason)
		assert.Empty(t, response.Players)
		assert.Zero(t, guardedStore.queries, "authoritative receipts must not query memberships")
	})

	t.Run("CurrentTimeframeIgnoresPersistedProjection", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)
		f.insertSimpleRanking(t, "Ragnaros", "Player-persisted", 1000, 0)
		snapshot := f.publishSnapshot(t)
		persistedResult(f, t, uuid.NullUUID{UUID: snapshot.ID, Valid: true}, uuid.Nil, "Ragnaros", "dps", 99)
		f.insertPersistedParseReceipt(t, uuid.Nil, snapshot.ID, 1)

		response := requestInstanceParses(t, f.store, f.instanceID, "?encounter_names=Ragnaros&metric=dps&timeframe=current")
		require.Len(t, response.Players, 1)
		assert.Equal(t, string(parsepolicy.StatusSampleTooSmall), response.Players[0].Bosses[0].Status)
	})

	t.Run("NonDefaultPeriodIgnoresPersistedProjection", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)
		f.insertSimpleRanking(t, "Ragnaros", "Player-persisted", 1000, 0)
		defaultSnapshot := f.publishSnapshot(t)
		persistedResult(f, t, uuid.NullUUID{UUID: defaultSnapshot.ID, Valid: true}, uuid.Nil, "Ragnaros", "dps", 99)
		f.insertPersistedParseReceipt(t, uuid.Nil, defaultSnapshot.ID, 1)

		response := requestInstanceParses(t, f.store, f.instanceID, "?encounter_names=Ragnaros&metric=dps&period=30d")
		require.Len(t, response.Players, 1)
		assert.Equal(t, string(parsepolicy.StatusSampleTooSmall), response.Players[0].Bosses[0].Status)
	})

	t.Run("OtherTenantAndNullSnapshotRowsAreNotEligible", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)
		f.insertSimpleRanking(t, "Ragnaros", "Player-persisted", 1000, 0)
		snapshot := f.publishSnapshot(t)
		otherTenantID := uuid.New()

		persistedResult(f, t, uuid.NullUUID{UUID: snapshot.ID, Valid: true}, otherTenantID, "Ragnaros", "dps", 98)
		f.insertPersistedParseReceipt(t, otherTenantID, snapshot.ID, 1)
		persistedResult(f, t, uuid.NullUUID{}, uuid.Nil, "Ragnaros", "dps", 97)
		persistedResult(f, t, uuid.NullUUID{UUID: snapshot.ID, Valid: true}, uuid.Nil, "Ragnaros", "dps", 96)
		f.insertPersistedParseReceipt(t, uuid.Nil, snapshot.ID, 1)

		// Only the same-tenant, snapshot-linked row (96) may be served — not
		// the other tenant's 98 or the snapshotless 97.
		response := requestInstanceParses(t, f.store, f.instanceID, "?encounter_names=Ragnaros&metric=dps")
		require.Len(t, response.Players, 1)
		assert.Equal(t, 96, response.Players[0].Bosses[0].DisplayScore)
		assert.Equal(t, string(parsepolicy.StatusOK), response.Players[0].Bosses[0].Status)
	})
}

func TestHandleInstanceParses(t *testing.T) {
	t.Parallel()

	t.Run("NoSnapshot", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)

		svc := newTestService(t, f.store)
		r := chi.NewRouter()
		r.Get("/instances/{instanceID}/parses", svc.HandleInstanceParses)

		req := httptest.NewRequest("GET", "/instances/"+f.instanceID.String()+"/parses", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		var resp chroniclesdk.InstanceParsesResponse
		require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))
		assert.True(t, resp.Available)
		assert.Empty(t, resp.Players)
	})

	t.Run("DPSScoring", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)

		baseTime := time.Now().Add(-time.Hour)
		// Insert 6 players on Ragnaros (above MinSampleForParse=5).
		for i, dps := range []float64{100, 200, 300, 400, 500, 600} {
			f.insertTestRanking(t, struct {
				encounterName  string
				playerGUID     string
				playerName     string
				playerClass    string
				playerSpec     string
				dps            float64
				hps            float64
				difficultyName string
				maxPlayers     int16
				killedAt       time.Time
			}{
				encounterName:  "Ragnaros",
				playerGUID:     fmt.Sprintf("0x%016x", i+1),
				playerName:     "Player" + padInt(i+1, 1),
				playerClass:    "WARRIOR",
				playerSpec:     "Arms",
				dps:            dps,
				hps:            0,
				difficultyName: "Normal",
				maxPlayers:     40,
				killedAt:       baseTime.Add(time.Duration(i) * time.Minute),
			})
		}

		f.publishSnapshot(t)

		svc := newTestService(t, f.store)
		r := chi.NewRouter()
		r.Get("/instances/{instanceID}/parses", svc.HandleInstanceParses)

		req := httptest.NewRequest("GET", "/instances/"+f.instanceID.String()+"/parses?encounter_names=Ragnaros&metric=dps", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		body, _ := io.ReadAll(w.Body)
		var resp chroniclesdk.InstanceParsesResponse
		require.NoError(t, json.Unmarshal(body, &resp))

		assert.True(t, resp.Available)
		assert.Equal(t, "dps", resp.Metric)
		assert.Equal(t, []string{"Ragnaros"}, resp.SelectedEncounters)
		assert.Len(t, resp.Players, 6)

		// The player with the highest DPS (600) should score 100.
		var topPlayer *chroniclesdk.InstanceParsePlayer
		for i := range resp.Players {
			if resp.Players[i].PlayerName == "Player6" {
				topPlayer = &resp.Players[i]
				break
			}
		}
		require.NotNil(t, topPlayer, "expected to find Player6")
		require.Len(t, topPlayer.Bosses, 1)
		assert.Equal(t, 100, topPlayer.Bosses[0].DisplayScore)
		assert.Equal(t, "low_confidence", topPlayer.Bosses[0].Status) // 6 < 20
		assert.Equal(t, 6, topPlayer.Bosses[0].SampleSize)
	})

	t.Run("HPSScoring", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)

		baseTime := time.Now().Add(-time.Hour)
		for i, hps := range []float64{50, 100, 150, 200, 250} {
			f.insertTestRanking(t, struct {
				encounterName  string
				playerGUID     string
				playerName     string
				playerClass    string
				playerSpec     string
				dps            float64
				hps            float64
				difficultyName string
				maxPlayers     int16
				killedAt       time.Time
			}{
				encounterName:  "Ragnaros",
				playerGUID:     fmt.Sprintf("0x%016x", i+1),
				playerName:     "Healer" + padInt(i+1, 1),
				playerClass:    "PRIEST",
				playerSpec:     "Holy",
				dps:            10,
				hps:            hps,
				difficultyName: "Normal",
				maxPlayers:     40,
				killedAt:       baseTime.Add(time.Duration(i) * time.Minute),
			})
		}

		f.publishSnapshot(t)

		svc := newTestService(t, f.store)
		r := chi.NewRouter()
		r.Get("/instances/{instanceID}/parses", svc.HandleInstanceParses)

		req := httptest.NewRequest("GET", "/instances/"+f.instanceID.String()+"/parses?encounter_names=Ragnaros&metric=hps", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		var resp chroniclesdk.InstanceParsesResponse
		require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))

		assert.True(t, resp.Available)
		assert.Equal(t, "hps", resp.Metric)
		assert.Len(t, resp.Players, 5)

		// Top HPS (250) should be 100.
		var topHealer *chroniclesdk.InstanceParsePlayer
		for i := range resp.Players {
			if resp.Players[i].PlayerName == "Healer5" {
				topHealer = &resp.Players[i]
				break
			}
		}
		require.NotNil(t, topHealer)
		require.Len(t, topHealer.Bosses, 1)
		assert.Equal(t, 100, topHealer.Bosses[0].DisplayScore)
	})

	t.Run("AverageParseMultipleBosses", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)

		baseTime := time.Now().Add(-time.Hour)

		// Insert 6 players on Boss1 and Boss2.
		for i, dps := range []float64{100, 200, 300, 400, 500, 600} {
			pguid := fmt.Sprintf("0x%016x", i+1)
			name := "Player" + padInt(i+1, 1)
			for _, boss := range []string{"Boss1", "Boss2"} {
				f.insertTestRanking(t, struct {
					encounterName  string
					playerGUID     string
					playerName     string
					playerClass    string
					playerSpec     string
					dps            float64
					hps            float64
					difficultyName string
					maxPlayers     int16
					killedAt       time.Time
				}{
					encounterName:  boss,
					playerGUID:     pguid,
					playerName:     name,
					playerClass:    "WARRIOR",
					playerSpec:     "Arms",
					dps:            dps,
					hps:            0,
					difficultyName: "Normal",
					maxPlayers:     40,
					killedAt:       baseTime.Add(time.Duration(i) * time.Minute),
				})
			}
		}

		f.publishSnapshot(t)

		svc := newTestService(t, f.store)
		r := chi.NewRouter()
		r.Get("/instances/{instanceID}/parses", svc.HandleInstanceParses)

		req := httptest.NewRequest("GET", "/instances/"+f.instanceID.String()+"/parses?encounter_names=Boss1,Boss2&metric=dps", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		var resp chroniclesdk.InstanceParsesResponse
		require.NoError(t, json.Unmarshal(readAll(t, w.Body), &resp))

		assert.True(t, resp.Available)
		assert.Len(t, resp.Players, 6)

		// Each player should have 2 bosses and an average parse.
		for _, p := range resp.Players {
			assert.Len(t, p.Bosses, 2, "player %s should have 2 bosses", p.PlayerName)
			require.NotNil(t, p.AverageParse, "player %s should have average parse", p.PlayerName)
			assert.Equal(t, 2, p.AverageParse.Killed)
			assert.Equal(t, 2, p.AverageParse.Selected)
		}
	})

	t.Run("ScoresKnownEncounterAfterUnknownSpecEncounter", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)

		baseTime := time.Now().Add(-time.Hour)
		for i, dps := range []float64{100, 200, 300, 400, 500, 600} {
			playerGUID := fmt.Sprintf("0x%016x", i+1)
			playerName := "Player" + padInt(i+1, 1)
			for _, boss := range []string{"Boss1", "Boss2"} {
				playerSpec := "Arms"
				if i == 5 && boss == "Boss1" {
					playerSpec = "Unknown"
				}
				f.insertTestRanking(t, struct {
					encounterName  string
					playerGUID     string
					playerName     string
					playerClass    string
					playerSpec     string
					dps            float64
					hps            float64
					difficultyName string
					maxPlayers     int16
					killedAt       time.Time
				}{
					encounterName:  boss,
					playerGUID:     playerGUID,
					playerName:     playerName,
					playerClass:    "WARRIOR",
					playerSpec:     playerSpec,
					dps:            dps,
					hps:            0,
					difficultyName: "Normal",
					maxPlayers:     40,
					killedAt:       baseTime.Add(time.Duration(i) * time.Minute),
				})
			}
		}

		f.publishSnapshot(t)

		svc := newTestService(t, f.store)
		r := chi.NewRouter()
		r.Get("/instances/{instanceID}/parses", svc.HandleInstanceParses)

		req := httptest.NewRequest("GET", "/instances/"+f.instanceID.String()+"/parses?encounter_names=Boss1,Boss2&metric=dps", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		var resp chroniclesdk.InstanceParsesResponse
		require.NoError(t, json.Unmarshal(readAll(t, w.Body), &resp))

		var player *chroniclesdk.InstanceParsePlayer
		for i := range resp.Players {
			if resp.Players[i].PlayerName == "Player6" {
				player = &resp.Players[i]
				break
			}
		}
		require.NotNil(t, player)
		assert.Empty(t, player.Status)
		assert.Equal(t, "Arms", player.PlayerSpec)
		require.NotNil(t, player.AverageParse)
		assert.Equal(t, 1, player.AverageParse.Killed)
		assert.Equal(t, 2, player.AverageParse.Selected)
		bosses := make(map[string]chroniclesdk.InstanceParseBoss, len(player.Bosses))
		for _, boss := range player.Bosses {
			bosses[boss.EncounterName] = boss
		}
		assert.Equal(t, "unknown_spec", bosses["Boss1"].Status)
		assert.Equal(t, 100, bosses["Boss2"].DisplayScore)
	})

	t.Run("UnknownSpecInSpecMode", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)

		baseTime := time.Now().Add(-time.Hour)
		// Insert 5 known-spec players + 1 unknown-spec player.
		for i := 0; i < 5; i++ {
			f.insertTestRanking(t, struct {
				encounterName  string
				playerGUID     string
				playerName     string
				playerClass    string
				playerSpec     string
				dps            float64
				hps            float64
				difficultyName string
				maxPlayers     int16
				killedAt       time.Time
			}{
				encounterName:  "Ragnaros",
				playerGUID:     fmt.Sprintf("0x%016x", i+1),
				playerName:     "Known" + padInt(i+1, 1),
				playerClass:    "WARRIOR",
				playerSpec:     "Arms",
				dps:            float64((i + 1) * 100),
				hps:            0,
				difficultyName: "Normal",
				maxPlayers:     40,
				killedAt:       baseTime.Add(time.Duration(i) * time.Minute),
			})
		}
		// Unknown spec player.
		f.insertTestRanking(t, struct {
			encounterName  string
			playerGUID     string
			playerName     string
			playerClass    string
			playerSpec     string
			dps            float64
			hps            float64
			difficultyName string
			maxPlayers     int16
			killedAt       time.Time
		}{
			encounterName:  "Ragnaros",
			playerGUID:     fmt.Sprintf("0x%016x", 6),
			playerName:     "Unknown1",
			playerClass:    "WARRIOR",
			playerSpec:     "unknown",
			dps:            350,
			hps:            0,
			difficultyName: "Normal",
			maxPlayers:     40,
			killedAt:       baseTime.Add(5 * time.Minute),
		})

		f.publishSnapshot(t)

		svc := newTestService(t, f.store)
		r := chi.NewRouter()
		r.Get("/instances/{instanceID}/parses", svc.HandleInstanceParses)

		req := httptest.NewRequest("GET", "/instances/"+f.instanceID.String()+"/parses?encounter_names=Ragnaros&metric=dps", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		var resp chroniclesdk.InstanceParsesResponse
		require.NoError(t, json.Unmarshal(readAll(t, w.Body), &resp))

		assert.True(t, resp.Available)
		assert.Equal(t, "spec", resp.CohortMode)

		var unknownPlayer *chroniclesdk.InstanceParsePlayer
		for i := range resp.Players {
			if resp.Players[i].PlayerName == "Unknown1" {
				unknownPlayer = &resp.Players[i]
				break
			}
		}
		require.NotNil(t, unknownPlayer)
		assert.Equal(t, "unknown_spec", unknownPlayer.Status)
	})

	t.Run("SmallCohort", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)

		baseTime := time.Now().Add(-time.Hour)
		// Insert only 3 players (below MinSampleForParse=5).
		for i, dps := range []float64{100, 200, 300} {
			f.insertTestRanking(t, struct {
				encounterName  string
				playerGUID     string
				playerName     string
				playerClass    string
				playerSpec     string
				dps            float64
				hps            float64
				difficultyName string
				maxPlayers     int16
				killedAt       time.Time
			}{
				encounterName:  "Ragnaros",
				playerGUID:     fmt.Sprintf("0x%016x", i+1),
				playerName:     "Player" + padInt(i+1, 1),
				playerClass:    "WARRIOR",
				playerSpec:     "Arms",
				dps:            dps,
				hps:            0,
				difficultyName: "Normal",
				maxPlayers:     40,
				killedAt:       baseTime.Add(time.Duration(i) * time.Minute),
			})
		}

		f.publishSnapshot(t)

		svc := newTestService(t, f.store)
		r := chi.NewRouter()
		r.Get("/instances/{instanceID}/parses", svc.HandleInstanceParses)

		req := httptest.NewRequest("GET", "/instances/"+f.instanceID.String()+"/parses?encounter_names=Ragnaros&metric=dps", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		var resp chroniclesdk.InstanceParsesResponse
		require.NoError(t, json.Unmarshal(readAll(t, w.Body), &resp))

		assert.True(t, resp.Available)
		// All players should have sample_too_small status.
		for _, p := range resp.Players {
			for _, b := range p.Bosses {
				assert.Equal(t, "sample_too_small", b.Status, "player %s boss should be sample_too_small", p.PlayerName)
			}
		}
	})

	t.Run("CurrentTimeframe", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)

		baseTime := time.Now().Add(-time.Hour)
		for i, dps := range []float64{100, 200, 300, 400, 500} {
			f.insertTestRanking(t, struct {
				encounterName  string
				playerGUID     string
				playerName     string
				playerClass    string
				playerSpec     string
				dps            float64
				hps            float64
				difficultyName string
				maxPlayers     int16
				killedAt       time.Time
			}{
				encounterName:  "Ragnaros",
				playerGUID:     fmt.Sprintf("0x%016x", i+1),
				playerName:     "Player" + padInt(i+1, 1),
				playerClass:    "WARRIOR",
				playerSpec:     "Arms",
				dps:            dps,
				hps:            0,
				difficultyName: "Normal",
				maxPlayers:     40,
				killedAt:       baseTime.Add(time.Duration(i) * time.Minute),
			})
		}

		f.publishSnapshot(t)

		svc := newTestService(t, f.store)
		r := chi.NewRouter()
		r.Get("/instances/{instanceID}/parses", svc.HandleInstanceParses)

		req := httptest.NewRequest("GET", "/instances/"+f.instanceID.String()+"/parses?encounter_names=Ragnaros&metric=dps&timeframe=current", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		var resp chroniclesdk.InstanceParsesResponse
		require.NoError(t, json.Unmarshal(readAll(t, w.Body), &resp))

		assert.True(t, resp.Available)
		assert.Len(t, resp.Players, 5)
	})
}

func padInt(n, width int) string {
	s := ""
	for i := 0; i < width; i++ {
		s += "0"
	}
	ns := s + string(rune('0'+n%10))
	if n >= 10 {
		ns = s[:len(s)-2] + string(rune('0'+n/10)) + string(rune('0'+n%10))
	}
	return ns[len(ns)-width:]
}

func readAll(t *testing.T, r io.Reader) []byte {
	t.Helper()
	b, err := io.ReadAll(r)
	require.NoError(t, err)
	return b
}

func TestHandleInstanceParses_DisabledTenant(t *testing.T) {
	t.Parallel()

	f := setupParsesTest(t)
	ctx := testutil.Context(t, testutil.WaitShort)

	// Create a tenant with parse_config.cohort_mode = "disabled".
	tenant, err := f.store.InsertTenant(ctx, database.InsertTenantParams{
		ID:               uuid.New(),
		Name:             "disabled-tenant",
		ParseConfig:      []byte(`{"cohort_mode":"disabled"}`),
		IncludeInAll:     true,
		AvailableFormats: []string{},
	})
	require.NoError(t, err)

	svc := newTestService(t, f.store)
	r := chi.NewRouter()
	r.Get("/instances/{instanceID}/parses", func(w http.ResponseWriter, req *http.Request) {
		// Inject tenant context.
		ctx := servicetenant.WithTenantID(req.Context(), tenant.ID)
		svc.HandleInstanceParses(w, req.WithContext(ctx))
	})

	req := httptest.NewRequest("GET", "/instances/"+f.instanceID.String()+"/parses", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	var resp chroniclesdk.InstanceParsesResponse
	require.NoError(t, json.NewDecoder(w.Body).Decode(&resp))
	assert.False(t, resp.Available, "expected available=false for disabled tenant")
	assert.Equal(t, "disabled", resp.Reason)
	assert.Empty(t, resp.Players)
}
