package servicerankings

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/parseargs"
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

// RetryDelays defines the bounded retry schedule for missing-snapshot retries.
// Attempt 0 = immediate, then +24h, +48h (72h total), +7d (10d total).
var RetryDelays = []time.Duration{
	0,                  // attempt 0: immediate
	24 * time.Hour,     // attempt 1: +24h
	48 * time.Hour,     // attempt 2: +48h (72h total)
	7 * 24 * time.Hour, // attempt 3: +7d (10d total)
}

// MaxParseScoreAttempts is the number of scheduled attempts before we stop.
const MaxParseScoreAttempts = 4

// MissingSnapshotRetryWindow bounds retries for historical instances. Once an
// instance is older than the full retry schedule, a future snapshot cannot
// become its canonical historical snapshot without an explicit backfill.
const MissingSnapshotRetryWindow = 10 * 24 * time.Hour

const (
	RetryReasonNoPublishedSnapshot      = "no_published_snapshot"
	RetryReasonNoCompatibleSnapshot     = "no_compatible_snapshot"
	RetryReasonNoSnapshotBeforeInstance = "no_snapshot_before_instance"
	RetryReasonNoEligibleSnapshot       = "no_eligible_snapshot"
	RetryReasonInstanceTooOld           = "instance_older_than_retry_window"
)

// RepairLookbackDays bounds automatic repair to recent instances. Older parse
// history is preserved as-is when snapshots are deleted, and missing old
// projections are not backfilled automatically.
const RepairLookbackDays = 30

// QueryVersion is bumped when the SQL query semantics change (e.g. cohort
// selection, snapshot membership filters). This is separate from PolicyVersion
// which tracks scoring algorithm changes.
const QueryVersion = parsepolicy.QueryVersion

// WorkerComputeParseScores computes and persists parse scores for a single instance.
type WorkerComputeParseScores struct {
	river.WorkerDefaults[parseargs.ArgsComputeParseScores]

	Store  database.Store
	Queue  *riverqueue.Queues
	Logger *slog.Logger
}

func (w *WorkerComputeParseScores) Work(ctx context.Context, job *river.Job[parseargs.ArgsComputeParseScores]) error {
	instanceID := job.Args.InstanceID
	tenantID := job.Args.TenantID
	if tenantID != uuid.Nil {
		ctx = servicetenant.WithTenantID(ctx, tenantID)
	}

	logger := w.Logger.With(
		slog.String("instance_id", instanceID.String()),
		slog.String("tenant_id", tenantID.String()),
	)

	return w.Store.InTx(ctx, func(tx database.Store) error {
		if err := tx.AcquireParseScoreLock(ctx, instanceID.String()); err != nil {
			return fmt.Errorf("acquire parse score lock: %w", err)
		}

		// Any successful receipt, including a legacy snapshot-backed receipt, is
		// authoritative. The membership cutover must not rewrite persisted history.
		if _, err := tx.GetAnyParseScoreReceiptForTenantInstance(ctx, database.GetAnyParseScoreReceiptForTenantInstanceParams{
			TenantID: tenantID, InstanceID: instanceID,
		}); err == nil {
			return nil
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("get existing parse score receipt: %w", err)
		}

		inst, err := tx.GetLogInstanceForScoring(ctx, instanceID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return river.JobCancel(fmt.Errorf("instance %s not found or invalidated", instanceID))
			}
			return fmt.Errorf("get instance: %w", err)
		}
		if !inst.StartTime.Valid {
			return river.JobCancel(fmt.Errorf("instance %s has no start time", instanceID))
		}

		cohortMode := parsepolicy.CohortModeSpec
		if tenantID != uuid.Nil {
			tenant, tenantErr := tx.GetTenantByID(ctx, tenantID)
			if tenantErr != nil {
				return fmt.Errorf("get tenant parse config: %w", tenantErr)
			}
			if len(tenant.ParseConfig) > 0 {
				var config struct {
					CohortMode parsepolicy.CohortMode `json:"cohort_mode"`
				}
				if err := json.Unmarshal(tenant.ParseConfig, &config); err != nil {
					return fmt.Errorf("decode tenant parse config: %w", err)
				}
				if config.CohortMode != "" {
					cohortMode = config.CohortMode
				}
			}
		}
		if cohortMode == parsepolicy.CohortModeDisabled {
			return river.JobCancel(fmt.Errorf("parse scoring disabled for tenant %s", tenantID))
		}

		cutoff := inst.StartTime.Time.UTC()
		windowStart := cutoff.AddDate(0, 0, -int(parsepolicy.DefaultLookbackDays))
		cutoffDB := pgtype.Timestamptz{Time: cutoff, Valid: true}
		windowStartDB := pgtype.Timestamptz{Time: windowStart, Valid: true}

		rankings, err := tx.ListRankingsForInstance(ctx, instanceID)
		if err != nil {
			return fmt.Errorf("list rankings: %w", err)
		}
		sourceCount := len(rankings)

		if err := tx.DeleteParseScoreResultsForTenantInstance(ctx, database.DeleteParseScoreResultsForTenantInstanceParams{
			TenantID: tenantID, InstanceID: instanceID,
		}); err != nil {
			return fmt.Errorf("delete incomplete results: %w", err)
		}

		dpsCohortCache := make(map[string][]float64)
		hpsCohortCache := make(map[string][]float64)
		logGroupID := uuid.NullUUID{UUID: inst.LogGroupID, Valid: inst.LogGroupID != uuid.Nil}
		var scored int

		for _, ranking := range rankings {
			metrics := []struct {
				name  string
				value float64
				cache map[string][]float64
			}{
				{name: "dps", value: ranking.Dps, cache: dpsCohortCache},
				{name: "hps", value: ranking.Hps, cache: hpsCohortCache},
			}
			for _, metric := range metrics {
				if metric.value <= 0 {
					continue
				}
				key := fmt.Sprintf("%s|%s|%d|%s|%s|%s", ranking.EncounterName,
					ranking.DifficultyName, ranking.MaxPlayers, ranking.PlayerClass,
					ranking.PlayerSpec, ranking.PlayerSubSpec)
				cohort, ok := metric.cache[key]
				if !ok {
					cohort, err = tx.GetParseScoreMembershipCohort(ctx, database.GetParseScoreMembershipCohortParams{
						Metric: metric.name, TenantID: tenantID,
						PolicyVersion: int16(parsepolicy.PolicyVersion), QueryVersion: int16(QueryVersion),
						Cutoff: cutoffDB, WindowStart: windowStartDB, ExcludeRunID: inst.RunID,
						InstanceName: inst.InstanceName, EncounterName: ranking.EncounterName,
						DifficultyName: ranking.DifficultyName, MaxPlayers: ranking.MaxPlayers,
						PlayerClass: ranking.PlayerClass, CohortMode: string(cohortMode),
						PlayerSpec: ranking.PlayerSpec, PlayerSubSpec: ranking.PlayerSubSpec,
					})
					if err != nil {
						return fmt.Errorf("load %s membership cohort for encounter %q: %w", metric.name, ranking.EncounterName, err)
					}
					metric.cache[key] = cohort
				}

				scoreResult, scoreOK := parsepolicy.Score(cohort, metric.value)
				if !scoreOK && scoreResult.Status != parsepolicy.StatusSampleTooSmall {
					continue
				}
				preciseScore := scoreResult.PreciseScore
				displayScore := int16(scoreResult.DisplayScore)
				rank := int32(scoreResult.Rank)
				if !scoreOK {
					preciseScore, displayScore, rank = 0, 0, 0
				}
				if err := tx.InsertParseScoreResult(ctx, database.InsertParseScoreResultParams{
					TenantID: tenantID, InstanceID: instanceID, RunID: inst.RunID,
					SnapshotID: uuid.NullUUID{}, LogGroupID: logGroupID, GuildID: inst.GuildID,
					EncounterName: ranking.EncounterName, PlayerGuid: ranking.PlayerGuid,
					PlayerName: ranking.PlayerName, PlayerClass: ranking.PlayerClass,
					PlayerSpec: ranking.PlayerSpec, PlayerSubSpec: ranking.PlayerSubSpec,
					PlayerRole: ranking.PlayerRole, Metric: metric.name, MetricValue: metric.value,
					PreciseScore: preciseScore, DisplayScore: displayScore, Rank: rank,
					SampleSize: int32(scoreResult.SampleSize), Status: string(scoreResult.Status),
					InstanceName: inst.InstanceName, DifficultyName: inst.DifficultyName,
					MaxPlayers: int16(inst.MaxPlayers), KilledAt: ranking.KilledAt,
				}); err != nil {
					return fmt.Errorf("insert %s score result: %w", metric.name, err)
				}
				scored++
			}
		}

		if _, err := tx.InsertWindowedParseScoreReceipt(ctx, database.InsertWindowedParseScoreReceiptParams{
			TenantID: tenantID, InstanceID: instanceID,
			PolicyVersion: int16(parsepolicy.PolicyVersion), QueryVersion: int16(QueryVersion),
			LookbackDays: int16(parsepolicy.DefaultLookbackDays), SourceCount: int32(sourceCount),
			ResultCount: int32(scored), Cutoff: cutoffDB, WindowStart: windowStartDB,
			CohortMode: pgtype.Text{String: string(cohortMode), Valid: true},
		}); err != nil {
			return fmt.Errorf("insert windowed parse score receipt: %w", err)
		}

		logger.Info("computed windowed parse scores", slog.Int("source_count", sourceCount), slog.Int("result_count", scored))
		return nil
	}, nil)
}

// diagnoseMissingSnapshot distinguishes the common reasons the canonical
// scoring lookup returned no rows. Diagnostics are best-effort and must not
// turn a missing snapshot into a failed River job.
func (w *WorkerComputeParseScores) diagnoseMissingSnapshot(
	ctx context.Context,
	logger *slog.Logger,
	tenantID uuid.UUID,
	instanceStart pgtype.Timestamptz,
) string {
	if instanceStart.Valid {
		_, err := w.Store.GetScoringSnapshotLatest(ctx, database.GetScoringSnapshotLatestParams{
			TenantID:      tenantID,
			LookbackDays:  int32(parsepolicy.DefaultLookbackDays),
			PolicyVersion: int16(parsepolicy.PolicyVersion),
			QueryVersion:  int16(QueryVersion),
		})
		if err == nil {
			return RetryReasonNoSnapshotBeforeInstance
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			logger.Warn("failed to diagnose compatible parse snapshot", slog.Any("error", err))
			return RetryReasonNoEligibleSnapshot
		}
	}

	latest, err := w.Store.GetLatestPublishedSnapshot(ctx, database.GetLatestPublishedSnapshotParams{
		TenantID:     tenantID,
		LookbackDays: int32(parsepolicy.DefaultLookbackDays),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return RetryReasonNoPublishedSnapshot
	}
	if err != nil {
		logger.Warn("failed to diagnose latest parse snapshot", slog.Any("error", err))
		return RetryReasonNoEligibleSnapshot
	}

	logger.Info("latest parse snapshot is incompatible with scoring worker",
		slog.Int("snapshot_policy_version", int(latest.PolicyVersion)),
		slog.Int("snapshot_query_version", int(latest.QueryVersion)),
		slog.Int("required_policy_version", int(parsepolicy.PolicyVersion)),
		slog.Int("required_query_version", QueryVersion),
	)
	return RetryReasonNoCompatibleSnapshot
}

// handleNoSnapshot handles the case when no eligible published snapshot exists.
// It schedules a retry job if the instance and attempt are within the bounded
// retry limit. No receipt is created; only successful completions produce one.
func (w *WorkerComputeParseScores) handleNoSnapshot(
	ctx context.Context,
	logger *slog.Logger,
	instanceID, tenantID uuid.UUID,
	instanceStart pgtype.Timestamptz,
	attempt int,
	reason string,
) error {
	now := time.Now()
	if instanceStart.Valid && instanceStart.Time.Before(now.Add(-MissingSnapshotRetryWindow)) {
		reason = RetryReasonInstanceTooOld
		logger.Info("instance predates parse snapshot retry window, stopping retry chain",
			slog.String("reason", reason),
			slog.Time("instance_start", instanceStart.Time),
			slog.Duration("retry_window", MissingSnapshotRetryWindow),
		)
		_ = river.RecordOutput(ctx, map[string]any{
			"reason":         reason,
			"instance_start": instanceStart.Time,
			"retry_stopped":  true,
		})
		return nil
	}

	nextAttempt := attempt + 1
	if nextAttempt >= MaxParseScoreAttempts {
		logger.Warn("exhausted retry attempts for missing snapshot, stopping retry chain",
			slog.Int("total_attempts", nextAttempt),
			slog.String("reason", reason),
		)
		_ = river.RecordOutput(ctx, map[string]any{
			"reason":        reason,
			"retry_stopped": true,
		})
		// No receipt created. Daily repair will re-enqueue only when
		// an eligible snapshot becomes available.
		return nil
	}

	delay := RetryDelays[nextAttempt]
	nextTime := now.Add(delay)

	// Enqueue a follow-up job scheduled at the delay time.
	if w.Queue == nil {
		logger.Warn("no queue available, cannot schedule retry", slog.String("reason", reason))
		return nil
	}
	_, err := w.Queue.Insert(ctx, parseargs.ArgsComputeParseScores{
		InstanceID:  instanceID,
		TenantID:    tenantID,
		Attempt:     nextAttempt,
		RetryReason: reason,
	}, &river.InsertOpts{
		ScheduledAt: nextTime,
	})
	if err != nil {
		logger.Error("failed to enqueue retry job",
			"error", err,
			"next_attempt", nextAttempt,
			"reason", reason,
		)
		// Don't fail the job; daily repair will catch it.
		return nil
	}

	logger.Info("no snapshot available, scheduled retry",
		slog.Int("next_attempt", nextAttempt),
		slog.Time("scheduled_at", nextTime),
		slog.String("reason", reason),
	)
	_ = river.RecordOutput(ctx, map[string]any{
		"reason":          reason,
		"next_attempt":    nextAttempt,
		"scheduled_at":    nextTime,
		"retry_scheduled": true,
	})

	return nil
}

// ---------------------------------------------------------------------------
// ArgsDispatchParseScoreRepairs — daily tenant fan-out.
// ---------------------------------------------------------------------------

const KindDispatchParseScoreRepairs = "dispatch-parse-score-repairs"

type ArgsDispatchParseScoreRepairs struct{}

func (ArgsDispatchParseScoreRepairs) Kind() string { return KindDispatchParseScoreRepairs }

func (ArgsDispatchParseScoreRepairs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRankings,
		Priority:    riverconst.PriorityLow,
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

type WorkerDispatchParseScoreRepairs struct {
	river.WorkerDefaults[ArgsDispatchParseScoreRepairs]

	Store  database.Store
	Queue  *riverqueue.Queues
	Logger *slog.Logger
}

func (w *WorkerDispatchParseScoreRepairs) Work(ctx context.Context, _ *river.Job[ArgsDispatchParseScoreRepairs]) error {
	ctx = servicetenant.AdminBypass(ctx)
	if w.Queue == nil {
		w.Logger.Warn("no queue available for parse score repair fan-out")
		return nil
	}

	tenants, err := w.Store.ListTenants(ctx)
	if err != nil {
		return fmt.Errorf("list tenants for parse score repair: %w", err)
	}

	tenantIDs := make([]uuid.UUID, 0, len(tenants)+1)
	tenantIDs = append(tenantIDs, uuid.Nil)
	for _, tenant := range tenants {
		if isParseDisabled(tenant.ParseConfig) {
			continue
		}
		tenantIDs = append(tenantIDs, tenant.ID)
	}

	enqueued := 0
	for _, tenantID := range tenantIDs {
		if _, err := w.Queue.Insert(ctx, ArgsRepairParseScores{TenantID: tenantID}, nil); err != nil {
			w.Logger.Error("failed to enqueue tenant parse score repair",
				slog.String("tenant_id", tenantID.String()),
				slog.String("error", err.Error()),
			)
			continue
		}
		enqueued++
	}

	_ = river.RecordOutput(ctx, map[string]any{
		"tenants":  len(tenantIDs),
		"enqueued": enqueued,
	})
	return nil
}

// ---------------------------------------------------------------------------
// ArgsRepairParseScores — daily bounded repair dispatcher.
// Finds ALL eligible instances missing a matching successful receipt,
// including instances with no receipt at all, old instances, snapshot
// deletion/rebuild, and policy/query changes.
// ---------------------------------------------------------------------------

const KindRepairParseScores = "repair-parse-scores"

type ArgsRepairParseScores struct {
	TenantID uuid.UUID `json:"tenant_id"`
}

func (ArgsRepairParseScores) Kind() string { return KindRepairParseScores }

func (ArgsRepairParseScores) InsertOpts() river.InsertOpts {
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

// WorkerRepairParseScores finds instances missing receipts and re-enqueues jobs.
type WorkerRepairParseScores struct {
	river.WorkerDefaults[ArgsRepairParseScores]

	Store  database.Store
	Queue  *riverqueue.Queues
	Logger *slog.Logger
}

func (w *WorkerRepairParseScores) Work(ctx context.Context, job *river.Job[ArgsRepairParseScores]) error {
	tenantID := job.Args.TenantID
	if tenantID != uuid.Nil {
		ctx = servicetenant.WithTenantID(ctx, tenantID)
	}

	if w.Queue == nil {
		w.Logger.Warn("no queue available for repair dispatcher")
		return nil
	}

	// Only instances with no successful receipt are eligible. Legacy
	// snapshot-backed receipts remain authoritative across the cutover.
	missing, err := w.Store.ListInstancesMissingParseReceiptWindowed(ctx, database.ListInstancesMissingParseReceiptWindowedParams{
		TenantID:    tenantID,
		RepairSince: pgtype.Timestamptz{Time: time.Now().AddDate(0, 0, -RepairLookbackDays), Valid: true},
		MaxRows:     100,
	})
	if err != nil {
		return fmt.Errorf("list missing receipts: %w", err)
	}

	if len(missing) == 0 {
		w.Logger.Debug("no instances need parse score repair")
		return nil
	}

	var enqueued int
	for _, m := range missing {
		_, iErr := w.Queue.Insert(ctx, parseargs.ArgsComputeParseScores{
			InstanceID: m.InstanceID,
			TenantID:   tenantID,
			Attempt:    0, // Fresh attempt — repair found an eligible snapshot.
		}, nil)
		if iErr != nil {
			w.Logger.Error("failed to enqueue repair job",
				"instance_id", m.InstanceID.String(),
				"error", iErr,
			)
			continue
		}
		enqueued++
	}

	w.Logger.Info("repair dispatcher completed",
		slog.Int("missing", len(missing)),
		slog.Int("enqueued", enqueued),
	)

	return nil
}
