package servicerankings

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

// timeParseSnapshotQueryVersion is bumped whenever the batch-insert query
// logic for time-parse snapshots changes.
const timeParseSnapshotQueryVersion int16 = 1

// ---------------------------------------------------------------------------
// ArgsPublishTimeParseSnapshots — dispatch job (periodic).
// Fans out one ArgsPublishTimeParseSnapshotTenant per tenant per lookback.
// ---------------------------------------------------------------------------

const KindPublishTimeParseSnapshots = "publish-time-parse-snapshots"

type ArgsPublishTimeParseSnapshots struct{}

func (ArgsPublishTimeParseSnapshots) Kind() string { return KindPublishTimeParseSnapshots }

func (ArgsPublishTimeParseSnapshots) InsertOpts() river.InsertOpts {
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

// WorkerPublishTimeParseSnapshots is the dispatch worker for time-parse snapshots.
type WorkerPublishTimeParseSnapshots struct {
	river.WorkerDefaults[ArgsPublishTimeParseSnapshots]

	Store  database.Store
	Queue  *riverqueue.Queues
	Logger *slog.Logger
}

func (w *WorkerPublishTimeParseSnapshots) Work(ctx context.Context, _ *river.Job[ArgsPublishTimeParseSnapshots]) error {
	ctx = servicetenant.AdminBypass(ctx)

	tenants, err := w.Store.ListTenants(ctx)
	if err != nil {
		return err
	}

	type tenantJob struct {
		id          uuid.UUID
		parseConfig []byte
	}
	jobs := make([]tenantJob, 0, len(tenants)+1)
	jobs = append(jobs, tenantJob{id: uuid.Nil})
	for _, t := range tenants {
		jobs = append(jobs, tenantJob{id: t.ID, parseConfig: t.ParseConfig})
	}

	cutoff := todayUTCMidnight()
	var enqueued, skipped int
	for _, tj := range jobs {
		if isParseDisabled(tj.parseConfig) {
			skipped++
			continue
		}
		lookbacks := resolveLookbackDays(tj.parseConfig)
		for _, lb := range lookbacks {
			if _, err := w.Queue.Insert(ctx, ArgsPublishTimeParseSnapshotTenant{
				TenantID:      tj.id,
				Cutoff:        cutoff,
				LookbackDays:  int32(lb),
				PolicyVersion: int16(timeparsepolicy.PolicyVersion),
			}, nil); err != nil {
				w.Logger.Error("failed to enqueue time-parse snapshot tenant job",
					slog.String("tenant_id", tj.id.String()),
					slog.Int("lookback_days", int(lb)),
					slog.String("error", err.Error()),
				)
			} else {
				enqueued++
			}
		}
	}

	w.Logger.Info("dispatched time-parse snapshot publication jobs",
		slog.Int("enqueued", enqueued),
		slog.Int("skipped", skipped),
		slog.Int("tenants", len(jobs)),
	)

	_ = river.RecordOutput(ctx, map[string]any{
		"enqueued": enqueued,
		"skipped":  skipped,
		"tenants":  len(jobs),
	})

	return nil
}

// ---------------------------------------------------------------------------
// ArgsPublishTimeParseSnapshotTenant — per-tenant worker.
// ---------------------------------------------------------------------------

const KindPublishTimeParseSnapshotTenant = "publish-time-parse-snapshot-tenant"

type ArgsPublishTimeParseSnapshotTenant struct {
	TenantID      uuid.UUID `json:"tenant_id"`
	Cutoff        time.Time `json:"cutoff"`
	LookbackDays  int32     `json:"lookback_days"`
	PolicyVersion int16     `json:"policy_version"`
	AdminBackfill bool      `json:"admin_backfill,omitempty"`
}

func (ArgsPublishTimeParseSnapshotTenant) Kind() string { return KindPublishTimeParseSnapshotTenant }

func (ArgsPublishTimeParseSnapshotTenant) InsertOpts() river.InsertOpts {
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

// WorkerPublishTimeParseSnapshotTenant creates and publishes a time-parse
// snapshot for one tenant and lookback window.
type WorkerPublishTimeParseSnapshotTenant struct {
	river.WorkerDefaults[ArgsPublishTimeParseSnapshotTenant]

	Store  database.Store
	Logger *slog.Logger
}

func (w *WorkerPublishTimeParseSnapshotTenant) Work(ctx context.Context, job *river.Job[ArgsPublishTimeParseSnapshotTenant]) error {
	args := job.Args
	start := time.Now()

	if args.TenantID != uuid.Nil {
		ctx = servicetenant.WithTenantID(ctx, args.TenantID)
		tenant, err := w.Store.GetTenantByID(ctx, args.TenantID)
		if err == nil && len(tenant.ParseConfig) > 0 {
			if isParseDisabled(tenant.ParseConfig) {
				w.Logger.Debug("tenant parses disabled, skipping time-parse snapshot",
					slog.String("tenant_id", args.TenantID.String()),
				)
				_ = river.RecordOutput(ctx, map[string]any{
					"tenant_id": args.TenantID.String(),
					"skipped":   true,
					"reason":    "disabled",
				})
				return nil
			}
		}
	}

	cutoff := pgtype.Timestamptz{Time: args.Cutoff, Valid: true}
	var windowStart pgtype.Timestamptz
	if args.LookbackDays > 0 {
		ws := args.Cutoff.AddDate(0, 0, -int(args.LookbackDays))
		windowStart = pgtype.Timestamptz{Time: ws, Valid: true}
	}

	// Idempotency guard: skip if already published.
	_, alreadyErr := w.Store.GetPublishedTimeParseSnapshotForCutoff(ctx, database.GetPublishedTimeParseSnapshotForCutoffParams{
		TenantID:      args.TenantID,
		LookbackDays:  args.LookbackDays,
		PolicyVersion: args.PolicyVersion,
		QueryVersion:  timeParseSnapshotQueryVersion,
		Cutoff:        cutoff,
	})
	if alreadyErr == nil {
		w.Logger.Debug("skipping already-published time-parse snapshot for cutoff",
			slog.String("tenant_id", args.TenantID.String()),
			slog.Int("lookback_days", int(args.LookbackDays)),
			slog.Time("cutoff", args.Cutoff),
		)
		_ = river.RecordOutput(ctx, map[string]any{
			"tenant_id": args.TenantID.String(),
			"skipped":   true,
			"reason":    "already_published",
		})
		return nil
	}

	// Source stats for staleness guard.
	sourceStats, err := w.Store.GetTimeParseSnapshotSourceStats(ctx, database.GetTimeParseSnapshotSourceStatsParams{
		Cutoff:      cutoff,
		WindowStart: windowStart,
	})
	if err != nil {
		return fmt.Errorf("get time-parse source stats: %w", err)
	}

	// Staleness guard: skip if source data unchanged.
	// The fingerprint is the primary signal; row_count and watermark are
	// kept for diagnostics but a fingerprint match alone is sufficient to
	// skip re-publication.
	if !args.AdminBackfill {
		prev, prevErr := w.Store.GetLatestPublishedTimeParseSnapshotForGuard(ctx, database.GetLatestPublishedTimeParseSnapshotForGuardParams{
			TenantID:      args.TenantID,
			LookbackDays:  args.LookbackDays,
			PolicyVersion: args.PolicyVersion,
			QueryVersion:  timeParseSnapshotQueryVersion,
		})
		if prevErr == nil && prev.SourceFingerprint == sourceStats.Fingerprint {
			w.Logger.Debug("skipping unchanged time-parse snapshot",
				slog.String("tenant_id", args.TenantID.String()),
				slog.Int("lookback_days", int(args.LookbackDays)),
				slog.Int64("source_row_count", sourceStats.RowCount),
				slog.Int64("source_fingerprint", sourceStats.Fingerprint),
			)
			_ = river.RecordOutput(ctx, map[string]any{
				"tenant_id":          args.TenantID.String(),
				"skipped":            true,
				"reason":             "unchanged",
				"source_row_count":   sourceStats.RowCount,
				"source_fingerprint": sourceStats.Fingerprint,
			})
			return nil
		}
	}

	var clearCount, bossCount int64
	txErr := w.Store.InTx(ctx, func(tx database.Store) error {
		// 1. Create pending snapshot.
		snap, err := tx.InsertTimeParseSnapshot(ctx, database.InsertTimeParseSnapshotParams{
			TenantID:          args.TenantID,
			Cutoff:            cutoff,
			WindowStart:       windowStart,
			LookbackDays:      args.LookbackDays,
			PolicyVersion:     args.PolicyVersion,
			QueryVersion:      timeParseSnapshotQueryVersion,
			SourceRowCount:    sourceStats.RowCount,
			SourceWatermark:   sourceStats.Watermark,
			SourceFingerprint: sourceStats.Fingerprint,
		})
		if err != nil {
			return fmt.Errorf("insert time-parse snapshot: %w", err)
		}

		// 2. Populate clear-time members.
		if err := tx.BatchInsertTimeParseSnapshotClearTimeMembers(ctx, snap.ID); err != nil {
			return fmt.Errorf("batch insert clear-time members: %w", err)
		}

		// 3. Populate boss-kill members.
		if err := tx.BatchInsertTimeParseSnapshotBossKillMembers(ctx, snap.ID); err != nil {
			return fmt.Errorf("batch insert boss-kill members: %w", err)
		}

		// 4. Count members.
		clearCount, err = tx.CountTimeParseSnapshotClearTimeMembers(ctx, snap.ID)
		if err != nil {
			return fmt.Errorf("count clear-time members: %w", err)
		}
		bossCount, err = tx.CountTimeParseSnapshotBossKillMembers(ctx, snap.ID)
		if err != nil {
			return fmt.Errorf("count boss-kill members: %w", err)
		}

		// 5. Publish.
		if _, err := tx.PublishTimeParseSnapshot(ctx, snap.ID); err != nil {
			return fmt.Errorf("publish time-parse snapshot: %w", err)
		}

		return nil
	}, &pgx.TxOptions{})
	if txErr != nil {
		return txErr
	}

	duration := time.Since(start)
	w.Logger.Info("published time-parse snapshot",
		slog.String("tenant_id", args.TenantID.String()),
		slog.Int("lookback_days", int(args.LookbackDays)),
		slog.Int64("clear_time_members", clearCount),
		slog.Int64("boss_kill_members", bossCount),
		slog.Int64("source_row_count", sourceStats.RowCount),
		slog.Duration("duration", duration),
	)

	_ = river.RecordOutput(ctx, map[string]any{
		"tenant_id":          args.TenantID.String(),
		"lookback_days":      args.LookbackDays,
		"clear_time_members": clearCount,
		"boss_kill_members":  bossCount,
		"source_row_count":   sourceStats.RowCount,
		"duration_ms":        duration.Milliseconds(),
	})

	return nil
}

// ---------------------------------------------------------------------------
// Admin backfill entry points for time-parse snapshots.
// ---------------------------------------------------------------------------

// EnqueueTimeParseSnapshotBackfill enqueues a per-tenant time-parse snapshot
// publication job. day is truncated to 00:00 UTC; the job will no-op if a
// snapshot for that cutoff already exists.
// When day is not today, AdminBackfill is set so the staleness guard is skipped.
func EnqueueTimeParseSnapshotBackfill(
	ctx context.Context,
	queue *riverqueue.Queues,
	tenantID uuid.UUID,
	day time.Time,
	lookbackDays int32,
	policyVersion int16,
) (*rivertype.JobInsertResult, error) {
	cutoff := truncateToUTCMidnight(day)
	adminBackfill := cutoff.Before(todayUTCMidnight())
	return queue.Insert(ctx, ArgsPublishTimeParseSnapshotTenant{
		TenantID:      tenantID,
		Cutoff:        cutoff,
		LookbackDays:  lookbackDays,
		PolicyVersion: policyVersion,
		AdminBackfill: adminBackfill,
	}, nil)
}

// EnqueueTimeParseSnapshotBackfillAllTenants enumerates root + all non-disabled
// tenants and enqueues one time-parse backfill job per tenant per lookback
// window, matching the dispatch worker's logic.
func EnqueueTimeParseSnapshotBackfillAllTenants(
	ctx context.Context,
	store database.Store,
	queue *riverqueue.Queues,
	day time.Time,
	defaultLookbackDays int32,
	policyVersion int16,
) ([]BackfillJobResult, error) {
	tenants, err := store.ListTenants(ctx)
	if err != nil {
		return nil, fmt.Errorf("list tenants: %w", err)
	}

	type tenantEntry struct {
		id          uuid.UUID
		parseConfig []byte
	}
	entries := make([]tenantEntry, 0, len(tenants)+1)
	entries = append(entries, tenantEntry{id: uuid.Nil}) // root scope
	for _, t := range tenants {
		entries = append(entries, tenantEntry{id: t.ID, parseConfig: t.ParseConfig})
	}

	cutoff := truncateToUTCMidnight(day)
	adminBackfill := cutoff.Before(todayUTCMidnight())

	var results []BackfillJobResult
	for _, te := range entries {
		if isParseDisabled(te.parseConfig) {
			continue
		}
		lookbacks := resolveLookbackDays(te.parseConfig)
		if len(lookbacks) == 1 && lookbacks[0] == parsepolicy.DefaultLookbackDays && defaultLookbackDays != 0 {
			lookbacks = []parsepolicy.LookbackDays{parsepolicy.LookbackDays(defaultLookbackDays)}
		}
		for _, lb := range lookbacks {
			res, err := queue.Insert(ctx, ArgsPublishTimeParseSnapshotTenant{
				TenantID:      te.id,
				Cutoff:        cutoff,
				LookbackDays:  int32(lb),
				PolicyVersion: policyVersion,
				AdminBackfill: adminBackfill,
			}, nil)
			if err != nil {
				return nil, fmt.Errorf("enqueue tenant %s lookback %d: %w", te.id, lb, err)
			}
			results = append(results, BackfillJobResult{
				TenantID:     te.id,
				LookbackDays: int32(lb),
				JobID:        res.Job.ID,
				JobState:     string(res.Job.State),
			})
		}
	}

	return results, nil
}
