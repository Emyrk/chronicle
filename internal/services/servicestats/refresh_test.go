package servicestats_test

import (
	"context"
	"encoding/json"
	"errors"
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
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
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

// recordingQueue records inserted River jobs.
type recordingQueue struct {
	mu   sync.Mutex
	jobs []river.JobArgs
}

func (q *recordingQueue) Insert(_ context.Context, args river.JobArgs, _ *river.InsertOpts) (*rivertype.JobInsertResult, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.jobs = append(q.jobs, args)
	return &rivertype.JobInsertResult{Job: &rivertype.JobRow{}}, nil
}

func (q *recordingQueue) take() []river.JobArgs {
	q.mu.Lock()
	defer q.mu.Unlock()
	out := q.jobs
	q.jobs = nil
	return out
}

// funcProducer is a configurable producer for the refresh tests.
type funcProducer struct {
	key     string
	cadence time.Duration
	timeout time.Duration
	compute func(ctx context.Context, tenant servicestats.Tenant) ([]servicestats.Output, error)
}

func (p funcProducer) Key() string { return p.key }
func (p funcProducer) Cadence() time.Duration {
	if p.cadence == 0 {
		return time.Hour
	}
	return p.cadence
}
func (p funcProducer) Timeout() time.Duration { return p.timeout }
func (p funcProducer) Compute(ctx context.Context, tenant servicestats.Tenant) ([]servicestats.Output, error) {
	return p.compute(ctx, tenant)
}

func titleRender(servicestats.Site, servicestats.Page, servicestats.Snapshot) (servicestats.Content, error) {
	return servicestats.Content{Title: "probe"}, nil
}

func TestRefresh(t *testing.T) {
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
	tenantRealm := func(slug string, discoverable bool) (uuid.UUID, uuid.UUID) {
		tenant, server, realm := uuid.New(), uuid.New(), uuid.New()
		exec("INSERT INTO tenants (id, slug, name, include_in_all, discoverable, additional_flavor) VALUES ($1, $2, $3, false, $4, '{turtle}')", tenant, slug, "tenant "+slug, discoverable)
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
	alpha, alphaRealm := tenantRealm("alpha", true)
	instances(alphaRealm, servicestats.MinTenantRaids, "raid", false, nil)
	// beta: 45 raids, plus duplicates and unlisted logs that don't count.
	// Below the entry threshold, above the keep threshold.
	beta, betaRealm := tenantRealm("beta", true)
	instances(betaRealm, 44, "raid", false, nil)
	instances(betaRealm, 20, "raid", false, uuid.New())
	instances(betaRealm, 30, "raid", true, nil)
	// gamma clears the player threshold with a single dungeon.
	gamma, gammaRealm := tenantRealm("gamma", true)
	dungeon := instances(gammaRealm, 1, "dungeon", false, nil)[0]
	exec(`INSERT INTO log_instance_players (instance_id, unit_guid, name, level, class, race)
		SELECT $1, format('0x%s', lpad(to_hex(g), 16, '0')), 'P' || g, 60, 'WARRIOR', 'Human'
		FROM generate_series(1, $2::int) g`, dungeon, servicestats.MinTenantPlayers)
	// hidden is active but not discoverable.
	hidden, hiddenRealm := tenantRealm("hidden", false)
	instances(hiddenRealm, servicestats.MinTenantRaids, "raid", false, nil)

	pool, err := database.NewPostgresDB(ctx, testutil.Logger(t), connURL)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	store := database.New(pool)

	in := &indexNowRecorder{}
	indexNowSrv := httptest.NewServer(in)
	t.Cleanup(indexNowSrv.Close)

	// probe emits one page per configured name.
	var probeNames atomic.Pointer[[]string]
	probeNames.Store(&[]string{"a", "b"})
	var probeValue atomic.Int32
	var probeTenant atomic.Pointer[servicestats.Tenant]
	probe := servicestats.Family{
		Pattern: "/stats/probe/{name}",
		Producer: funcProducer{key: "probe", compute: func(_ context.Context, tenant servicestats.Tenant) ([]servicestats.Output, error) {
			probeTenant.Store(&tenant)
			var out []servicestats.Output
			for _, name := range *probeNames.Load() {
				out = append(out, servicestats.Output{Key: servicestats.PageKey("probe", name), Payload: map[string]int32{"value": probeValue.Load()}, SampleN: 5, MinSample: 1})
			}
			return out, nil
		}},
		Render: titleRender,
	}
	// slow ignores its context and never returns in time.
	slow := servicestats.Family{
		Pattern: "/stats/slow",
		Producer: funcProducer{key: "slow", timeout: 50 * time.Millisecond, compute: func(context.Context, servicestats.Tenant) ([]servicestats.Output, error) {
			time.Sleep(10 * time.Second)
			return nil, nil
		}},
		Render: titleRender,
	}
	failing := servicestats.Family{
		Pattern: "/stats/failing",
		Producer: funcProducer{key: "failing", compute: func(context.Context, servicestats.Tenant) ([]servicestats.Output, error) {
			return nil, errors.New("boom")
		}},
		Render: titleRender,
	}

	now := time.Now().UTC().Truncate(time.Second)
	accessURL, _ := url.Parse("https://chronicleclassic.com")
	svc, err := servicestats.New(servicestats.Options{
		Logger:           testutil.Logger(t),
		Store:            store,
		Families:         append(servicestats.DefaultFamilies(), probe, slow, failing),
		AccessURL:        accessURL,
		PrimaryDomain:    "chronicleclassic.com",
		IndexNowKey:      "test-key-1234",
		IndexNowEndpoint: indexNowSrv.URL,
		Now:              func() time.Time { return now },
	})
	require.NoError(t, err)

	type meta struct {
		changedAt, computedAt time.Time
	}
	rows := func(tenant uuid.UUID) map[string]meta {
		t.Helper()
		list, err := store.ListStatsSnapshotMeta(servicetenant.WithTenantID(ctx, tenant), tenant)
		require.NoError(t, err)
		out := map[string]meta{}
		for _, m := range list {
			out[m.PageKey] = meta{changedAt: m.PayloadChangedAt.Time, computedAt: m.ComputedAt.Time}
		}
		return out
	}
	keys := func(tenant uuid.UUID) []string {
		var out []string
		for k := range rows(tenant) {
			out = append(out, k)
		}
		return out
	}
	queue := &recordingQueue{}
	producers := func() []string {
		var out []string
		for _, job := range queue.take() {
			out = append(out, job.(servicestats.ArgsProducer).Key)
		}
		return out
	}

	// The dispatch skips sites that are not discoverable and drops their
	// pages (keeping the activity row), so a site made discoverable again
	// never serves stale pages.
	exec(`INSERT INTO stats_snapshots (tenant_id, page_key, producer_key, payload, sample_n, min_sample, computed_at, payload_changed_at)
		VALUES ($1, 'about', 'about', '{}', 99, 1, now(), now()), ($1, '_activity', '_activity', '{"eligible":false}', 99, 1, now(), now())`, hidden)
	require.NoError(t, (&servicestats.DispatchWorker{Service: svc, Queue: queue}).Work(ctx, nil))
	dispatched := map[uuid.UUID]bool{}
	for _, job := range queue.take() {
		dispatched[job.(servicestats.ArgsTenant).TenantID] = true
	}
	require.True(t, dispatched[alpha])
	require.False(t, dispatched[hidden], "non-discoverable tenants get no jobs")
	require.Equal(t, []string{"_activity"}, keys(hidden), "a hidden site's pages are dropped")

	// The tenant job checks the threshold and queues every due family. The
	// raid count alone qualifies alpha, so players are not counted.
	tr, err := svc.RefreshTenant(ctx, queue, alpha, false)
	require.NoError(t, err)
	require.True(t, tr.Eligible)
	require.EqualValues(t, servicestats.MinTenantRaids, tr.Activity.Raids, "only alpha's raids count")
	require.Nil(t, tr.Activity.Players)
	require.ElementsMatch(t, []string{"about", "probe", "slow", "failing"}, producers())

	// Each family runs on its own: a timeout and an error don't stop the rest.
	start := time.Now()
	_, err = svc.RefreshProducer(ctx, alpha, "slow", time.Time{})
	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.Less(t, time.Since(start), 5*time.Second, "the timeout returns even though the producer ignores it")
	_, err = svc.RefreshProducer(ctx, alpha, "failing", time.Time{})
	require.ErrorContains(t, err, "boom")
	pr, err := svc.RefreshProducer(ctx, alpha, "probe", time.Time{})
	require.NoError(t, err)
	require.Equal(t, 2, pr.Pages)
	require.ElementsMatch(t, []string{"/stats/probe/a", "/stats/probe/b"}, pr.Changed)
	_, err = svc.RefreshProducer(ctx, alpha, "about", time.Time{})
	require.NoError(t, err)
	require.ElementsMatch(t, []string{"_activity", "about", "_ran:about", "probe/a", "probe/b", "_ran:probe"}, keys(alpha))

	got := probeTenant.Load()
	require.NotNil(t, got.Row)
	require.Equal(t, "alpha", got.Row.Slug.String)
	require.True(t, got.Activity.Eligible)
	require.NotEmpty(t, got.Flavor)

	about, err := store.GetStatsSnapshot(servicetenant.WithTenantID(ctx, alpha), database.GetStatsSnapshotParams{TenantID: alpha, PageKey: "about"})
	require.NoError(t, err)
	require.JSONEq(t, `{"raids":50,"window_days":180}`, string(about.Payload), "the placeholder reuses the threshold count")

	pings := in.take()
	require.Len(t, pings, 2) // probe, about
	var urls []any
	for _, p := range pings {
		require.Equal(t, "alpha.chronicleclassic.com", p["host"])
		require.Equal(t, "https://alpha.chronicleclassic.com/indexnow.txt", p["keyLocation"])
		urls = append(urls, p["urlList"].([]any)...)
	}
	require.ElementsMatch(t, []any{"https://alpha.chronicleclassic.com/stats/probe/a", "https://alpha.chronicleclassic.com/stats/probe/b", "https://alpha.chronicleclassic.com/stats/about"}, urls)

	// Families that ran are not due again; the failed ones are retried.
	_, err = svc.RefreshTenant(ctx, queue, alpha, false)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{"slow", "failing"}, producers())

	// Recomputing an unchanged payload moves computed_at but not
	// payload_changed_at, and sends no ping.
	first := rows(alpha)["probe/a"]
	now = now.Add(2 * time.Hour)
	pr, err = svc.RefreshProducer(ctx, alpha, "probe", time.Time{})
	require.NoError(t, err)
	require.Empty(t, pr.Changed)
	require.Empty(t, in.take())
	second := rows(alpha)["probe/a"]
	require.True(t, second.computedAt.After(first.computedAt))
	require.True(t, second.changedAt.Equal(first.changedAt), "lastmod stays put while the data does")

	// A changed payload moves payload_changed_at; pages a family stops
	// emitting are pruned, and only that family's.
	probeValue.Store(7)
	probeNames.Store(&[]string{"a"})
	now = now.Add(time.Hour)
	pr, err = svc.RefreshProducer(ctx, alpha, "probe", time.Time{})
	require.NoError(t, err)
	require.Equal(t, []string{"/stats/probe/a"}, pr.Changed)
	require.EqualValues(t, 1, pr.Pruned)
	third := rows(alpha)
	require.True(t, third["probe/a"].changedAt.Equal(now))
	require.NotContains(t, third, "probe/b")
	require.Contains(t, third, "about")
	require.Len(t, in.take(), 1)

	// Snapshots of unregistered families survive a week, for rolling deploys
	// and rollbacks, then go.
	exec(`INSERT INTO stats_snapshots (tenant_id, page_key, producer_key, payload, sample_n, min_sample, computed_at, payload_changed_at)
		VALUES ($1, 'fresh/x', 'fresh', '{}', 1, 1, $2, $2), ($1, 'old/x', 'old', '{}', 1, 1, $3, $3)`,
		alpha, now.Add(-time.Hour), now.Add(-8*24*time.Hour))
	_, err = svc.RefreshTenant(ctx, queue, alpha, false)
	require.NoError(t, err)
	queue.take()
	require.Contains(t, rows(alpha), "fresh/x")
	require.NotContains(t, rows(alpha), "old/x")

	// beta (45 raids) is below the entry threshold: players are counted, it
	// gets no pages, and stale pages are dropped.
	exec(`INSERT INTO stats_snapshots (tenant_id, page_key, producer_key, payload, sample_n, min_sample, computed_at, payload_changed_at)
		VALUES ($1, 'about', 'about', '{}', 99, 1, now(), now())`, beta)
	tr, err = svc.RefreshTenant(ctx, queue, beta, false)
	require.NoError(t, err)
	require.False(t, tr.Eligible)
	require.EqualValues(t, 45, tr.Activity.Raids, "duplicates count once and unlisted logs not at all")
	require.NotNil(t, tr.Activity.Players)
	require.Equal(t, []string{"_activity"}, keys(beta))
	require.Empty(t, producers())
	pr, err = svc.RefreshProducer(ctx, beta, "probe", time.Time{})
	require.NoError(t, err)
	require.Zero(t, pr.Pages, "producers do nothing for ineligible tenants")

	// Hysteresis: once eligible, beta keeps its pages at 45 raids (above the
	// keep threshold).
	exec(`UPDATE stats_snapshots SET payload = '{"raids":55,"window_days":180,"eligible":true}' WHERE tenant_id = $1 AND page_key = '_activity'`, beta)
	tr, err = svc.RefreshTenant(ctx, queue, beta, true)
	require.NoError(t, err)
	require.True(t, tr.Eligible)
	require.EqualValues(t, 45, tr.Activity.Raids)
	queue.take()

	// The player threshold qualifies a tenant on its own.
	tr, err = svc.RefreshTenant(ctx, queue, gamma, false)
	require.NoError(t, err)
	require.True(t, tr.Eligible)
	require.EqualValues(t, servicestats.MinTenantPlayers, *tr.Activity.Players)
	queue.take()

	// End to end through the handler: alpha renders, beta and gamma (no
	// pages yet) are 404, and the static page follows eligibility.
	h := svc.Handler(func(*http.Request) (servicestats.Site, error) {
		return servicestats.Site{Name: "Alpha", Origin: "https://alpha.chronicleclassic.com", Discoverable: true}, nil
	})
	request := func(tenant uuid.UUID, path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil).WithContext(servicetenant.WithTenantID(context.Background(), tenant))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	ok := request(alpha, "/stats/about")
	require.Equal(t, http.StatusOK, ok.Code)
	require.Contains(t, ok.Body.String(), "players uploaded 50 raids")
	require.Equal(t, http.StatusOK, request(alpha, "/stats/probe/a").Code)
	require.Equal(t, http.StatusNotFound, request(alpha, "/stats/probe/b").Code, "pruned")
	require.Equal(t, http.StatusOK, request(alpha, "/stats/methodology").Code)
	require.Equal(t, http.StatusNotFound, request(hidden, "/stats/methodology").Code)
	require.Equal(t, http.StatusNotFound, request(gamma, "/stats/about").Code)
}
