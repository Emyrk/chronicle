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
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// activityKey is the internal snapshot holding the tenant's threshold check.
// It is never routed or listed in the sitemap.
const activityKey = "_activity"

type activityPayload struct {
	Raids    int64 `json:"raids"`
	Players  int64 `json:"players"`
	Eligible bool  `json:"eligible"`
}

// RefreshResult reports what one tenant refresh did.
type RefreshResult struct {
	// Eligible is false when the tenant is below the activity threshold.
	Eligible bool
	// Computed lists the page keys recomputed.
	Computed []string
	// Changed lists the paths of indexable pages whose payload changed.
	Changed []string
}

// RefreshTenant recomputes the tenant's due snapshots. force recomputes the
// threshold and every page regardless of cadence. A failing producer does not
// stop the others; their errors are joined.
func (s *Service) RefreshTenant(ctx context.Context, tenantID uuid.UUID, force bool) (RefreshResult, error) {
	if tenantID != uuid.Nil {
		ctx = servicetenant.WithTenantID(ctx, tenantID)
	}
	now := s.now()

	meta, err := s.store.ListStatsSnapshotMeta(ctx, tenantID)
	if err != nil {
		return RefreshResult{}, fmt.Errorf("list stats snapshots: %w", err)
	}
	computedAt := make(map[string]time.Time, len(meta))
	for _, m := range meta {
		computedAt[m.PageKey] = m.ComputedAt.Time
	}
	due := func(key string, cadence time.Duration) bool {
		at, ok := computedAt[key]
		return force || !ok || now.Sub(at) >= cadence
	}

	eligible, err := s.checkActivity(ctx, tenantID, now, due(activityKey, ActivityCadence))
	if err != nil {
		return RefreshResult{}, err
	}
	keep := []string{activityKey}
	if !eligible {
		if _, err := s.store.DeleteStatsSnapshotsExcept(ctx, database.DeleteStatsSnapshotsExceptParams{TenantID: tenantID, PageKeys: keep}); err != nil {
			return RefreshResult{}, fmt.Errorf("drop stats snapshots: %w", err)
		}
		return RefreshResult{}, nil
	}

	// Drop snapshots of pages that are no longer registered.
	for _, p := range s.pages {
		keep = append(keep, p.Producer.Key())
	}
	if _, err := s.store.DeleteStatsSnapshotsExcept(ctx, database.DeleteStatsSnapshotsExceptParams{TenantID: tenantID, PageKeys: keep}); err != nil {
		return RefreshResult{}, fmt.Errorf("prune stats snapshots: %w", err)
	}

	result := RefreshResult{Eligible: true}
	var errs []error
	for _, p := range s.pages {
		key := p.Producer.Key()
		if !due(key, p.Producer.Cadence()) {
			continue
		}
		changed, sampleN, err := s.computePage(ctx, tenantID, p, now)
		if err != nil {
			s.logger.ErrorContext(ctx, "compute stats snapshot",
				slog.String("tenant_id", tenantID.String()), slog.String("page", key), slog.String("error", err.Error()))
			errs = append(errs, fmt.Errorf("page %q: %w", key, err))
			continue
		}
		result.Computed = append(result.Computed, key)
		if changed && sampleN >= p.MinSample {
			result.Changed = append(result.Changed, p.Path)
		}
	}

	if len(result.Changed) > 0 && s.indexNow != nil {
		s.pingIndexNow(ctx, tenantID, result.Changed)
	}
	return result, errors.Join(errs...)
}

func (s *Service) computePage(ctx context.Context, tenantID uuid.UUID, p Page, now time.Time) (changed bool, sampleN int, err error) {
	payload, sampleN, err := p.Producer.Compute(ctx, Tenant{ID: tenantID})
	if err != nil {
		return false, 0, err
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return false, 0, fmt.Errorf("marshal payload: %w", err)
	}
	changed, err = s.store.UpsertStatsSnapshot(ctx, database.UpsertStatsSnapshotParams{
		TenantID:   tenantID,
		PageKey:    p.Producer.Key(),
		Payload:    raw,
		SampleN:    clampInt32(int64(sampleN)),
		ComputedAt: pgtype.Timestamptz{Time: now, Valid: true},
	})
	if err != nil {
		return false, 0, fmt.Errorf("store snapshot: %w", err)
	}
	return changed, sampleN, nil
}

// checkActivity reports whether the tenant clears the activity threshold,
// recomputing it when due and otherwise reading the stored result.
func (s *Service) checkActivity(ctx context.Context, tenantID uuid.UUID, now time.Time, due bool) (bool, error) {
	if !due {
		snap, err := s.store.GetStatsSnapshot(ctx, database.GetStatsSnapshotParams{TenantID: tenantID, PageKey: activityKey})
		if err == nil {
			var a activityPayload
			if err := json.Unmarshal(snap.Payload, &a); err == nil {
				return a.Eligible, nil
			}
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return false, fmt.Errorf("read stats activity: %w", err)
		}
		// Missing or unreadable: recompute.
	}

	row, err := s.store.StatsTenantActivity(ctx, pgtype.Timestamptz{Time: now.Add(-ActivityWindow), Valid: true})
	if err != nil {
		return false, fmt.Errorf("count tenant activity: %w", err)
	}
	a := activityPayload{
		Raids:    row.RaidCount,
		Players:  row.PlayerCount,
		Eligible: row.RaidCount >= MinTenantRaids || row.PlayerCount >= MinTenantPlayers,
	}
	raw, err := json.Marshal(a)
	if err != nil {
		return false, err
	}
	if _, err := s.store.UpsertStatsSnapshot(ctx, database.UpsertStatsSnapshotParams{
		TenantID:   tenantID,
		PageKey:    activityKey,
		Payload:    raw,
		SampleN:    clampInt32(row.RaidCount),
		ComputedAt: pgtype.Timestamptz{Time: now, Valid: true},
	}); err != nil {
		return false, fmt.Errorf("store stats activity: %w", err)
	}
	return a.Eligible, nil
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
// River jobs: an hourly dispatch fans out one refresh per tenant (plus root).
// ---------------------------------------------------------------------------

// KindDispatch is the River kind of the dispatch job.
const KindDispatch = "stats-snapshots-dispatch"

// ArgsDispatch fans out ArgsTenant jobs.
type ArgsDispatch struct{}

func (ArgsDispatch) Kind() string { return KindDispatch }

func (ArgsDispatch) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       river.QueueDefault,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 3,
		UniqueOpts:  river.UniqueOpts{ByState: activeJobStates},
	}
}

// KindTenant is the River kind of the per-tenant refresh job.
const KindTenant = "stats-snapshots-tenant"

// ArgsTenant refreshes one tenant's snapshots. TenantID is uuid.Nil for root.
type ArgsTenant struct {
	TenantID uuid.UUID `json:"tenant_id"`
	Force    bool      `json:"force,omitempty"`
}

func (ArgsTenant) Kind() string { return KindTenant }

func (ArgsTenant) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       river.QueueDefault,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 3,
		UniqueOpts:  river.UniqueOpts{ByArgs: true, ByState: activeJobStates},
	}
}

var activeJobStates = []rivertype.JobState{
	rivertype.JobStateScheduled,
	rivertype.JobStatePending,
	rivertype.JobStateAvailable,
	rivertype.JobStateRunning,
}

// JobInserter enqueues River jobs (riverqueue.Queues satisfies it).
type JobInserter interface {
	Insert(ctx context.Context, args river.JobArgs, opts *river.InsertOpts) (*rivertype.JobInsertResult, error)
}

// DispatchWorker enqueues one ArgsTenant job for the root site and each tenant.
type DispatchWorker struct {
	river.WorkerDefaults[ArgsDispatch]
	Service *Service
	Queue   JobInserter
}

func (w *DispatchWorker) Work(ctx context.Context, _ *river.Job[ArgsDispatch]) error {
	tenants, err := w.Service.store.ListTenants(servicetenant.AdminBypass(ctx))
	if err != nil {
		return fmt.Errorf("list tenants: %w", err)
	}
	ids := make([]uuid.UUID, 0, len(tenants)+1)
	ids = append(ids, uuid.Nil)
	for _, t := range tenants {
		ids = append(ids, t.ID)
	}
	var errs []error
	for _, id := range ids {
		if _, err := w.Queue.Insert(ctx, ArgsTenant{TenantID: id}, nil); err != nil {
			errs = append(errs, fmt.Errorf("enqueue stats refresh for %s: %w", id, err))
		}
	}
	return errors.Join(errs...)
}

// TenantWorker refreshes one tenant's snapshots.
type TenantWorker struct {
	river.WorkerDefaults[ArgsTenant]
	Service *Service
}

func (*TenantWorker) Timeout(*river.Job[ArgsTenant]) time.Duration { return 10 * time.Minute }

func (w *TenantWorker) Work(ctx context.Context, job *river.Job[ArgsTenant]) error {
	_, err := w.Service.RefreshTenant(ctx, job.Args.TenantID, job.Args.Force)
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
