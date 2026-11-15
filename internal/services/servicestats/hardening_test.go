package servicestats_test

import (
	"bytes"
	"context"
	"net/http"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicestats"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
)

// memStore is an in-memory stats store for the refresh logic. Calls it does
// not implement panic on the nil embedded interface.
type memStore struct {
	database.Store
	mu        sync.Mutex
	rows      map[string]database.StatsSnapshot // tenant/page key
	raids     int64
	raidCalls atomic.Int32
}

func (m *memStore) id(tenant uuid.UUID, key string) string { return tenant.String() + "/" + key }

func (m *memStore) GetStatsSnapshot(_ context.Context, arg database.GetStatsSnapshotParams) (database.StatsSnapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	row, ok := m.rows[m.id(arg.TenantID, arg.PageKey)]
	if !ok {
		return database.StatsSnapshot{}, pgx.ErrNoRows
	}
	return row, nil
}

func (m *memStore) ListStatsSnapshotMeta(_ context.Context, tenant uuid.UUID) ([]database.ListStatsSnapshotMetaRow, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []database.ListStatsSnapshotMetaRow
	for _, r := range m.rows {
		if r.TenantID == tenant {
			out = append(out, database.ListStatsSnapshotMetaRow{PageKey: r.PageKey, ProducerKey: r.ProducerKey, SampleN: r.SampleN, MinSample: r.MinSample, ComputedAt: r.ComputedAt, PayloadChangedAt: r.PayloadChangedAt})
		}
	}
	slices.SortFunc(out, func(a, b database.ListStatsSnapshotMetaRow) int { return strings.Compare(a.PageKey, b.PageKey) })
	return out, nil
}

func (m *memStore) UpsertStatsSnapshot(_ context.Context, arg database.UpsertStatsSnapshotParams) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.rows == nil {
		m.rows = map[string]database.StatsSnapshot{}
	}
	id := m.id(arg.TenantID, arg.PageKey)
	prev, ok := m.rows[id]
	changedAt := arg.ComputedAt
	if ok && bytes.Equal(prev.Payload, arg.Payload) {
		changedAt = prev.PayloadChangedAt
	}
	m.rows[id] = database.StatsSnapshot{TenantID: arg.TenantID, PageKey: arg.PageKey, ProducerKey: arg.ProducerKey, Payload: arg.Payload, SampleN: arg.SampleN, MinSample: arg.MinSample, ComputedAt: arg.ComputedAt, PayloadChangedAt: changedAt}
	return changedAt == arg.ComputedAt, nil
}

func (m *memStore) DeleteStatsFamilyStale(_ context.Context, arg database.DeleteStatsFamilyStaleParams) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var n int64
	for id, r := range m.rows {
		if r.TenantID == arg.TenantID && r.ProducerKey == arg.ProducerKey && !slices.Contains(arg.KeepPageKeys, r.PageKey) {
			delete(m.rows, id)
			n++
		}
	}
	return n, nil
}

func (m *memStore) DeleteStatsUnregistered(_ context.Context, arg database.DeleteStatsUnregisteredParams) (int64, error) {
	return 0, nil
}

func (m *memStore) DeleteStatsTenantPages(_ context.Context, arg database.DeleteStatsTenantPagesParams) (int64, error) {
	return 0, nil
}

func (m *memStore) StatsTenantRaidCount(context.Context, pgtype.Timestamptz) (int64, error) {
	m.raidCalls.Add(1)
	return m.raids, nil
}

func (m *memStore) GetTenantByID(_ context.Context, id uuid.UUID) (database.Tenant, error) {
	return database.Tenant{ID: id, Discoverable: true}, nil
}

func (m *memStore) pageKeys(tenant uuid.UUID) []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []string
	for _, r := range m.rows {
		if r.TenantID == tenant {
			out = append(out, r.PageKey)
		}
	}
	slices.Sort(out)
	return out
}

// emitting returns a family that emits the given page keys.
func emitting(pattern, key string, cadence time.Duration, pageKeys ...string) servicestats.Family {
	outputs := make([]servicestats.Output, 0, len(pageKeys))
	for _, k := range pageKeys {
		outputs = append(outputs, servicestats.Output{Key: k, Payload: map[string]string{"k": k}, SampleN: 10, MinSample: 1})
	}
	return servicestats.Family{
		Pattern: pattern,
		Producer: funcProducer{key: key, cadence: cadence, compute: func(context.Context, servicestats.Tenant) ([]servicestats.Output, error) {
			return outputs, nil
		}},
		Render: titleRender,
	}
}

func newMemService(t *testing.T, store *memStore, now func() time.Time, families ...servicestats.Family) *servicestats.Service {
	t.Helper()
	svc, err := servicestats.New(servicestats.Options{Logger: testutil.Logger(t), Store: store, Families: families, Now: now})
	require.NoError(t, err)
	return svc
}

// A family output whose URL another family (or a static page) serves is
// never stored, listed or pinged.
func TestShadowedOutputsSkipped(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	tenant := uuid.New()
	store := &memStore{raids: 80}
	boss := emitting("/stats/{instance}/{boss}", "boss", time.Hour, "boss/naxxramas/patchwerk", "boss/naxxramas/speedruns")
	speedruns := emitting("/stats/{instance}/speedruns", "speedruns", time.Hour, "speedruns/naxxramas")
	svc := newMemService(t, store, time.Now, boss, speedruns)

	_, err := svc.RefreshTenant(ctx, &recordingQueue{}, tenant, false)
	require.NoError(t, err)
	res, err := svc.RefreshProducer(ctx, tenant, "boss")
	require.NoError(t, err)
	require.Equal(t, 1, res.Pages)
	require.Equal(t, []string{"/stats/naxxramas/patchwerk"}, res.Changed, "the shadowed page is not pinged")
	require.NotContains(t, store.pageKeys(tenant), "boss/naxxramas/speedruns", "the shadowed page is not stored")
	_, err = svc.RefreshProducer(ctx, tenant, "speedruns")
	require.NoError(t, err)

	// A shadowed row stored before (e.g. by an older deploy) stays out of the sitemap.
	_, err = store.UpsertStatsSnapshot(ctx, database.UpsertStatsSnapshotParams{TenantID: tenant, PageKey: "boss/naxxramas/speedruns", ProducerKey: "boss", Payload: []byte(`{}`), SampleN: 10, MinSample: 1, ComputedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true}})
	require.NoError(t, err)
	entries, err := svc.SitemapEntries(servicetenant.WithTenantID(ctx, tenant))
	require.NoError(t, err)
	var paths []string
	for _, e := range entries {
		paths = append(paths, e.Path)
	}
	require.ElementsMatch(t, []string{"/stats/naxxramas/patchwerk", "/stats/naxxramas/speedruns", "/stats/methodology"}, paths)
	require.Equal(t, 1, strings.Count(strings.Join(paths, " "), "/stats/naxxramas/speedruns"), "listed once, for the family that serves it")
}

func TestNewRejectsStaticFamilyOverlap(t *testing.T) {
	t.Parallel()
	_, err := servicestats.New(servicestats.Options{Store: &memStore{}, Families: []servicestats.Family{emitting("/stats/{page}", "page", time.Hour)}})
	require.ErrorContains(t, err, "/stats/methodology")
}

// A run with any bad key writes nothing: not its valid pages, not its marker.
func TestInvalidKeyWritesNothing(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	tenant := uuid.New()
	store := &memStore{raids: 80}
	svc := newMemService(t, store, time.Now, emitting("/stats/probe/{name}", "probe", time.Hour, "probe/a", "probe/NOT-A-SLUG"))
	_, err := svc.RefreshTenant(ctx, &recordingQueue{}, tenant, false)
	require.NoError(t, err)
	_, err = svc.RefreshProducer(ctx, tenant, "probe")
	require.ErrorContains(t, err, "invalid or duplicate page key")
	require.Equal(t, []string{"_activity"}, store.pageKeys(tenant))
}

// With realistic timing (the dispatch fires about hourly and each run takes
// a few minutes, so markers land after the tick) an hourly family runs on
// every tick, a 6h family on every sixth, and the threshold check every 6h.
func TestCadenceRealisticClock(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	tenant := uuid.New()
	start := time.Date(2026, 11, 16, 0, 0, 0, 0, time.UTC)
	var mu sync.Mutex
	clock := start
	now := func() time.Time { mu.Lock(); defer mu.Unlock(); return clock }
	advance := func(d time.Duration) { mu.Lock(); clock = clock.Add(d); mu.Unlock() }

	runs := map[string]int{}
	family := func(pattern, key string, cadence time.Duration) servicestats.Family {
		return servicestats.Family{
			Pattern: pattern,
			Producer: funcProducer{key: key, cadence: cadence, compute: func(context.Context, servicestats.Tenant) ([]servicestats.Output, error) {
				mu.Lock()
				runs[key]++
				mu.Unlock()
				advance(3 * time.Minute) // the run takes a while; its marker lands after the tick
				return []servicestats.Output{{Key: key, Payload: map[string]int{}, SampleN: 1, MinSample: 1}}, nil
			}},
			Render: titleRender,
		}
	}
	store := &memStore{raids: 80}
	svc := newMemService(t, store, now, family("/stats/hourly", "hourly", time.Hour), family("/stats/sixhourly", "sixhourly", 6*time.Hour))

	queue := &recordingQueue{}
	for tick := 0; tick < 24; tick++ {
		mu.Lock()
		// River's periodic schedule drifts a little around the hour.
		clock = start.Add(time.Duration(tick)*time.Hour + time.Duration(tick%3)*20*time.Second)
		mu.Unlock()
		_, err := svc.RefreshTenant(ctx, queue, tenant, false)
		require.NoError(t, err)
		advance(30 * time.Second) // queue latency
		for _, job := range queue.take() {
			_, err := svc.RefreshProducer(ctx, tenant, job.(servicestats.ArgsProducer).Key)
			require.NoError(t, err)
		}
	}
	require.Equal(t, 24, runs["hourly"])
	require.Equal(t, 4, runs["sixhourly"])
	require.EqualValues(t, 4, store.raidCalls.Load(), "threshold check every 6h")
}

func TestStatsJobOptions(t *testing.T) {
	t.Parallel()
	for _, opts := range []struct {
		name        string
		queue       string
		maxAttempts int
	}{
		{"producer", servicestats.ArgsProducer{}.InsertOpts().Queue, servicestats.ArgsProducer{}.InsertOpts().MaxAttempts},
		{"tenant", servicestats.ArgsTenant{}.InsertOpts().Queue, servicestats.ArgsTenant{}.InsertOpts().MaxAttempts},
		{"dispatch", servicestats.ArgsDispatch{}.InsertOpts().Queue, servicestats.ArgsDispatch{}.InsertOpts().MaxAttempts},
	} {
		require.Equal(t, servicestats.QueueStats, opts.queue, opts.name)
		want := 3
		if opts.name == "producer" {
			want = 1 // the hourly tenant job is the retry
		}
		require.Equal(t, want, opts.maxAttempts, opts.name)
	}
}

// Hidden sites and percent-encoded path variants are 404 without a query.
func TestHiddenAndEncodedPaths404(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	store.about(tenant, `{"raids":80,"window_days":180}`, 80)
	store.eligible(tenant, true)
	hidden := forever
	hidden.Discoverable = false

	require.Equal(t, http.StatusNotFound, get(t, handler(newService(t, store), hidden), tenant, "/stats/about").Code)
	require.Equal(t, http.StatusNotFound, get(t, handler(newService(t, store), hidden), tenant, "/stats/methodology").Code)
	h := handler(newService(t, store), forever)
	require.Equal(t, http.StatusNotFound, get(t, h, tenant, "/stats/%61bout").Code)
	require.Equal(t, http.StatusNotFound, get(t, h, tenant, "/stats/methodolog%79").Code)
	require.EqualValues(t, 0, store.reads.Load(), "decided before any database read")
	require.Equal(t, http.StatusOK, get(t, h, tenant, "/stats/about").Code)
}
