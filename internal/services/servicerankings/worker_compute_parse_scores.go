package servicerankings

import (
	"context"
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
const QueryVersion = 1

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
	attempt := job.Args.Attempt

	logger := w.Logger.With(
		slog.String("instance_id", instanceID.String()),
		slog.String("tenant_id", tenantID.String()),
		slog.Int("attempt", attempt),
		slog.String("retry_reason", job.Args.RetryReason),
	)

	// Fetch instance metadata.
	inst, err := w.Store.GetLogInstanceForScoring(ctx, instanceID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			logger.Warn("instance not found, cancelling job")
			return river.JobCancel(fmt.Errorf("instance %s not found", instanceID))
		}
		return fmt.Errorf("get instance: %w", err)
	}

	// Resolve the canonical historical snapshot: latest published cutoff
	// <= instance start for this tenant, default lookback, AND matching
	// current policy/query version. Version filtering is done in SQL so
	// an incompatible newer snapshot cannot hide a compatible older one.
	var snapshot database.RankingSnapshot
	if inst.StartTime.Valid {
		snapshot, err = w.Store.GetScoringSnapshotBefore(ctx, database.GetScoringSnapshotBeforeParams{
			TenantID:      tenantID,
			LookbackDays:  int32(parsepolicy.DefaultLookbackDays),
			Before:        inst.StartTime,
			PolicyVersion: int16(parsepolicy.PolicyVersion),
			QueryVersion:  int16(QueryVersion),
		})
	} else {
		snapshot, err = w.Store.GetScoringSnapshotLatest(ctx, database.GetScoringSnapshotLatestParams{
			TenantID:      tenantID,
			LookbackDays:  int32(parsepolicy.DefaultLookbackDays),
			PolicyVersion: int16(parsepolicy.PolicyVersion),
			QueryVersion:  int16(QueryVersion),
		})
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			reason := w.diagnoseMissingSnapshot(ctx, logger, tenantID, inst.StartTime)
			return w.handleNoSnapshot(ctx, logger, instanceID, tenantID, inst.StartTime, attempt, reason)
		}
		return fmt.Errorf("resolve snapshot: %w", err)
	}

	// Load the instance's ranking rows from encounter_dps_rankings.
	rankings, err := w.Store.ListRankingsForInstance(ctx, instanceID)
	if err != nil {
		return fmt.Errorf("list rankings: %w", err)
	}

	sourceCount := len(rankings)

	if sourceCount == 0 {
		logger.Debug("no rankings for instance, writing empty receipt")
		// Atomic: empty receipt in a transaction.
		return w.Store.InTx(ctx, func(tx database.Store) error {
			if _, err := tx.InsertParseScoreReceipt(ctx, database.InsertParseScoreReceiptParams{
				TenantID:      tenantID,
				InstanceID:    instanceID,
				SnapshotID:    snapshot.ID,
				PolicyVersion: int16(parsepolicy.PolicyVersion),
				QueryVersion:  int16(QueryVersion),
				LookbackDays:  int16(parsepolicy.DefaultLookbackDays),
				SourceCount:   0,
				ResultCount:   0,
			}); err != nil {
				return fmt.Errorf("insert empty receipt: %w", err)
			}
			return nil
		}, nil)
	}

	snapshotCohortMode := parsepolicy.CohortMode(snapshot.CohortMode)

	// Compute and persist scores per encounter, per player, for BOTH DPS and HPS.
	// Separate cohort cache keys per metric.
	dpsCohortCache := make(map[string][]float64)
	hpsCohortCache := make(map[string][]float64)
	var scored int

	// Build identity fields for results.
	logGroupID := uuid.NullUUID{UUID: inst.LogGroupID, Valid: inst.LogGroupID != uuid.Nil}
	guildID := inst.GuildID

	scoringSnapshotID := uuid.NullUUID{UUID: snapshot.ID, Valid: true}

	// Atomic transaction: delete old results + insert new results + receipt.
	// Delete is scoped to (tenant_id, instance_id) so one tenant cannot
	// erase another's projections.
	txErr := w.Store.InTx(ctx, func(tx database.Store) error {
		// Delete previous results for this tenant+instance inside the
		// transaction so replacement is atomic.
		if dErr := tx.DeleteParseScoreResultsForTenantInstance(ctx, database.DeleteParseScoreResultsForTenantInstanceParams{
			TenantID:   tenantID,
			InstanceID: instanceID,
		}); dErr != nil {
			return fmt.Errorf("delete old results: %w", dErr)
		}

		for _, r := range rankings {
			// Score both DPS and HPS for each ranking row.
			type metricEntry struct {
				metric string
				value  float64
				cache  map[string][]float64
			}
			metrics := []metricEntry{
				{"dps", r.Dps, dpsCohortCache},
				{"hps", r.Hps, hpsCohortCache},
			}

			for _, m := range metrics {
				if m.value <= 0 {
					continue
				}

				// Build cohort key (separate per metric).
				var playerSpec pgtype.Text
				if snapshotCohortMode == parsepolicy.CohortModeSpec {
					playerSpec = pgtype.Text{String: r.PlayerSpec, Valid: true}
				}

				bucketKey := fmt.Sprintf("%s|%s|%d|%s|%s",
					r.EncounterName, r.DifficultyName, r.MaxPlayers,
					r.PlayerClass, playerSpec.String)

				cohort, cached := m.cache[bucketKey]
				if !cached {
					cohortRows, cErr := w.Store.GetSnapshotCohortValues(ctx, database.GetSnapshotCohortValuesParams{
						Metric:         m.metric,
						SnapshotID:     snapshot.ID,
						EncounterName:  r.EncounterName,
						DifficultyName: r.DifficultyName,
						MaxPlayers:     r.MaxPlayers,
						PlayerClass:    r.PlayerClass,
						PlayerSpec:     playerSpec,
					})
					if cErr != nil {
						return fmt.Errorf("load %s cohort for encounter %q: %w", m.metric, r.EncounterName, cErr)
					}
					cohort = make([]float64, 0, len(cohortRows))
					for _, cr := range cohortRows {
						if v, ok := toFloat64(cr.MetricValue); ok && v > 0 {
							cohort = append(cohort, v)
						}
					}
					m.cache[bucketKey] = cohort
				}

				scoreResult, ok := parsepolicy.Score(cohort, m.value)
				status := string(scoreResult.Status)
				if !ok {
					// Persist sample_too_small for complete accounting.
					if scoreResult.Status == parsepolicy.StatusSampleTooSmall {
						if iErr := tx.InsertParseScoreResult(ctx, database.InsertParseScoreResultParams{
							TenantID:       tenantID,
							InstanceID:     instanceID,
							RunID:          inst.RunID,
							SnapshotID:     scoringSnapshotID,
							LogGroupID:     logGroupID,
							GuildID:        guildID,
							EncounterName:  r.EncounterName,
							PlayerGuid:     r.PlayerGuid,
							PlayerName:     r.PlayerName,
							PlayerClass:    r.PlayerClass,
							PlayerSpec:     r.PlayerSpec,
							PlayerRole:     r.PlayerRole,
							Metric:         m.metric,
							MetricValue:    m.value,
							PreciseScore:   0,
							DisplayScore:   0,
							Rank:           0,
							SampleSize:     int32(scoreResult.SampleSize),
							Status:         status,
							InstanceName:   inst.InstanceName,
							DifficultyName: inst.DifficultyName,
							MaxPlayers:     int16(inst.MaxPlayers),
							KilledAt:       r.KilledAt,
						}); iErr != nil {
							return fmt.Errorf("insert sample_too_small result: %w", iErr)
						}
						scored++
					}
					continue
				}

				if iErr := tx.InsertParseScoreResult(ctx, database.InsertParseScoreResultParams{
					TenantID:       tenantID,
					InstanceID:     instanceID,
					RunID:          inst.RunID,
					SnapshotID:     scoringSnapshotID,
					LogGroupID:     logGroupID,
					GuildID:        guildID,
					EncounterName:  r.EncounterName,
					PlayerGuid:     r.PlayerGuid,
					PlayerName:     r.PlayerName,
					PlayerClass:    r.PlayerClass,
					PlayerSpec:     r.PlayerSpec,
					PlayerRole:     r.PlayerRole,
					Metric:         m.metric,
					MetricValue:    m.value,
					PreciseScore:   scoreResult.PreciseScore,
					DisplayScore:   int16(scoreResult.DisplayScore),
					Rank:           int32(scoreResult.Rank),
					SampleSize:     int32(scoreResult.SampleSize),
					Status:         status,
					InstanceName:   inst.InstanceName,
					DifficultyName: inst.DifficultyName,
					MaxPlayers:     int16(inst.MaxPlayers),
					KilledAt:       r.KilledAt,
				}); iErr != nil {
					return fmt.Errorf("insert score result: %w", iErr)
				}
				scored++
			}
		}

		// Receipt inside the same transaction: atomic with results.
		if _, rErr := tx.InsertParseScoreReceipt(ctx, database.InsertParseScoreReceiptParams{
			TenantID:      tenantID,
			InstanceID:    instanceID,
			SnapshotID:    snapshot.ID,
			PolicyVersion: int16(parsepolicy.PolicyVersion),
			QueryVersion:  int16(QueryVersion),
			LookbackDays:  int16(parsepolicy.DefaultLookbackDays),
			SourceCount:   int32(sourceCount),
			ResultCount:   int32(scored),
		}); rErr != nil {
			return fmt.Errorf("insert receipt: %w", rErr)
		}

		return nil
	}, nil)

	if txErr != nil {
		return fmt.Errorf("scoring transaction: %w", txErr)
	}

	logger.Info("computed parse scores",
		slog.Int("source_count", sourceCount),
		slog.Int("result_count", scored),
		slog.String("snapshot_id", snapshot.ID.String()),
	)

	return nil
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

	// Per-instance canonical repair resolves each recent instance's historical
	// snapshot via a LATERAL join. Instances older than RepairLookbackDays or
	// without an eligible snapshot are excluded.
	missing, err := w.Store.ListInstancesMissingParseReceiptWithSnapshot(ctx, database.ListInstancesMissingParseReceiptWithSnapshotParams{
		TenantID:      tenantID,
		LookbackDays:  int32(parsepolicy.DefaultLookbackDays),
		PolicyVersion: int16(parsepolicy.PolicyVersion),
		QueryVersion:  int16(QueryVersion),
		RepairSince:   pgtype.Timestamptz{Time: time.Now().AddDate(0, 0, -RepairLookbackDays), Valid: true},
		MaxRows:       100,
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
