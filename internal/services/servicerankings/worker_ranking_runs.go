package servicerankings

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const (
	defaultRankingRunRepairLimit = int32(500)
	rankingRunRepairCutoff       = time.Hour
	rankingRunRepairContinuation = time.Minute
)

type RefreshRankingRunsOutput struct {
	AffectedIDCount  int   `json:"affected_id_count"`
	ResolvedRunCount int   `json:"resolved_run_count"`
	CreatedCount     int64 `json:"created_count"`
	UpdatedCount     int64 `json:"updated_count"`
	UnchangedCount   int64 `json:"unchanged_count"`
	DeletedCount     int64 `json:"deleted_count"`
	DurationMS       int64 `json:"duration_ms"`
}

type RepairRankingRunsOutput struct {
	FullScan               bool  `json:"full_scan"`
	Limit                  int32 `json:"limit"`
	MissingCount           int   `json:"missing_count"`
	StaleCount             int   `json:"stale_count"`
	InvalidRepresentative  int   `json:"invalid_representative_count"`
	OrphanCount            int   `json:"orphan_count"`
	RefreshJobCount        int   `json:"refresh_job_count"`
	RefreshAffectedIDCount int   `json:"refresh_affected_id_count"`
	EnqueueFailureCount    int   `json:"enqueue_failure_count"`
	ContinuationEnqueued   bool  `json:"continuation_enqueued"`
	ContinuationJobID      int64 `json:"continuation_job_id,omitempty"`
	DurationMS             int64 `json:"duration_ms"`
}

type WorkerRefreshRankingRuns struct {
	river.WorkerDefaults[rankingargs.ArgsRefreshRankingRuns]
	Store  database.Store
	Logger *slog.Logger
}

func (w *WorkerRefreshRankingRuns) Work(ctx context.Context, job *river.Job[rankingargs.ArgsRefreshRankingRuns]) error {
	started := time.Now()
	output, err := RefreshRankingRuns(ctx, w.Store, job.Args.AffectedIDs)
	output.DurationMS = time.Since(started).Milliseconds()
	_ = river.RecordOutput(ctx, output)
	return err
}

func RefreshRankingRuns(ctx context.Context, store database.Store, ids []uuid.UUID) (RefreshRankingRunsOutput, error) {
	ctx = servicetenant.AdminBypass(ctx)
	affectedIDs := rankingargs.NormalizeIDs(ids)
	output := RefreshRankingRunsOutput{AffectedIDCount: len(affectedIDs)}
	if len(affectedIDs) == 0 {
		return output, nil
	}

	err := store.InTx(ctx, func(tx database.Store) error {
		if err := tx.AcquireRankingRunRefreshLock(ctx); err != nil {
			return fmt.Errorf("acquire ranking run refresh lock: %w", err)
		}
		sources, err := tx.RankingRunSources(ctx, affectedIDs)
		if err != nil {
			return fmt.Errorf("resolve ranking run sources: %w", err)
		}
		resolvedRunIDs := make([]uuid.UUID, 0, len(sources))
		representativeInstanceIDs := make([]uuid.UUID, 0, len(sources))
		for _, source := range sources {
			resolvedRunIDs = append(resolvedRunIDs, source.RunID)
			representativeInstanceIDs = append(representativeInstanceIDs, source.RepresentativeInstanceID)
		}
		if err := tx.DeleteConflictingRankingRunRepresentatives(ctx, database.DeleteConflictingRankingRunRepresentativesParams{
			RunIds:                    resolvedRunIDs,
			RepresentativeInstanceIds: representativeInstanceIDs,
		}); err != nil {
			return fmt.Errorf("release conflicting ranking run representatives: %w", err)
		}
		deleted, err := tx.DeleteObsoleteRankingRuns(ctx, database.DeleteObsoleteRankingRunsParams{
			AffectedIds:    affectedIDs,
			ResolvedRunIds: resolvedRunIDs,
		})
		if err != nil {
			return fmt.Errorf("delete obsolete ranking runs: %w", err)
		}
		output.DeletedCount = int64(len(deleted))
		output.ResolvedRunCount = len(sources)

		for _, source := range sources {
			created, err := tx.UpsertRankingRun(ctx, database.UpsertRankingRunParams(source))
			switch {
			case errors.Is(err, pgx.ErrNoRows):
				output.UnchangedCount++
			case err != nil:
				return fmt.Errorf("upsert ranking run %s: %w", source.RunID, err)
			case created:
				output.CreatedCount++
			default:
				output.UpdatedCount++
			}
		}
		return nil
	}, nil)
	return output, err
}

type WorkerRepairRankingRuns struct {
	river.WorkerDefaults[rankingargs.ArgsRepairRankingRuns]
	Store  database.Store
	Queue  *riverqueue.Queues
	Logger *slog.Logger
}

func (w *WorkerRepairRankingRuns) Work(ctx context.Context, job *river.Job[rankingargs.ArgsRepairRankingRuns]) (err error) {
	started := time.Now()
	limit := job.Args.Limit
	if limit <= 0 || limit > defaultRankingRunRepairLimit {
		limit = defaultRankingRunRepairLimit
	}
	output := RepairRankingRunsOutput{FullScan: job.Args.FullScan, Limit: limit}
	defer func() {
		output.DurationMS = time.Since(started).Milliseconds()
		_ = river.RecordOutput(ctx, output)
	}()

	ctx = servicetenant.AdminBypass(ctx)
	cutoff := database.Timestamptz(time.Now().Add(-rankingRunRepairCutoff))
	affectedIDs := make([]uuid.UUID, 0, limit)
	if job.Args.FullScan {
		rows, queryErr := w.Store.RankingRunsNeedingFullScanRepair(ctx, database.RankingRunsNeedingFullScanRepairParams{
			SourceCutoff: cutoff, QueryLimit: limit,
		})
		if queryErr != nil {
			return fmt.Errorf("discover full-scan ranking run repairs: %w", queryErr)
		}
		for _, row := range rows {
			affectedIDs = append(affectedIDs, row.RunID)
			countRankingRunRepairReason(&output, row.Missing, row.Stale, row.InvalidRepresentative)
		}
	} else {
		rows, queryErr := w.Store.RankingRunsNeedingRepair(ctx, database.RankingRunsNeedingRepairParams{
			SourceCutoff: cutoff, QueryLimit: limit,
		})
		if queryErr != nil {
			return fmt.Errorf("discover ranking run repairs: %w", queryErr)
		}
		for _, row := range rows {
			affectedIDs = append(affectedIDs, row.RunID)
			countRankingRunRepairReason(&output, row.Missing, row.Stale, row.InvalidRepresentative)
		}
	}

	remaining := limit - int32(len(affectedIDs))
	if remaining > 0 {
		orphans, queryErr := w.Store.OrphanRankingRuns(ctx, remaining)
		if queryErr != nil {
			return fmt.Errorf("discover orphan ranking runs: %w", queryErr)
		}
		affectedIDs = append(affectedIDs, orphans...)
		output.OrphanCount = len(orphans)
	}
	affectedIDs = rankingargs.NormalizeIDs(affectedIDs)
	output.RefreshAffectedIDCount = len(affectedIDs)

	if len(affectedIDs) > 0 {
		if w.Queue == nil {
			return errors.New("ranking run repair queue is not configured")
		}
		if _, insertErr := w.Queue.Insert(ctx, rankingargs.NewRefreshRankingRuns(affectedIDs...), nil); insertErr != nil {
			output.EnqueueFailureCount++
			return fmt.Errorf("enqueue ranking run refresh: %w", insertErr)
		}
		output.RefreshJobCount++
	}

	if len(affectedIDs) == int(limit) {
		if w.Queue == nil {
			return errors.New("ranking run repair queue is not configured")
		}
		continuationOpts := &river.InsertOpts{
			ScheduledAt: time.Now().Add(rankingRunRepairContinuation),
			UniqueOpts: river.UniqueOpts{
				ByState: []rivertype.JobState{
					rivertype.JobStateScheduled,
					rivertype.JobStatePending,
					rivertype.JobStateAvailable,
					rivertype.JobStateRetryable,
				},
			},
			MaxAttempts: 5,
			Queue:       riverconst.QueueRankings,
			Priority:    riverconst.PriorityLow,
		}
		result, insertErr := w.Queue.Insert(ctx, rankingargs.ArgsRepairRankingRuns{
			FullScan: job.Args.FullScan,
			Limit:    limit,
		}, continuationOpts)
		if insertErr != nil {
			output.EnqueueFailureCount++
			return fmt.Errorf("enqueue ranking run repair continuation: %w", insertErr)
		}
		output.ContinuationEnqueued = true
		output.ContinuationJobID = result.Job.ID
	}
	return nil
}

func countRankingRunRepairReason(output *RepairRankingRunsOutput, missing, stale, invalid bool) {
	if missing {
		output.MissingCount++
	}
	if stale {
		output.StaleCount++
	}
	if invalid {
		output.InvalidRepresentative++
	}
}
