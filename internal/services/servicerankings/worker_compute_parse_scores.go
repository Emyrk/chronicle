package servicerankings

import (
	"context"
	"errors"
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

// ---------------------------------------------------------------------------
// ArgsComputeParseScores — per-instance parse score computation job.
// Enqueued after a parse transaction commits.
// ---------------------------------------------------------------------------

const KindComputeParseScores = "compute-parse-scores"

type ArgsComputeParseScores struct {
	InstanceID uuid.UUID `json:"instance_id"`
	TenantID   uuid.UUID `json:"tenant_id"`
	// Attempt tracks the retry iteration for bounded retry scheduling.
	// 0 = initial, 1 = +24h, 2 = +48h (72h total), 3 = +7d (10d total).
	Attempt int `json:"attempt"`
}

func (ArgsComputeParseScores) Kind() string { return KindComputeParseScores }

func (ArgsComputeParseScores) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueRankings,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 3, // transient retries by River
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

// retryDelays defines the bounded retry schedule for missing-snapshot retries.
// Attempt 0 = immediate, then +24h, +48h (72h total), +7d (10d total).
var retryDelays = []time.Duration{
	0,              // attempt 0: immediate
	24 * time.Hour, // attempt 1: +24h
	48 * time.Hour, // attempt 2: +48h (72h total)
	7 * 24 * time.Hour, // attempt 3: +7d (10d total)
}

// maxParseScoreAttempts is the number of scheduled attempts before we stop.
// Must match len(retryDelays).
const maxParseScoreAttempts = 4

// WorkerComputeParseScores computes and persists parse scores for a single instance.
type WorkerComputeParseScores struct {
	river.WorkerDefaults[ArgsComputeParseScores]

	Store  database.Store
	Queue  *riverqueue.Queues
	Logger *slog.Logger
}

func (w *WorkerComputeParseScores) Work(ctx context.Context, job *river.Job[ArgsComputeParseScores]) error {
	ctx = servicetenant.AdminBypass(ctx)

	instanceID := job.Args.InstanceID
	tenantID := job.Args.TenantID
	attempt := job.Args.Attempt

	logger := w.Logger.With(
		slog.String("instance_id", instanceID.String()),
		slog.String("tenant_id", tenantID.String()),
		slog.Int("attempt", attempt),
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

	// Resolve the canonical historical snapshot.
	var snapshot database.RankingSnapshot
	if inst.StartTime.Valid {
		snapshot, err = w.Store.GetLatestPublishedSnapshotBefore(ctx, database.GetLatestPublishedSnapshotBeforeParams{
			TenantID:     tenantID,
			LookbackDays: int32(parsepolicy.DefaultLookbackDays),
			Before:       inst.StartTime,
		})
	} else {
		snapshot, err = w.Store.GetLatestPublishedSnapshot(ctx, database.GetLatestPublishedSnapshotParams{
			TenantID:     tenantID,
			LookbackDays: int32(parsepolicy.DefaultLookbackDays),
		})
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return w.handleNoSnapshot(ctx, logger, instanceID, tenantID, attempt)
		}
		return fmt.Errorf("resolve snapshot: %w", err)
	}

	// Load the instance's ranking rows from encounter_dps_rankings.
	rankings, err := w.Store.ListRankingsForInstance(ctx, instanceID)
	if err != nil {
		return fmt.Errorf("list rankings: %w", err)
	}

	if len(rankings) == 0 {
		logger.Debug("no rankings for instance, marking completed")
		_ = w.Store.UpdateParseScoreReceiptCompleted(ctx, database.UpdateParseScoreReceiptCompletedParams{
			SnapshotID: uuid.NullUUID{UUID: snapshot.ID, Valid: true},
			InstanceID: instanceID,
		})
		return nil
	}

	// Delete any previous results for this instance (re-computation on re-upload).
	if err := w.Store.DeleteParseScoreResultsForInstance(ctx, instanceID); err != nil {
		return fmt.Errorf("delete old results: %w", err)
	}

	snapshotCohortMode := parsepolicy.CohortMode(snapshot.CohortMode)

	// Compute and persist scores per encounter, per player, for DPS metric.
	cohortCache := make(map[string][]float64)
	var scored int

	for _, r := range rankings {
		// Determine metric value.
		metricValue := r.Dps
		metric := "dps"
		if metricValue <= 0 {
			continue
		}

		// Build cohort key.
		var playerSpec pgtype.Text
		if snapshotCohortMode == parsepolicy.CohortModeSpec {
			playerSpec = pgtype.Text{String: r.PlayerSpec, Valid: true}
		}

		bucketKey := fmt.Sprintf("%s|%s|%d|%s|%s",
			r.EncounterName, r.DifficultyName, r.MaxPlayers,
			r.PlayerClass, playerSpec.String)

		cohort, cached := cohortCache[bucketKey]
		if !cached {
			cohortRows, cErr := w.Store.GetSnapshotCohortValues(ctx, database.GetSnapshotCohortValuesParams{
				Metric:         metric,
				SnapshotID:     snapshot.ID,
				EncounterName:  r.EncounterName,
				DifficultyName: r.DifficultyName,
				MaxPlayers:     r.MaxPlayers,
				PlayerClass:    r.PlayerClass,
				PlayerSpec:     playerSpec,
			})
			if cErr != nil {
				logger.Error("failed to load cohort",
					"encounter", r.EncounterName,
					"error", cErr,
				)
				continue
			}
			cohort = make([]float64, 0, len(cohortRows))
			for _, cr := range cohortRows {
				if v, ok := toFloat64(cr.MetricValue); ok && v > 0 {
					cohort = append(cohort, v)
				}
			}
			cohortCache[bucketKey] = cohort
		}

		scoreResult, ok := parsepolicy.Score(cohort, metricValue)
		if !ok {
			continue
		}

		if err := w.Store.InsertParseScoreResult(ctx, database.InsertParseScoreResultParams{
			TenantID:      tenantID,
			InstanceID:    instanceID,
			RunID:         inst.RunID,
			SnapshotID:    snapshot.ID,
			EncounterName: r.EncounterName,
			PlayerGuid:    r.PlayerGuid,
			PlayerName:    r.PlayerName,
			PlayerClass:   r.PlayerClass,
			PlayerSpec:    r.PlayerSpec,
			PlayerRole:    r.PlayerRole,
			Metric:        metric,
			MetricValue:   metricValue,
			PreciseScore:  scoreResult.PreciseScore,
			DisplayScore:  int16(scoreResult.DisplayScore),
			Rank:          int32(scoreResult.Rank),
			SampleSize:    int32(scoreResult.SampleSize),
			Status:        string(scoreResult.Status),
			InstanceName:  inst.InstanceName,
			DifficultyName: inst.DifficultyName,
			MaxPlayers:    int16(inst.MaxPlayers),
			KilledAt:      r.KilledAt,
		}); err != nil {
			return fmt.Errorf("insert score result: %w", err)
		}
		scored++
	}

	// Mark receipt as completed.
	_ = w.Store.UpdateParseScoreReceiptCompleted(ctx, database.UpdateParseScoreReceiptCompletedParams{
		SnapshotID: uuid.NullUUID{UUID: snapshot.ID, Valid: true},
		InstanceID: instanceID,
	})

	logger.Info("computed parse scores",
		slog.Int("scored", scored),
		slog.String("snapshot_id", snapshot.ID.String()),
	)

	return nil
}

// handleNoSnapshot handles the case when no published snapshot exists yet.
// It schedules a retry job if within the bounded retry limit, or marks failed.
func (w *WorkerComputeParseScores) handleNoSnapshot(
	ctx context.Context,
	logger *slog.Logger,
	instanceID, tenantID uuid.UUID,
	attempt int,
) error {
	nextAttempt := attempt + 1
	if nextAttempt >= maxParseScoreAttempts {
		logger.Warn("exhausted retry attempts, marking failed")
		_ = w.Store.UpdateParseScoreReceiptFailed(ctx, database.UpdateParseScoreReceiptFailedParams{
			InstanceID:   instanceID,
			ErrorMessage: pgtype.Text{String: "no snapshot available after all retries", Valid: true},
		})
		return nil
	}

	delay := retryDelays[nextAttempt]
	nextTime := time.Now().Add(delay)

	_ = w.Store.UpdateParseScoreReceiptNoSnapshot(ctx, database.UpdateParseScoreReceiptNoSnapshotParams{
		InstanceID:    instanceID,
		NextAttemptAt: pgtype.Timestamptz{Time: nextTime, Valid: true},
		ErrorMessage:  pgtype.Text{String: "no published snapshot available", Valid: true},
	})

	// Enqueue a follow-up job scheduled at the delay time.
	if w.Queue == nil {
		logger.Warn("no queue available, cannot schedule retry")
		return nil
	}
	_, err := w.Queue.Insert(ctx, ArgsComputeParseScores{
		InstanceID: instanceID,
		TenantID:   tenantID,
		Attempt:    nextAttempt,
	}, &river.InsertOpts{
		ScheduledAt: nextTime,
	})
	if err != nil {
		return fmt.Errorf("enqueue retry: %w", err)
	}

	logger.Info("no snapshot available, scheduled retry",
		slog.Int("next_attempt", nextAttempt),
		slog.Time("scheduled_at", nextTime),
	)

	return nil
}

// ---------------------------------------------------------------------------
// ArgsRepairParseScores — daily bounded repair dispatcher.
// Finds receipts that need retry and re-enqueues compute jobs.
// ---------------------------------------------------------------------------

const KindRepairParseScores = "repair-parse-scores"

type ArgsRepairParseScores struct{}

func (ArgsRepairParseScores) Kind() string { return KindRepairParseScores }

func (ArgsRepairParseScores) InsertOpts() river.InsertOpts {
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

// WorkerRepairParseScores scans for receipts that need retry and re-enqueues jobs.
type WorkerRepairParseScores struct {
	river.WorkerDefaults[ArgsRepairParseScores]

	Store  database.Store
	Queue  *riverqueue.Queues
	Logger *slog.Logger
}

func (w *WorkerRepairParseScores) Work(ctx context.Context, _ *river.Job[ArgsRepairParseScores]) error {
	ctx = servicetenant.AdminBypass(ctx)

	receipts, err := w.Store.ListParseScoreReceiptsForRetry(ctx, 100)
	if err != nil {
		return fmt.Errorf("list receipts for retry: %w", err)
	}

	if len(receipts) == 0 {
		w.Logger.Debug("no parse score receipts need repair")
		return nil
	}

	var enqueued int
	for _, r := range receipts {
		_, err := w.Queue.Insert(ctx, ArgsComputeParseScores{
			InstanceID: r.InstanceID,
			TenantID:   r.TenantID,
			Attempt:    int(r.Attempt),
		}, nil)
		if err != nil {
			w.Logger.Error("failed to enqueue repair job",
				"instance_id", r.InstanceID.String(),
				"error", err,
			)
			continue
		}
		enqueued++
	}

	w.Logger.Info("repair dispatcher completed",
		slog.Int("found", len(receipts)),
		slog.Int("enqueued", enqueued),
	)

	return nil
}
