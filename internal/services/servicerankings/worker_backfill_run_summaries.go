package servicerankings

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const rankingRunSummaryBackfillBatchSize = 100

type rankingRunSummaryJobInserter interface {
	Insert(context.Context, river.JobArgs, *river.InsertOpts) (*rivertype.JobInsertResult, error)
}

// WorkerBackfillRankingRunSummaries finds missing or stale logical-run
// projections in deterministic UUID batches and hands them to the dirty queue.
type WorkerBackfillRankingRunSummaries struct {
	river.WorkerDefaults[rankingargs.ArgsBackfillRankingRunSummaries]

	Store  database.Store
	Queue  rankingRunSummaryJobInserter
	Logger *slog.Logger
}

func (w *WorkerBackfillRankingRunSummaries) Work(ctx context.Context, job *river.Job[rankingargs.ArgsBackfillRankingRunSummaries]) error {
	ctx = servicetenant.AdminBypass(ctx)

	runIDs, err := w.Store.BackfillRankingRunSummaries(ctx, database.BackfillRankingRunSummariesParams{
		AfterRunID:     job.Args.AfterRunID,
		SummaryVersion: rankingPlayerRunSummaryVersion,
		BatchSize:      rankingRunSummaryBackfillBatchSize,
	})
	if err != nil {
		return fmt.Errorf("mark ranking run summary backfill batch dirty: %w", err)
	}

	var rebuildJobID, nextJobID int64
	if len(runIDs) > 0 {
		result, err := w.Queue.Insert(ctx, rankingargs.ArgsRebuildRankingRunSummaries{}, nil)
		if err != nil {
			return fmt.Errorf("wake ranking run summary rebuild: %w", err)
		}
		rebuildJobID = result.Job.ID
	}

	complete := len(runIDs) < rankingRunSummaryBackfillBatchSize
	nextCursor := job.Args.AfterRunID
	if len(runIDs) > 0 {
		nextCursor = runIDs[len(runIDs)-1]
	}
	if !complete {
		result, err := w.Queue.Insert(ctx, rankingargs.ArgsBackfillRankingRunSummaries{AfterRunID: nextCursor}, nil)
		if err != nil {
			return fmt.Errorf("enqueue next ranking run summary backfill batch: %w", err)
		}
		nextJobID = result.Job.ID
	}

	w.Logger.Info("marked ranking run summary backfill batch dirty",
		slog.Int("marked", len(runIDs)),
		slog.String("after_run_id", job.Args.AfterRunID.String()),
		slog.String("next_cursor", nextCursor.String()),
		slog.Bool("complete", complete),
		slog.Int64("rebuild_job_id", rebuildJobID),
		slog.Int64("next_job_id", nextJobID),
	)
	_ = river.RecordOutput(ctx, map[string]any{
		"marked":           len(runIDs),
		"after_run_id":     job.Args.AfterRunID,
		"next_cursor":      nextCursor,
		"complete":         complete,
		"summary_version":  rankingPlayerRunSummaryVersion,
		"rebuild_job_id":   rebuildJobID,
		"next_backfill_id": nextJobID,
	})
	return nil
}

// InitialRankingRunSummaryBackfillArgs starts a full deterministic backfill.
func InitialRankingRunSummaryBackfillArgs() rankingargs.ArgsBackfillRankingRunSummaries {
	return rankingargs.ArgsBackfillRankingRunSummaries{AfterRunID: uuid.Nil}
}
