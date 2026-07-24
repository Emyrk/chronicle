package servicerankings

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

// snapshotQueryVersion is bumped whenever the BatchInsertSnapshotMembersFromRankings
// query logic changes. Stored on each snapshot for reproducibility.
const snapshotQueryVersion int16 = 1

// ---------------------------------------------------------------------------
// ArgsPublishParseSnapshots — dispatch job (periodic).
// Fans out one ArgsPublishParseSnapshotTenant per tenant per lookback window.
// ---------------------------------------------------------------------------

const KindPublishParseSnapshots = "publish-parse-snapshots"

type ArgsPublishParseSnapshots struct{}

func (ArgsPublishParseSnapshots) Kind() string { return KindPublishParseSnapshots }

func (ArgsPublishParseSnapshots) InsertOpts() river.InsertOpts {
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

// WorkerPublishParseSnapshots is the dispatch worker. It enumerates tenants
// plus root scope and enqueues one per-tenant publication job per configured
// lookback window.
type WorkerPublishParseSnapshots struct {
	river.WorkerDefaults[ArgsPublishParseSnapshots]

	Store  database.Store
	Queue  *riverqueue.Queues
	Logger *slog.Logger
}

func (w *WorkerPublishParseSnapshots) Work(ctx context.Context, _ *river.Job[ArgsPublishParseSnapshots]) error {
	ctx = servicetenant.AdminBypass(ctx)

	tenants, err := w.Store.ListTenants(ctx)
	if err != nil {
		return err
	}

	// Root domain (uuid.Nil) + each real tenant.
	type tenantJob struct {
		id          uuid.UUID
		parseConfig []byte
	}
	jobs := make([]tenantJob, 0, len(tenants)+1)
	jobs = append(jobs, tenantJob{id: uuid.Nil})
	for _, t := range tenants {
		jobs = append(jobs, tenantJob{id: t.ID, parseConfig: t.ParseConfig})
	}

	// Daily 00:00 UTC boundary: snapshot freezes all data strictly before today.
	cutoff := todayUTCMidnight()
	var enqueued, skipped int
	for _, tj := range jobs {
		if isParseDisabled(tj.parseConfig) {
			w.Logger.Debug("skipping disabled tenant for parse snapshot",
				slog.String("tenant_id", tj.id.String()),
			)
			skipped++
			continue
		}
		lookbacks := resolveLookbackDays(tj.parseConfig)
		for _, lb := range lookbacks {
			if _, err := w.Queue.Insert(ctx, ArgsPublishParseSnapshotTenant{
				TenantID:      tj.id,
				Cutoff:        cutoff,
				LookbackDays:  int32(lb),
				PolicyVersion: int16(parsepolicy.PolicyVersion),
			}, nil); err != nil {
				w.Logger.Error("failed to enqueue snapshot tenant job",
					slog.String("tenant_id", tj.id.String()),
					slog.Int("lookback_days", int(lb)),
					slog.String("error", err.Error()),
				)
			} else {
				enqueued++
			}
		}
	}

	w.Logger.Info("dispatched parse snapshot publication jobs",
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

// isParseDisabled returns true when the tenant's parse_config has
// cohort_mode set to "disabled".
func isParseDisabled(parseConfigJSON []byte) bool {
	if len(parseConfigJSON) == 0 {
		return false
	}
	var pc struct {
		CohortMode string `json:"cohort_mode"`
	}
	if err := json.Unmarshal(parseConfigJSON, &pc); err == nil {
		return pc.CohortMode == string(parsepolicy.CohortModeDisabled)
	}
	return false
}

// resolveLookbackDays returns the set of lookback windows to snapshot for a
// tenant. Falls back to the 60-day default when no ParseConfig is present.
func resolveLookbackDays(parseConfigJSON []byte) []parsepolicy.LookbackDays {
	if len(parseConfigJSON) > 0 {
		var pc struct {
			AllowedLookbackDays []int `json:"allowed_lookback_days"`
		}
		if err := json.Unmarshal(parseConfigJSON, &pc); err == nil && len(pc.AllowedLookbackDays) > 0 {
			out := make([]parsepolicy.LookbackDays, len(pc.AllowedLookbackDays))
			for i, d := range pc.AllowedLookbackDays {
				out[i] = parsepolicy.LookbackDays(d)
			}
			return out
		}
	}
	return []parsepolicy.LookbackDays{parsepolicy.DefaultLookbackDays}
}

// ---------------------------------------------------------------------------
// ArgsPublishParseSnapshotTenant — per-tenant worker.
// Creates a pending snapshot, populates members, and publishes it.
// ---------------------------------------------------------------------------

const KindPublishParseSnapshotTenant = "publish-parse-snapshot-tenant"

type ArgsPublishParseSnapshotTenant struct {
	TenantID      uuid.UUID `json:"tenant_id"`
	Cutoff        time.Time `json:"cutoff"`
	LookbackDays  int32     `json:"lookback_days"`
	PolicyVersion int16     `json:"policy_version"`
	// AdminBackfill, when true, skips the staleness guard so that a past-day
	// snapshot is always created even if source stats match a previous snapshot.
	// The already-published idempotency check still applies.
	AdminBackfill bool `json:"admin_backfill,omitempty"`
}

func (ArgsPublishParseSnapshotTenant) Kind() string { return KindPublishParseSnapshotTenant }

func (ArgsPublishParseSnapshotTenant) InsertOpts() river.InsertOpts {
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

// WorkerPublishParseSnapshotTenant creates and publishes a snapshot for one
// tenant and lookback window. Published snapshots are immutable; re-running
// creates a new snapshot.
type WorkerPublishParseSnapshotTenant struct {
	river.WorkerDefaults[ArgsPublishParseSnapshotTenant]

	Store  database.Store
	Logger *slog.Logger
}

func (w *WorkerPublishParseSnapshotTenant) Work(ctx context.Context, job *river.Job[ArgsPublishParseSnapshotTenant]) error {
	args := job.Args
	start := time.Now()

	// Resolve tenant ParseConfig for cohort mode.
	cohortMode := string(parsepolicy.CohortModeSpec)
	if args.TenantID != uuid.Nil {
		ctx = servicetenant.WithTenantID(ctx, args.TenantID)
		tenant, err := w.Store.GetTenantByID(ctx, args.TenantID)
		if err == nil && len(tenant.ParseConfig) > 0 {
			if isParseDisabled(tenant.ParseConfig) {
				w.Logger.Debug("tenant parses disabled, skipping snapshot",
					slog.String("tenant_id", args.TenantID.String()),
				)
				_ = river.RecordOutput(ctx, map[string]any{
					"tenant_id": args.TenantID.String(),
					"skipped":   true,
					"reason":    "disabled",
				})
				return nil
			}
			var pc struct {
				CohortMode string `json:"cohort_mode"`
			}
			if err := json.Unmarshal(tenant.ParseConfig, &pc); err == nil && pc.CohortMode != "" {
				cohortMode = pc.CohortMode
			}
		}
	}

	cutoff := pgtype.Timestamptz{Time: args.Cutoff, Valid: true}
	var windowStart pgtype.Timestamptz
	if args.LookbackDays > 0 {
		ws := args.Cutoff.AddDate(0, 0, -int(args.LookbackDays))
		windowStart = pgtype.Timestamptz{Time: ws, Valid: true}
	}

	// Idempotency guard: if a published snapshot already exists for today's
	// cutoff and the full key, exit immediately. This makes hourly ticks and
	// server restarts cheap no-ops once the day's snapshot is published.
	_, alreadyErr := w.Store.GetPublishedSnapshotForCutoff(ctx, database.GetPublishedSnapshotForCutoffParams{
		TenantID:      args.TenantID,
		LookbackDays:  args.LookbackDays,
		CohortMode:    cohortMode,
		PolicyVersion: args.PolicyVersion,
		QueryVersion:  snapshotQueryVersion,
		Cutoff:        cutoff,
	})
	if alreadyErr == nil {
		w.Logger.Debug("skipping already-published snapshot for cutoff",
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
	// pgx.ErrNoRows means no snapshot for today — proceed.

	// Compute source stats for the staleness guard.
	// Uses the same eligibility filter as BatchInsertSnapshotMembersFromRankings
	// (see GetSnapshotSourceStats in database/queries/parses.sql).
	sourceStats, err := w.Store.GetSnapshotSourceStats(ctx, database.GetSnapshotSourceStatsParams{
		Cutoff:      cutoff,
		WindowStart: windowStart,
	})
	if err != nil {
		return fmt.Errorf("get source stats: %w", err)
	}

	// Staleness guard: skip if the latest published snapshot for the same
	// key dimensions already has identical source_row_count and source_watermark.
	// Consumers fall back to the older snapshot with identical data.
	// Admin backfills skip this guard — a past-day snapshot is meaningful even
	// if the source stats match a previous snapshot.
	if !args.AdminBackfill {
		prev, prevErr := w.Store.GetLatestPublishedSnapshotForGuard(ctx, database.GetLatestPublishedSnapshotForGuardParams{
			TenantID:      args.TenantID,
			LookbackDays:  args.LookbackDays,
			CohortMode:    cohortMode,
			PolicyVersion: args.PolicyVersion,
			QueryVersion:  snapshotQueryVersion,
		})
		if prevErr == nil {
			watermarkMatch := prev.SourceWatermark.Valid == sourceStats.Watermark.Valid &&
				(!prev.SourceWatermark.Valid || prev.SourceWatermark.Time.Equal(sourceStats.Watermark.Time))
			if prev.SourceRowCount == sourceStats.RowCount && watermarkMatch {
				w.Logger.Debug("skipping unchanged parse snapshot",
					slog.String("tenant_id", args.TenantID.String()),
					slog.Int("lookback_days", int(args.LookbackDays)),
					slog.Int64("source_row_count", sourceStats.RowCount),
				)
				_ = river.RecordOutput(ctx, map[string]any{
					"tenant_id":        args.TenantID.String(),
					"skipped":          true,
					"reason":           "unchanged",
					"source_row_count": sourceStats.RowCount,
				})
				return nil
			}
		}
		// pgx.ErrNoRows means no previous snapshot — proceed to publish.
	}

	var memberCount int64
	txErr := w.Store.InTx(ctx, func(tx database.Store) error {
		// 1. Create a pending snapshot with source stats.
		snap, err := tx.InsertRankingSnapshot(ctx, database.InsertRankingSnapshotParams{
			TenantID:            args.TenantID,
			Cutoff:              cutoff,
			WindowStart:         windowStart,
			LookbackDays:        args.LookbackDays,
			CohortMode:          cohortMode,
			PolicyVersion:       args.PolicyVersion,
			QueryVersion:        snapshotQueryVersion,
			MinParserVersionNum: 0,
			MinAddonVersionNum:  0,
			SourceRowCount:      sourceStats.RowCount,
			SourceWatermark:     sourceStats.Watermark,
		})
		if err != nil {
			return fmt.Errorf("insert snapshot: %w", err)
		}

		// 2. Bulk-populate members from rankings.
		if err := tx.BatchInsertSnapshotMembersFromRankings(ctx, snap.ID); err != nil {
			return fmt.Errorf("batch insert members: %w", err)
		}

		// 3. Count members.
		memberCount, err = tx.CountSnapshotMembers(ctx, snap.ID)
		if err != nil {
			return fmt.Errorf("count members: %w", err)
		}

		// 4. Publish the snapshot.
		if _, err := tx.PublishRankingSnapshot(ctx, snap.ID); err != nil {
			return fmt.Errorf("publish snapshot: %w", err)
		}

		return nil
	}, &pgx.TxOptions{})
	if txErr != nil {
		return txErr
	}

	duration := time.Since(start)
	w.Logger.Info("published parse snapshot",
		slog.String("tenant_id", args.TenantID.String()),
		slog.Int("lookback_days", int(args.LookbackDays)),
		slog.Int64("member_count", memberCount),
		slog.Int64("source_row_count", sourceStats.RowCount),
		slog.Duration("duration", duration),
	)

	_ = river.RecordOutput(ctx, map[string]any{
		"tenant_id":        args.TenantID.String(),
		"lookback_days":    args.LookbackDays,
		"member_count":     memberCount,
		"source_row_count": sourceStats.RowCount,
		"duration_ms":      duration.Milliseconds(),
	})

	return nil
}

// ---------------------------------------------------------------------------
// EnqueueParseSnapshotBackfill enqueues a per-tenant snapshot publication job
// with explicit parameters. This is the backfill entry point for admin tooling
// (the HTTP endpoint is planned for #182).
// ---------------------------------------------------------------------------

// EnqueueParseSnapshotBackfill enqueues the normal idempotent per-tenant
// snapshot publication job. day is truncated to 00:00 UTC; the job will no-op
// if a snapshot for that cutoff already exists.
//
// When day is not today, AdminBackfill is set so the staleness guard is skipped
// (a past-day snapshot is meaningful even if source stats match a previous one).
func EnqueueParseSnapshotBackfill(
	ctx context.Context,
	queue *riverqueue.Queues,
	tenantID uuid.UUID,
	day time.Time,
	lookbackDays int32,
	policyVersion int16,
) (*rivertype.JobInsertResult, error) {
	cutoff := truncateToUTCMidnight(day)
	adminBackfill := cutoff.Before(todayUTCMidnight())
	return queue.Insert(ctx, ArgsPublishParseSnapshotTenant{
		TenantID:      tenantID,
		Cutoff:        cutoff,
		LookbackDays:  lookbackDays,
		PolicyVersion: policyVersion,
		AdminBackfill: adminBackfill,
	}, nil)
}

// truncateToUTCMidnight returns 00:00 UTC of the given day.
func truncateToUTCMidnight(t time.Time) time.Time {
	t = t.UTC()
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

// todayUTCMidnight returns 00:00 UTC of the current day.
func todayUTCMidnight() time.Time {
	now := time.Now().UTC()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}
