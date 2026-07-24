package servicerankings_test

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"fmt"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// parsesTestFixture holds state for instance parses handler tests.
type parsesTestFixture struct {
	pool       *pgxpool.Pool
	store      database.Store
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
	})
	require.NoError(t, err)

	return parsesTestFixture{
		pool:       pool,
		store:      store,
		realmID:    realmID,
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

// publishSnapshot creates and publishes a snapshot for the test fixture.
func (f parsesTestFixture) publishSnapshot(t *testing.T) database.RankingSnapshot {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitShort)

	cutoff := pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true}
	snap, err := f.store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
		TenantID:      uuid.Nil,
		Cutoff:        cutoff,
		LookbackDays:  int32(parsepolicy.DefaultLookbackDays),
		CohortMode:    string(parsepolicy.CohortModeSpec),
		PolicyVersion: int16(parsepolicy.PolicyVersion),
		QueryVersion:  1,
	})
	require.NoError(t, err)

	err = f.store.BatchInsertSnapshotMembersFromRankings(ctx, snap.ID)
	require.NoError(t, err)

	snap, err = f.store.PublishRankingSnapshot(ctx, snap.ID)
	require.NoError(t, err)
	return snap
}

// newTestService creates a minimal Service that can handle instance parses requests.
func newTestService(t *testing.T, store database.Store) *servicerankings.TestableService {
	t.Helper()
	return servicerankings.NewTestableService(store, slog.Default())
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
		assert.False(t, resp.Available)
		assert.Empty(t, resp.Players)
	})

	t.Run("DPSScoring", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
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

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
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

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)

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

	t.Run("UnknownSpecInSpecMode", func(t *testing.T) {
		t.Parallel()
		f := setupParsesTest(t)

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
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

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
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

		baseTime := time.Date(2024, 6, 1, 12, 0, 0, 0, time.UTC)
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

func TestHandleInstanceParses_CanonicalResolution(t *testing.T) {
	t.Parallel()

	t.Run("UsesSnapshotMatchingInstanceStartTime", func(t *testing.T) {
		t.Parallel()
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

		userID := uuid.New()
		_, err = store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "u"})
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

		// Instance with start_time on July 10.
		instanceID := uuid.New()
		instanceStart := time.Date(2024, 7, 10, 14, 30, 0, 0, time.UTC)
		_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
			Name: "Molten Core", Capabilities: []string{},
		})
		require.NoError(t, err)
		// Set start_time directly.
		conn2, err := pool.Acquire(ctx)
		require.NoError(t, err)
		_, err = conn2.Exec(ctx, "UPDATE log_instances SET start_time = $1 WHERE id = $2", instanceStart, instanceID)
		require.NoError(t, err)
		conn2.Release()

		// Insert a ranking for this instance.
		encID := uuid.New()
		_, err = store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID: encID, InstanceID: instanceID, Name: "Ragnaros",
			KillType: database.KillTypeClean, Remaining: guid.GUIDs{}, Boss: true,
			StartTime: database.Timestamptz(instanceStart),
			EndTime:   database.Timestamptz(instanceStart.Add(5 * time.Minute)),
		})
		require.NoError(t, err)

		err = store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
			EncounterID:    uuid.NullUUID{UUID: encID, Valid: true},
			InstanceID:     instanceID,
			EncounterName:  "Ragnaros",
			InstanceName:   "Molten Core",
			PlayerGuid:     "P-1",
			PlayerName:     "Player1",
			PlayerClass:    "WARRIOR",
			PlayerSpec:     "Arms",
			DifficultyName: "Normal",
			MaxPlayers:     40,
			RealmID:        realmID,
			RealmName:      "test-realm",
			DamageDone:     30000,
			DurationSecs:   300,
			Dps:            100,
			KilledAt:       database.Timestamptz(instanceStart.Add(5 * time.Minute)),
			LogHashedSlug:  "slug-test-1",
		})
		require.NoError(t, err)

		// Create two snapshots:
		// July 10 00:00 UTC (cutoff <= instance start → should be used)
		// July 11 00:00 UTC (cutoff > instance start → should NOT be used for historical)
		cutoffDay10 := time.Date(2024, 7, 10, 0, 0, 0, 0, time.UTC)
		cutoffDay11 := time.Date(2024, 7, 11, 0, 0, 0, 0, time.UTC)

		for _, cutoff := range []time.Time{cutoffDay10, cutoffDay11} {
			snap, sErr := store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
				TenantID:      uuid.Nil,
				Cutoff:        pgtype.Timestamptz{Time: cutoff, Valid: true},
				LookbackDays:  int32(parsepolicy.DefaultLookbackDays),
				CohortMode:    string(parsepolicy.CohortModeSpec),
				PolicyVersion: int16(parsepolicy.PolicyVersion),
				QueryVersion:  1,
			})
			require.NoError(t, sErr)

			sErr = store.BatchInsertSnapshotMembersFromRankings(ctx, snap.ID)
			require.NoError(t, sErr)

			_, sErr = store.PublishRankingSnapshot(ctx, snap.ID)
			require.NoError(t, sErr)
		}

		svc := newTestService(t, store)
		r := chi.NewRouter()
		r.Get("/instances/{instanceID}/parses", svc.HandleInstanceParses)

		req := httptest.NewRequest("GET", "/instances/"+instanceID.String()+"/parses?encounter_names=Ragnaros&metric=dps", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		var resp chroniclesdk.InstanceParsesResponse
		require.NoError(t, json.Unmarshal(readAll(t, w.Body), &resp))

		assert.True(t, resp.Available)
		// Should use the July 10 snapshot (cutoff <= instance start).
		assert.Equal(t, cutoffDay10, resp.Cutoff.UTC())
	})

	t.Run("FallsBackToEarliestSnapshotForOldRuns", func(t *testing.T) {
		t.Parallel()
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

		userID := uuid.New()
		_, err = store.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "u"})
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

		// Instance from January 2024 (predates all snapshots).
		instanceID := uuid.New()
		instanceStart := time.Date(2024, 1, 5, 10, 0, 0, 0, time.UTC)
		_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
			ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
			Name: "Molten Core", Capabilities: []string{},
		})
		require.NoError(t, err)
		conn2, err := pool.Acquire(ctx)
		require.NoError(t, err)
		_, err = conn2.Exec(ctx, "UPDATE log_instances SET start_time = $1 WHERE id = $2", instanceStart, instanceID)
		require.NoError(t, err)
		conn2.Release()

		// Insert ranking.
		encID := uuid.New()
		_, err = store.InsertEncounter(ctx, database.InsertEncounterParams{
			ID: encID, InstanceID: instanceID, Name: "Ragnaros",
			KillType: database.KillTypeClean, Remaining: guid.GUIDs{}, Boss: true,
			StartTime: database.Timestamptz(instanceStart),
			EndTime:   database.Timestamptz(instanceStart.Add(5 * time.Minute)),
		})
		require.NoError(t, err)

		err = store.InsertEncounterDpsRanking(ctx, database.InsertEncounterDpsRankingParams{
			EncounterID:    uuid.NullUUID{UUID: encID, Valid: true},
			InstanceID:     instanceID,
			EncounterName:  "Ragnaros",
			InstanceName:   "Molten Core",
			PlayerGuid:     "P-1",
			PlayerName:     "Player1",
			PlayerClass:    "WARRIOR",
			PlayerSpec:     "Arms",
			DifficultyName: "Normal",
			MaxPlayers:     40,
			RealmID:        realmID,
			RealmName:      "test-realm",
			DamageDone:     30000,
			DurationSecs:   300,
			Dps:            100,
			KilledAt:       database.Timestamptz(instanceStart.Add(5 * time.Minute)),
			LogHashedSlug:  "slug-test-2",
		})
		require.NoError(t, err)

		// Snapshots only from July 2024 (after the instance).
		cutoffJuly := time.Date(2024, 7, 10, 0, 0, 0, 0, time.UTC)
		snap, err := store.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
			TenantID:      uuid.Nil,
			Cutoff:        pgtype.Timestamptz{Time: cutoffJuly, Valid: true},
			LookbackDays:  int32(parsepolicy.DefaultLookbackDays),
			CohortMode:    string(parsepolicy.CohortModeSpec),
			PolicyVersion: int16(parsepolicy.PolicyVersion),
			QueryVersion:  1,
		})
		require.NoError(t, err)
		err = store.BatchInsertSnapshotMembersFromRankings(ctx, snap.ID)
		require.NoError(t, err)
		_, err = store.PublishRankingSnapshot(ctx, snap.ID)
		require.NoError(t, err)

		svc := newTestService(t, store)
		r := chi.NewRouter()
		r.Get("/instances/{instanceID}/parses", svc.HandleInstanceParses)

		req := httptest.NewRequest("GET", "/instances/"+instanceID.String()+"/parses?encounter_names=Ragnaros&metric=dps", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		require.Equal(t, http.StatusOK, w.Code)
		var resp chroniclesdk.InstanceParsesResponse
		require.NoError(t, json.Unmarshal(readAll(t, w.Body), &resp))

		// Should fall back to the earliest snapshot even though it comes after the instance.
		assert.True(t, resp.Available)
		assert.Equal(t, cutoffJuly, resp.Cutoff.UTC())
	})
}
