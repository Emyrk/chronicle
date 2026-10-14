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

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
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

// timeParsesTestFixture holds shared state for time-parses handler tests.
type timeParsesTestFixture struct {
	pool       *pgxpool.Pool
	store      database.Store
	realmID    uuid.UUID
	instanceID uuid.UUID
	slug       string
}

func setupTimeParsesTest(t *testing.T) timeParsesTestFixture {
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

	userID := uuid.New()
	_, err = store.InsertUser(ctx, database.InsertUserParams{
		ID: userID, Username: "tp-user",
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
	slug := "xbY27E0ml5fPbU1M"
	_, err = store.InsertInstance(ctx, database.InsertInstanceParams{
		ID: instanceID, RealmID: realmID, LogGroupID: logGroupID,
		Name:         "Molten Core",
		HashedSlug:   pgtype.Text{String: slug, Valid: true},
		Capabilities: []string{},
	})
	require.NoError(t, err)

	return timeParsesTestFixture{
		pool:       pool,
		store:      store,
		realmID:    realmID,
		instanceID: instanceID,
		slug:       slug,
	}
}

// callTimeParses invokes the handler via a chi router with the given path param
// and returns the HTTP response and decoded body.
func callTimeParses(t *testing.T, store database.Store, pathParam string) (*http.Response, chroniclesdk.InstanceTimeParsesResponse) {
	t.Helper()
	return callTimeParsesWithContext(t, context.Background(), store, pathParam, "")
}

func callTimeParsesWithContext(t *testing.T, ctx context.Context, store database.Store, pathParam, rawQuery string) (*http.Response, chroniclesdk.InstanceTimeParsesResponse) {
	t.Helper()
	svc := servicerankings.NewTestableService(store, slog.Default())

	r := chi.NewRouter()
	r.Get("/instances/{instanceID}/time-parses", svc.HandleInstanceTimeParses)

	req := httptest.NewRequest("GET", "/instances/"+pathParam+"/time-parses"+rawQuery, nil).WithContext(ctx)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	resp := rec.Result()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	_ = resp.Body.Close()

	var parsed chroniclesdk.InstanceTimeParsesResponse
	if resp.StatusCode == http.StatusOK {
		require.NoError(t, json.Unmarshal(body, &parsed))
	}
	return resp, parsed
}

func TestHandleInstanceTimeParsesStrictTenantCohort(t *testing.T) {
	t.Parallel()

	pool, store, rootRealm := setupTimeParseTest(t)
	ctx := testutil.Context(t, testutil.WaitMedium)
	tenantA, realmA := insertTimeParseTenantRealm(t, pool, "instance-parse-tenant-a")
	_, realmB := insertTimeParseTenantRealm(t, pool, "instance-parse-tenant-b")
	start := time.Date(2024, 7, 1, 12, 0, 0, 0, time.UTC)

	insertRun := func(realmID uuid.UUID, duration time.Duration) uuid.UUID {
		return insertTimeParseInstance(t, pool, store, realmID, timeParseInstanceOpts{
			instanceName: "Molten Core", difficultyName: "Normal", maxPlayers: 40,
			qualified: true, durationMs: duration.Milliseconds(), startTime: start,
			encounters: []timeParseEncounterOpts{{
				name: "Ragnaros", killType: database.KillTypeClean, boss: true,
				startTime: start.Add(5 * time.Minute), endTime: start.Add(6 * time.Minute),
			}},
		})
	}
	instanceA := insertRun(realmA, 60*time.Minute)
	insertRun(realmB, 90*time.Minute)
	insertRun(rootRealm, 120*time.Minute)
	runTimeParseWorker(t, ctx, store, tenantA, start.Add(24*time.Hour), 0)

	resp, body := callTimeParsesWithContext(t, servicetenant.WithTenantID(ctx, tenantA), store,
		instanceA.String(), "?timeframe=current&period=all")
	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.True(t, body.Available)
	require.NotNil(t, body.ClearTime)
	assert.Equal(t, 1, body.ClearTime.SampleSize)
	require.Len(t, body.BossKillTimes, 1)
	assert.Equal(t, 1, body.BossKillTimes[0].SampleSize)
}

func TestHandleInstanceTimeParses_UUIDPath(t *testing.T) {
	t.Parallel()
	f := setupTimeParsesTest(t)

	resp, body := callTimeParses(t, f.store, f.instanceID.String())
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	// No snapshot exists, so the handler should return available=false, reason=no_snapshot.
	assert.False(t, body.Available)
	assert.Equal(t, "no_snapshot", body.Reason)
}

func TestHandleInstanceTimeParses_SlugPath(t *testing.T) {
	t.Parallel()
	f := setupTimeParsesTest(t)

	resp, body := callTimeParses(t, f.store, f.slug)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	// Same behaviour as UUID path: no snapshot → available=false.
	assert.False(t, body.Available)
	assert.Equal(t, "no_snapshot", body.Reason)
}

func TestHandleInstanceTimeParses_InvalidSlug(t *testing.T) {
	t.Parallel()
	f := setupTimeParsesTest(t)

	resp, _ := callTimeParses(t, f.store, "nonexistent-slug")
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}

func TestHandleInstanceTimeParses_MissingUUID(t *testing.T) {
	t.Parallel()
	f := setupTimeParsesTest(t)

	// Valid UUID format but no matching instance.
	resp, _ := callTimeParses(t, f.store, uuid.New().String())
	// The handler falls through to GetLogInstanceStartTime which returns pgx.ErrNoRows → 404.
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
}
