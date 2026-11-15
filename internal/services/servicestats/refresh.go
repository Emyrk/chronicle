package servicestats

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// activityKey is the internal row holding the tenant's threshold check. It is
// its own producer key and page key, and is never routed.
const activityKey = "_activity"

// runMarkerPrefix prefixes the internal row that records a family's last
// successful run, so a family that emitted no pages is not rerun every hour.
// Its page key is runMarkerPrefix+producerKey and it belongs to that family.
const runMarkerPrefix = "_ran:"

// TenantRefresh reports what one tenant refresh did.
type TenantRefresh struct {
	// Eligible is false when the tenant is below the activity threshold.
	Eligible bool
	Activity Activity
	// Due lists the producer keys whose refresh was enqueued.
	Due []string
}

// RefreshTenant checks the tenant's threshold (at most every
// ActivityCadence), drops its pages when it is not eligible, prunes families
// that are no longer registered, and enqueues one ArgsProducer job per due
// family. force rechecks the threshold and enqueues every family.
func (s *Service) RefreshTenant(ctx context.Context, queue JobInserter, tenantID uuid.UUID, force bool) (TenantRefresh, error) {
	ctx = tenantContext(ctx, tenantID)
	now := s.now()

	meta, err := s.store.ListStatsSnapshotMeta(ctx, tenantID)
	if err != nil {
		return TenantRefresh{}, fmt.Errorf("list stats snapshots: %w", err)
	}
	lastRun := map[string]time.Time{}
	for _, m := range meta {
		if m.PageKey == activityKey {
			lastRun[activityKey] = m.ComputedAt.Time
		}
		if key, ok := strings.CutPrefix(m.PageKey, runMarkerPrefix); ok {
			lastRun[key] = m.ComputedAt.Time
		}
	}
	due := func(key string, cadence time.Duration) bool {
		at, ok := lastRun[key]
		return force || !ok || isDue(now, at, cadence)
	}

	registered := []string{activityKey}
	for _, f := range s.families {
		registered = append(registered, f.Producer.Key())
	}
	if _, err := s.store.DeleteStatsUnregistered(ctx, database.DeleteStatsUnregisteredParams{
		TenantID:               tenantID,
		RegisteredProducerKeys: registered,
		Before:                 timestamptz(now.Add(-UnregisteredRetention)),
	}); err != nil {
		return TenantRefresh{}, fmt.Errorf("prune unregistered stats families: %w", err)
	}

	activity, err := s.checkActivity(ctx, tenantID, now, due(activityKey, ActivityCadence))
	if err != nil {
		return TenantRefresh{}, err
	}
	result := TenantRefresh{Eligible: activity.Eligible, Activity: activity}
	if !activity.Eligible {
		if _, err := s.store.DeleteStatsTenantPages(ctx, database.DeleteStatsTenantPagesParams{TenantID: tenantID, KeepProducerKey: activityKey}); err != nil {
			return TenantRefresh{}, fmt.Errorf("drop stats pages: %w", err)
		}
		return result, nil
	}

	var errs []error
	for _, f := range s.families {
		key := f.Producer.Key()
		if !due(key, f.Producer.Cadence()) {
			continue
		}
		if _, err := queue.Insert(ctx, ArgsProducer{TenantID: tenantID, Key: key}, nil); err != nil {
			errs = append(errs, fmt.Errorf("enqueue stats producer %q: %w", key, err))
			continue
		}
		result.Due = append(result.Due, key)
	}
	return result, errors.Join(errs...)
}

// isDue reports whether a family or the threshold check last run at last is
// due at now. Run markers are stamped when a run finishes, after the dispatch
// tick that started it, so half a dispatch interval of slack keeps an hourly
// family on every tick (not every other one) and a 6h family on every sixth.
func isDue(now, last time.Time, cadence time.Duration) bool {
	return now.Sub(last) >= cadence-DispatchInterval/2
}

// checkActivity returns the tenant's threshold check, recomputing it when due
// and otherwise reading the stored one. The raid count runs first; the heavier
// player count runs only when raids alone do not qualify the tenant.
func (s *Service) checkActivity(ctx context.Context, tenantID uuid.UUID, now time.Time, due bool) (Activity, error) {
	previous, found, err := s.activity(ctx, tenantID)
	if err != nil {
		return Activity{}, err
	}
	if found && !due {
		return previous, nil
	}

	since := timestamptz(now.Add(-ActivityWindow))
	raids, err := s.store.StatsTenantRaidCount(ctx, since)
	if err != nil {
		return Activity{}, fmt.Errorf("count tenant raids: %w", err)
	}
	minRaids, minPlayers := int64(MinTenantRaids), int64(MinTenantPlayers)
	if previous.Eligible {
		minRaids, minPlayers = KeepTenantRaids, KeepTenantPlayers
	}
	a := Activity{Raids: raids, WindowDays: int(ActivityWindow.Hours() / 24), Eligible: raids >= minRaids}
	if !a.Eligible {
		players, err := s.store.StatsTenantPlayerCount(ctx, since)
		if err != nil {
			return Activity{}, fmt.Errorf("count tenant players: %w", err)
		}
		a.Players = &players
		a.Eligible = players >= minPlayers
	}
	if _, err := s.upsert(ctx, tenantID, activityKey, activityKey, a, raids, math.MaxInt32, now); err != nil {
		return Activity{}, fmt.Errorf("store stats activity: %w", err)
	}
	return a, nil
}

// activity reads the stored threshold check.
func (s *Service) activity(ctx context.Context, tenantID uuid.UUID) (Activity, bool, error) {
	row, err := s.store.GetStatsSnapshot(ctx, database.GetStatsSnapshotParams{TenantID: tenantID, PageKey: activityKey})
	if errors.Is(err, pgx.ErrNoRows) {
		return Activity{}, false, nil
	}
	if err != nil {
		return Activity{}, false, fmt.Errorf("read stats activity: %w", err)
	}
	var a Activity
	if err := json.Unmarshal(row.Payload, &a); err != nil {
		// Unreadable: treat as missing so it is recomputed.
		return Activity{}, false, nil
	}
	return a, true, nil
}

// ProducerRefresh reports what one producer run did.
type ProducerRefresh struct {
	// Pages is the number of pages the producer emitted.
	Pages int
	// Changed lists the paths of indexable pages whose payload changed.
	Changed []string
	// Pruned is the number of the family's old pages deleted.
	Pruned int64
}

// RefreshProducer runs one family's producer for a tenant, within the
// producer's timeout, stores its pages, deletes the family's pages it no
// longer emits and pings IndexNow for changed indexable pages. It does
// nothing for an unknown family or an ineligible tenant.
func (s *Service) RefreshProducer(ctx context.Context, tenantID uuid.UUID, producerKey string) (ProducerRefresh, error) {
	f := s.byProducer[producerKey]
	if f == nil {
		return ProducerRefresh{}, nil
	}
	ctx = tenantContext(ctx, tenantID)
	activity, found, err := s.activity(ctx, tenantID)
	if err != nil {
		return ProducerRefresh{}, err
	}
	if !found || !activity.Eligible {
		return ProducerRefresh{}, nil
	}
	tenant, err := s.tenant(ctx, tenantID)
	if err != nil {
		return ProducerRefresh{}, err
	}
	tenant.Activity = activity

	outputs, err := computeWithTimeout(ctx, f.Producer, tenant)
	if err != nil {
		return ProducerRefresh{}, fmt.Errorf("compute %q: %w", producerKey, err)
	}

	// Validate every key before the first write, so a bad run changes nothing.
	type page struct {
		out  Output
		path string
	}
	var pages []page
	seen := map[string]bool{}
	for _, out := range outputs {
		path, ok := f.PathForKey(out.Key)
		if !ok || seen[out.Key] {
			return ProducerRefresh{}, fmt.Errorf("producer %q emitted an invalid or duplicate page key %q", producerKey, out.Key)
		}
		seen[out.Key] = true
		if !s.servesFamily(path, f) {
			// Another family or a static page owns this URL, so the page could
			// never be served: don't store, list or ping it.
			s.logger.WarnContext(ctx, "stats page shadowed by another page, skipped",
				slog.String("producer", producerKey), slog.String("key", out.Key), slog.String("path", path))
			continue
		}
		pages = append(pages, page{out, path})
	}

	now := s.now()
	result := ProducerRefresh{Pages: len(pages)}
	marker := runMarkerPrefix + producerKey
	keep := []string{marker}
	for _, p := range pages {
		changed, err := s.upsert(ctx, tenantID, p.out.Key, producerKey, p.out.Payload, int64(p.out.SampleN), int64(p.out.MinSample), now)
		if err != nil {
			return ProducerRefresh{}, fmt.Errorf("store %q: %w", p.out.Key, err)
		}
		keep = append(keep, p.out.Key)
		if changed && p.out.SampleN >= p.out.MinSample {
			result.Changed = append(result.Changed, p.path)
		}
	}
	if _, err := s.upsert(ctx, tenantID, marker, producerKey, struct{}{}, 0, math.MaxInt32, now); err != nil {
		return ProducerRefresh{}, fmt.Errorf("store run marker: %w", err)
	}
	result.Pruned, err = s.store.DeleteStatsFamilyStale(ctx, database.DeleteStatsFamilyStaleParams{
		TenantID: tenantID, ProducerKey: producerKey, KeepPageKeys: keep,
	})
	if err != nil {
		return ProducerRefresh{}, fmt.Errorf("prune %q: %w", producerKey, err)
	}
	if len(result.Changed) > 0 && s.indexNow != nil {
		s.pingIndexNow(ctx, tenantID, result.Changed)
	}
	return result, nil
}

// computeWithTimeout runs Compute under the producer's timeout and returns as
// soon as the timeout passes, even if the producer ignores its context.
func computeWithTimeout(ctx context.Context, p Producer, tenant Tenant) ([]Output, error) {
	timeout := p.Timeout()
	if timeout <= 0 {
		timeout = DefaultProducerTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	type result struct {
		outputs []Output
		err     error
	}
	done := make(chan result, 1)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				done <- result{err: fmt.Errorf("producer panicked: %v", r)}
			}
		}()
		outputs, err := p.Compute(ctx, tenant)
		done <- result{outputs, err}
	}()
	select {
	case r := <-done:
		return r.outputs, r.err
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// tenant loads what producers get to know about the tenant.
func (s *Service) tenant(ctx context.Context, tenantID uuid.UUID) (Tenant, error) {
	t := Tenant{ID: tenantID, DatasetID: servicedataset.DefaultDatasetID, Store: s.store}
	if tenantID != uuid.Nil {
		row, err := s.store.GetTenantByID(servicetenant.AdminBypass(ctx), tenantID)
		if err != nil {
			return Tenant{}, fmt.Errorf("load tenant: %w", err)
		}
		t.Row = &row
		if row.DefaultDatasetID.Valid {
			t.DatasetID = row.DefaultDatasetID.UUID
		}
	}
	t.Flavor = s.siteFlavor(ctx, t.Row)
	return t, nil
}

func (s *Service) upsert(ctx context.Context, tenantID uuid.UUID, pageKey, producerKey string, payload any, sampleN, minSample int64, now time.Time) (bool, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return false, fmt.Errorf("marshal payload: %w", err)
	}
	return s.store.UpsertStatsSnapshot(ctx, database.UpsertStatsSnapshotParams{
		TenantID:    tenantID,
		PageKey:     pageKey,
		ProducerKey: producerKey,
		Payload:     raw,
		SampleN:     clampInt32(sampleN),
		MinSample:   clampInt32(minSample),
		ComputedAt:  timestamptz(now),
	})
}

// pingIndexNow submits changed pages for discoverable tenants.
func (s *Service) pingIndexNow(ctx context.Context, tenantID uuid.UUID, paths []string) {
	origin, discoverable, err := s.tenantOrigin(ctx, tenantID)
	if err != nil {
		s.logger.WarnContext(ctx, "indexnow: resolve tenant origin", slog.String("tenant_id", tenantID.String()), slog.String("error", err.Error()))
		return
	}
	if !discoverable || origin == "" {
		return
	}
	urls := make([]string, 0, len(paths))
	for _, p := range paths {
		urls = append(urls, origin+p)
	}
	s.indexNow.ping(ctx, origin, urls)
}

// tenantOrigin returns the tenant's canonical origin, matching the API's
// canonical hosts: the tenant subdomain, or the access URL host for the root.
func (s *Service) tenantOrigin(ctx context.Context, tenantID uuid.UUID) (string, bool, error) {
	ctx = servicetenant.AdminBypass(ctx)
	scheme := "https"
	if s.accessURL != nil && s.accessURL.Scheme != "" {
		scheme = s.accessURL.Scheme
	}
	if tenantID == uuid.Nil {
		cfg, err := s.store.GetSiteConfig(ctx)
		if err != nil {
			return "", false, err
		}
		host := s.primaryDomain
		if s.accessURL != nil && s.accessURL.Host != "" {
			host = strings.ToLower(s.accessURL.Host)
		}
		if host == "" {
			host = "chronicleclassic.com"
		}
		return scheme + "://" + host, cfg.Discoverable, nil
	}
	t, err := s.store.GetTenantByID(ctx, tenantID)
	if err != nil {
		return "", false, err
	}
	if !t.Slug.Valid || t.Slug.String == "" || s.primaryDomain == "" {
		return "", false, nil
	}
	return scheme + "://" + strings.ToLower(t.Slug.String) + "." + s.primaryDomain, t.Discoverable, nil
}

func tenantContext(ctx context.Context, tenantID uuid.UUID) context.Context {
	if tenantID != uuid.Nil {
		return servicetenant.WithTenantID(ctx, tenantID)
	}
	return ctx
}

func timestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

func clampInt32(n int64) int32 {
	if n > math.MaxInt32 {
		return math.MaxInt32
	}
	if n < 0 {
		return 0
	}
	return int32(n)
}

// ---------------------------------------------------------------------------
// River jobs: an hourly dispatch queues one tenant job per discoverable
// tenant (plus root); each tenant job queues one job per due family, so a slow
// or failing producer never holds up the others.
// ---------------------------------------------------------------------------

var activeJobStates = []rivertype.JobState{
	rivertype.JobStateScheduled,
	rivertype.JobStatePending,
	rivertype.JobStateAvailable,
	rivertype.JobStateRunning,
}

// QueueStats is the River queue every /stats job runs on, so heavy producers
// never take workers from other queues. Register it with QueueWorkers.
const QueueStats = "stats"

// QueueWorkers is the stats queue's worker count.
const QueueWorkers = 2

func insertOpts(byArgs bool, maxAttempts int) river.InsertOpts {
	return river.InsertOpts{
		Queue:       QueueStats,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: maxAttempts,
		UniqueOpts:  river.UniqueOpts{ByArgs: byArgs, ByState: activeJobStates},
	}
}

// KindDispatch is the River kind of the dispatch job.
const KindDispatch = "stats-snapshots-dispatch"

// ArgsDispatch fans out ArgsTenant jobs.
type ArgsDispatch struct{}

func (ArgsDispatch) Kind() string                 { return KindDispatch }
func (ArgsDispatch) InsertOpts() river.InsertOpts { return insertOpts(false, 3) }

// KindTenant is the River kind of the per-tenant job.
const KindTenant = "stats-snapshots-tenant"

// ArgsTenant refreshes one tenant. TenantID is uuid.Nil for root.
type ArgsTenant struct {
	TenantID uuid.UUID `json:"tenant_id"`
}

func (ArgsTenant) Kind() string                 { return KindTenant }
func (ArgsTenant) InsertOpts() river.InsertOpts { return insertOpts(true, 3) }

// KindProducer is the River kind of the per-family job.
const KindProducer = "stats-snapshots-producer"

// ArgsProducer runs one family's producer for one tenant. It is tried once:
// the next hourly tenant job re-queues a family that failed, so slow or broken
// producers can't pile up retries.
type ArgsProducer struct {
	TenantID uuid.UUID `json:"tenant_id"`
	Key      string    `json:"key"`
}

func (ArgsProducer) Kind() string                 { return KindProducer }
func (ArgsProducer) InsertOpts() river.InsertOpts { return insertOpts(true, 1) }

// JobInserter enqueues River jobs (riverqueue.Queues satisfies it).
type JobInserter interface {
	Insert(ctx context.Context, args river.JobArgs, opts *river.InsertOpts) (*rivertype.JobInsertResult, error)
}

// DispatchWorker enqueues one ArgsTenant job for each discoverable site.
type DispatchWorker struct {
	river.WorkerDefaults[ArgsDispatch]
	Service *Service
	Queue   JobInserter
}

func (w *DispatchWorker) Work(ctx context.Context, _ *river.Job[ArgsDispatch]) error {
	ids, err := w.Service.discoverableTenants(ctx)
	if err != nil {
		return err
	}
	var errs []error
	for _, id := range ids {
		if _, err := w.Queue.Insert(ctx, ArgsTenant{TenantID: id}, nil); err != nil {
			errs = append(errs, fmt.Errorf("enqueue stats refresh for %s: %w", id, err))
		}
	}
	return errors.Join(errs...)
}

// discoverableTenants lists the root site (uuid.Nil) and tenants that search
// engines may index; hidden sites get no /stats pages.
func (s *Service) discoverableTenants(ctx context.Context) ([]uuid.UUID, error) {
	ctx = servicetenant.AdminBypass(ctx)
	var ids []uuid.UUID
	cfg, err := s.store.GetSiteConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("read site config: %w", err)
	}
	if cfg.Discoverable {
		ids = append(ids, uuid.Nil)
	}
	tenants, err := s.store.ListTenants(ctx)
	if err != nil {
		return nil, fmt.Errorf("list tenants: %w", err)
	}
	for _, t := range tenants {
		if t.Discoverable {
			ids = append(ids, t.ID)
		}
	}
	return ids, nil
}

// TenantWorker runs RefreshTenant.
type TenantWorker struct {
	river.WorkerDefaults[ArgsTenant]
	Service *Service
	Queue   JobInserter
}

func (w *TenantWorker) Work(ctx context.Context, job *river.Job[ArgsTenant]) error {
	_, err := w.Service.RefreshTenant(ctx, w.Queue, job.Args.TenantID, false)
	return err
}

// ProducerWorker runs RefreshProducer.
type ProducerWorker struct {
	river.WorkerDefaults[ArgsProducer]
	Service *Service
}

// Timeout leaves room past the producer's own timeout to store its pages.
func (w *ProducerWorker) Timeout(job *river.Job[ArgsProducer]) time.Duration {
	timeout := DefaultProducerTimeout
	if f := w.Service.byProducer[job.Args.Key]; f != nil && f.Producer.Timeout() > 0 {
		timeout = f.Producer.Timeout()
	}
	return timeout + time.Minute
}

func (w *ProducerWorker) Work(ctx context.Context, job *river.Job[ArgsProducer]) error {
	_, err := w.Service.RefreshProducer(ctx, job.Args.TenantID, job.Args.Key)
	return err
}

// PeriodicDispatch is the periodic job that schedules the dispatch.
func PeriodicDispatch() *river.PeriodicJob {
	return river.NewPeriodicJob(
		river.PeriodicInterval(DispatchInterval),
		func() (river.JobArgs, *river.InsertOpts) { return ArgsDispatch{}, nil },
		&river.PeriodicJobOpts{ID: "stats-snapshots-dispatch", RunOnStart: true},
	)
}
