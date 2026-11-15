package servicestats_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicestats"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// Install production tenant pool hooks once, before parallel tests start.
func TestMain(m *testing.M) {
	database.PrepareConnFunc = servicetenant.PrepareConn
	database.ResetConnFunc = servicetenant.ResetConn
	database.CheckNestedTxFunc = servicetenant.CheckNestedTx
	os.Exit(m.Run())
}

type indexNowRecorder struct {
	mu    sync.Mutex
	pings []map[string]any
}

func (r *indexNowRecorder) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	body, _ := io.ReadAll(req.Body)
	var ping map[string]any
	_ = json.Unmarshal(body, &ping)
	r.mu.Lock()
	r.pings = append(r.pings, ping)
	r.mu.Unlock()
	w.WriteHeader(http.StatusAccepted)
}

func (r *indexNowRecorder) take() []map[string]any {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := r.pings
	r.pings = nil
	return out
}

func TestRefreshTenant(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	connURL := dbtestutil.NewConnectionURL(t)

	// Seed with RLS bypassed.
	seedCfg, err := pgxpool.ParseConfig(connURL)
	require.NoError(t, err)
	seedCfg.ConnConfig.RuntimeParams["app.tenant_bypass"] = "true"
	seed, err := pgxpool.NewWithConfig(ctx, seedCfg)
	require.NoError(t, err)
	t.Cleanup(seed.Close)
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := seed.Exec(ctx, sql, args...)
		require.NoError(t, err, sql)
	}

	user := uuid.New()
	exec("INSERT INTO users (id, username, email) VALUES ($1, $2, $3)", user, "u-"+user.String()[:8], user.String()+"@example.com")
	tenantRealm := func(slug string) (uuid.UUID, uuid.UUID) {
		tenant, server, realm := uuid.New(), uuid.New(), uuid.New()
		exec("INSERT INTO tenants (id, slug, name, include_in_all, discoverable) VALUES ($1, $2, $3, false, true)", tenant, slug, "tenant "+slug)
		exec("INSERT INTO wow_servers (id, name, tenant_id) VALUES ($1, $2, $3)", server, "server "+slug, tenant)
		exec("INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realm, server, slug+"-realm")
		return tenant, realm
	}
	recent := time.Now().Add(-10 * 24 * time.Hour)
	// instances adds n instances in one log group and returns their IDs.
	instances := func(realm uuid.UUID, n int, category string, unlisted bool, dup any) []uuid.UUID {
		lg := uuid.New()
		exec("INSERT INTO wow_log_groups (id, owner, created_at, updated_at, unlisted) VALUES ($1, $2, now(), now(), $3)", lg, user, unlisted)
		exec("INSERT INTO parsed_log_group (id, finalized_at) VALUES ($1, now())", lg)
		ids := make([]uuid.UUID, n)
		for i := range ids {
			ids[i] = uuid.New()
			exec(`INSERT INTO log_instances (id, realm_id, log_group_id, name, start_time, category, duplicate_group_id)
				VALUES ($1, $2, $3, 'Molten Core', $4, $5, $6)`, ids[i], realm, lg, recent, category, dup)
		}
		return ids
	}

	// alpha clears the raid threshold exactly.
	alpha, alphaRealm := tenantRealm("alpha")
	instances(alphaRealm, servicestats.MinTenantRaids, "raid", false, nil)
	// beta has many uploads but one logical raid plus unlisted logs: below.
	beta, betaRealm := tenantRealm("beta")
	instances(betaRealm, 60, "raid", false, uuid.New())
	instances(betaRealm, 30, "raid", true, nil)
	// gamma clears the player threshold with a single dungeon.
	gamma, gammaRealm := tenantRealm("gamma")
	dungeon := instances(gammaRealm, 1, "dungeon", false, nil)[0]
	exec(`INSERT INTO log_instance_players (instance_id, unit_guid, name, level, class, race)
		SELECT $1, format('0x%s', lpad(to_hex(g), 16, '0')), 'P' || g, 60, 'WARRIOR', 'Human'
		FROM generate_series(1, $2::int) g`, dungeon, servicestats.MinTenantPlayers)

	pool, err := database.NewPostgresDB(ctx, testutil.Logger(t), connURL)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	store := database.New(pool)

	in := &indexNowRecorder{}
	indexNowSrv := httptest.NewServer(in)
	t.Cleanup(indexNowSrv.Close)

	now := time.Now().UTC().Truncate(time.Second)
	var probeCalls atomic.Int32
	var probeValue atomic.Int32
	probe := servicestats.Page{
		Path:      "/stats/probe",
		MinSample: 1,
		Producer: fakeProducer{key: "probe", cadence: time.Hour, sample: 5, calls: &probeCalls, payload: func() any {
			return map[string]int32{"value": probeValue.Load()}
		}},
		Render: func(servicestats.Site, servicestats.Snapshot) (servicestats.Content, error) {
			return servicestats.Content{Title: "probe"}, nil
		},
	}
	accessURL, _ := url.Parse("https://chronicleclassic.com")
	svc, err := servicestats.New(servicestats.Options{
		Logger:           testutil.Logger(t),
		Store:            store,
		Pages:            append(servicestats.DefaultPages(store), probe),
		AccessURL:        accessURL,
		PrimaryDomain:    "chronicleclassic.com",
		IndexNowKey:      "test-key-1234",
		IndexNowEndpoint: indexNowSrv.URL,
		Now:              func() time.Time { return now },
	})
	require.NoError(t, err)

	keys := func(tenant uuid.UUID) []string {
		t.Helper()
		meta, err := store.ListStatsSnapshotMeta(servicetenant.WithTenantID(ctx, tenant), tenant)
		require.NoError(t, err)
		var out []string
		for _, m := range meta {
			out = append(out, m.PageKey)
		}
		return out
	}
	alphaCtx := servicetenant.WithTenantID(ctx, alpha)

	// First run computes everything and pings IndexNow with both pages.
	res, err := svc.RefreshTenant(ctx, alpha, false)
	require.NoError(t, err)
	require.True(t, res.Eligible)
	require.ElementsMatch(t, []string{"about", "probe"}, res.Computed)
	require.ElementsMatch(t, []string{"/stats/about", "/stats/probe"}, res.Changed)
	require.Equal(t, []string{"_activity", "about", "probe"}, keys(alpha))
	about, err := store.GetStatsSnapshot(alphaCtx, database.GetStatsSnapshotParams{TenantID: alpha, PageKey: "about"})
	require.NoError(t, err)
	require.JSONEq(t, `{"raids":50,"players":0,"window_days":30}`, string(about.Payload), "only alpha's raids count")
	require.EqualValues(t, 50, about.SampleN)
	pings := in.take()
	require.Len(t, pings, 1)
	require.Equal(t, "alpha.chronicleclassic.com", pings[0]["host"])
	require.Equal(t, "test-key-1234", pings[0]["key"])
	require.Equal(t, "https://alpha.chronicleclassic.com/indexnow.txt", pings[0]["keyLocation"])
	require.ElementsMatch(t, []any{"https://alpha.chronicleclassic.com/stats/about", "https://alpha.chronicleclassic.com/stats/probe"}, pings[0]["urlList"])

	// Nothing is due yet.
	res, err = svc.RefreshTenant(ctx, alpha, false)
	require.NoError(t, err)
	require.Empty(t, res.Computed)
	require.EqualValues(t, 1, probeCalls.Load())

	// Past the probe's cadence only it recomputes; an identical payload is no
	// change and sends no ping.
	now = now.Add(2 * time.Hour)
	res, err = svc.RefreshTenant(ctx, alpha, false)
	require.NoError(t, err)
	require.Equal(t, []string{"probe"}, res.Computed)
	require.Empty(t, res.Changed)
	require.Empty(t, in.take())

	// A changed payload pings for that page only; unregistered pages are pruned.
	probeValue.Store(7)
	exec("INSERT INTO stats_snapshots (tenant_id, page_key, payload, sample_n, computed_at) VALUES ($1, 'retired', '{}', 1, now())", alpha)
	res, err = svc.RefreshTenant(ctx, alpha, true)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{"about", "probe"}, res.Computed)
	require.Equal(t, []string{"/stats/probe"}, res.Changed)
	pings = in.take()
	require.Len(t, pings, 1)
	require.Equal(t, []any{"https://alpha.chronicleclassic.com/stats/probe"}, pings[0]["urlList"])
	require.Equal(t, []string{"_activity", "about", "probe"}, keys(alpha))

	// Below the threshold: no pages, and stale ones are dropped.
	exec("INSERT INTO stats_snapshots (tenant_id, page_key, payload, sample_n, computed_at) VALUES ($1, 'about', '{}', 99, now())", beta)
	res, err = svc.RefreshTenant(ctx, beta, false)
	require.NoError(t, err)
	require.False(t, res.Eligible)
	require.Equal(t, []string{"_activity"}, keys(beta))
	require.Empty(t, in.take())

	// The player threshold qualifies a tenant on its own.
	res, err = svc.RefreshTenant(ctx, gamma, false)
	require.NoError(t, err)
	require.True(t, res.Eligible)

	// End to end through the handler: alpha renders, beta is 404, and a hit
	// runs only the snapshot read.
	h := svc.Handler(func(*http.Request) (servicestats.Site, error) {
		return servicestats.Site{Name: "Alpha", Origin: "https://alpha.chronicleclassic.com", Discoverable: true}, nil
	})
	request := func(tenant uuid.UUID) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/stats/about", nil).WithContext(servicetenant.WithTenantID(context.Background(), tenant))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	ok := request(alpha)
	require.Equal(t, http.StatusOK, ok.Code)
	require.Contains(t, ok.Body.String(), "players uploaded 50 raids")
	require.Equal(t, http.StatusNotFound, request(beta).Code)
}
