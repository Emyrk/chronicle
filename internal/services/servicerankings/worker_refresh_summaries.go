package servicerankings

import (
	"context"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

// rankingsQueryVersion is bumped whenever the UpsertRankingsInstanceSummary
// query logic changes (e.g. aggregation method). The staleness guard compares
// this against the stored version to force a recompute even when row counts
// have not changed.
const rankingsQueryVersion int16 = 2

// ---------------------------------------------------------------------------
// ArgsRefreshRankingsSummaries — dispatch job (periodic, hourly).
// Fans out one ArgsRefreshRankingsSummaryTenant per tenant.
// ---------------------------------------------------------------------------

const KindRefreshRankingsSummaries = "refresh-rankings-summaries"

type ArgsRefreshRankingsSummaries struct{}

func (ArgsRefreshRankingsSummaries) Kind() string { return KindRefreshRankingsSummaries }

func (ArgsRefreshRankingsSummaries) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRankings,
		Priority:    riverconst.PriorityDefault,
		MaxAttempts: 3,
		UniqueOpts: river.UniqueOpts{
			ByState: []rivertype.JobState{
				rivertype.JobStateScheduled,
				rivertype.JobStatePending,
				rivertype.JobStateAvailable,
				rivertype.JobStateRunning,
			},
		},
	}
}

// WorkerRefreshRankingsSummaries is the dispatch worker. It enqueues one
// per-tenant refresh job for each tenant plus one for the root domain.
type WorkerRefreshRankingsSummaries struct {
	river.WorkerDefaults[ArgsRefreshRankingsSummaries]

	Store  database.Store
	Queue  *riverqueue.Queues
	Logger *slog.Logger
}

// minRefreshInterval is the minimum time between full dispatch runs.
// Prevents redundant work on rapid restarts/redeploys.
const minRefreshInterval = 45 * time.Minute

func (w *WorkerRefreshRankingsSummaries) Work(ctx context.Context, _ *river.Job[ArgsRefreshRankingsSummaries]) error {
	// AdminBypass so we can list all tenants regardless of context.
	ctx = servicetenant.AdminBypass(ctx)

	// Skip if summaries were refreshed recently (e.g. rapid redeploy).
	// Use the root tenant (uuid.Nil) as a representative — if it was
	// updated recently, all tenants were too.
	lastUpdated, err := w.Store.RankingsSummaryMaxUpdatedAt(ctx, uuid.Nil)
	if err == nil && time.Since(lastUpdated.Time) < minRefreshInterval {
		w.Logger.Info("rankings summaries refreshed recently, skipping dispatch",
			slog.Duration("age", time.Since(lastUpdated.Time)),
		)
		return nil
	}

	tenants, err := w.Store.ListTenants(ctx)
	if err != nil {
		return err
	}

	// Root domain (uuid.Nil) + each real tenant.
	tenantIDs := make([]uuid.UUID, 0, len(tenants)+1)
	tenantIDs = append(tenantIDs, uuid.Nil)
	for _, t := range tenants {
		tenantIDs = append(tenantIDs, t.ID)
	}

	for _, tid := range tenantIDs {
		if _, err := w.Queue.Insert(ctx, ArgsRefreshRankingsSummaryTenant{
			TenantID: tid,
		}, nil); err != nil {
			w.Logger.Error("failed to enqueue rankings tenant job",
				slog.String("tenant_id", tid.String()),
				slog.String("error", err.Error()),
			)
		}
	}

	w.Logger.Info("dispatched rankings summary refresh jobs",
		slog.Int("tenants", len(tenantIDs)),
	)
	return nil
}

// RefreshSummaryJobResult describes one tenant summary refresh job enqueued by
// an administrative force refresh.
type RefreshSummaryJobResult struct {
	TenantID uuid.UUID
	JobID    int64
	JobState string
}

// EnqueueRankingsSummaryRefreshAllTenants bypasses the periodic dispatch
// throttle by directly enqueueing the root and per-tenant refresh jobs.
func EnqueueRankingsSummaryRefreshAllTenants(
	ctx context.Context,
	store database.Store,
	queue *riverqueue.Queues,
) ([]RefreshSummaryJobResult, error) {
	tenants, err := store.ListTenants(ctx)
	if err != nil {
		return nil, err
	}

	tenantIDs := make([]uuid.UUID, 0, len(tenants)+1)
	tenantIDs = append(tenantIDs, uuid.Nil)
	for _, tenant := range tenants {
		tenantIDs = append(tenantIDs, tenant.ID)
	}

	results := make([]RefreshSummaryJobResult, 0, len(tenantIDs))
	for _, tenantID := range tenantIDs {
		result, err := queue.Insert(ctx, ArgsRefreshRankingsSummaryTenant{
			TenantID: tenantID,
			Force:    true,
		}, nil)
		if err != nil {
			return nil, err
		}
		results = append(results, RefreshSummaryJobResult{
			TenantID: tenantID,
			JobID:    result.Job.ID,
			JobState: string(result.Job.State),
		})
	}

	return results, nil
}

// ---------------------------------------------------------------------------
// ArgsRefreshRankingsSummaryTenant — per-tenant worker.
// Computes summaries for one tenant's realms.
// ---------------------------------------------------------------------------

const KindRefreshRankingsSummaryTenant = "refresh-rankings-summary-tenant"

type ArgsRefreshRankingsSummaryTenant struct {
	TenantID uuid.UUID `json:"tenant_id"`
	Force    bool      `json:"force,omitempty"`
}

func (ArgsRefreshRankingsSummaryTenant) Kind() string { return KindRefreshRankingsSummaryTenant }

func (ArgsRefreshRankingsSummaryTenant) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRankings,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 3,
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
			ByState: []rivertype.JobState{
				rivertype.JobStateScheduled,
				rivertype.JobStatePending,
				rivertype.JobStateAvailable,
				rivertype.JobStateRunning,
			},
		},
	}
}

// WorkerRefreshRankingsSummaryTenant refreshes summaries for a single tenant.
type WorkerRefreshRankingsSummaryTenant struct {
	river.WorkerDefaults[ArgsRefreshRankingsSummaryTenant]

	Store  database.Store
	Logger *slog.Logger
}

func (w *WorkerRefreshRankingsSummaryTenant) Work(ctx context.Context, job *river.Job[ArgsRefreshRankingsSummaryTenant]) error {
	tid := job.Args.TenantID

	// Set tenant context so RLS on encounter_dps_rankings scopes to
	// this tenant's realms. uuid.Nil = root domain (no tenant set →
	// RLS shows untenanted + include_in_all realms).
	if tid != uuid.Nil {
		ctx = servicetenant.WithTenantID(ctx, tid)
	}

	// Prune before the row-count staleness guard. A reparse can remove the last
	// rankings for one summary while leaving the tenant's total row count unchanged.
	pruned, err := w.Store.PruneStaleRankingsInstanceSummaries(ctx, tid)
	if err != nil {
		return err
	}
	if pruned > 0 {
		w.Logger.Info("pruned stale rankings summaries",
			slog.String("tenant_id", tid.String()),
			slog.Int64("count", pruned),
		)
	}

	// Staleness guard: skip if row count hasn't changed AND query version
	// matches. A query version mismatch forces a full recompute even when
	// the underlying data hasn't changed.
	currentCount, err := w.Store.RankingsRowCount(ctx)
	if err != nil {
		return err
	}
	lastSummary, err := w.Store.RankingsSummaryLastRowCount(ctx, tid)
	if err != nil {
		return err
	}
	if !job.Args.Force && currentCount == lastSummary.LastRowCount && lastSummary.LastRowCount > 0 && lastSummary.QueryVersion >= rankingsQueryVersion {
		w.Logger.Info("rankings row count unchanged, skipping",
			slog.String("tenant_id", tid.String()),
			slog.Int64("row_count", currentCount),
		)
		return nil
	}

	combos, err := w.Store.RankingsDistinctSummaryKeys(ctx)
	if err != nil {
		return err
	}

	for _, c := range combos {
		if err := w.Store.UpsertRankingsInstanceSummary(ctx, database.UpsertRankingsInstanceSummaryParams{
			InstanceName:   c.InstanceName,
			DifficultyName: c.DifficultyName,
			MaxPlayers:     c.MaxPlayers,
			TenantID:       tid,
			LastRowCount:   currentCount,
			QueryVersion:   rankingsQueryVersion,
		}); err != nil {
			w.Logger.Error("refresh rankings summary failed",
				slog.String("tenant_id", tid.String()),
				slog.String("instance", c.InstanceName),
				slog.String("difficulty", c.DifficultyName),
				slog.Int("max_players", int(c.MaxPlayers)),
				slog.String("error", err.Error()),
			)
			continue
		}
	}

	return nil
}
