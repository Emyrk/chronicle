package servicerankings

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/rankingargs"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

type rankingRunSummaryJobInserter interface {
	Insert(context.Context, river.JobArgs, *river.InsertOpts) (*rivertype.JobInsertResult, error)
}

// WorkerBackfillRankingRunSummaries advances a persisted backfill by one bounded
// batch. Each continuation is delayed, so one queue worker cannot create an
// unbounded source scan or WAL burst.
type WorkerBackfillRankingRunSummaries struct {
	river.WorkerDefaults[rankingargs.ArgsBackfillRankingRunSummaries]

	Store  database.Store
	Queue  rankingRunSummaryJobInserter
	Logger *slog.Logger
}

func (w *WorkerBackfillRankingRunSummaries) Work(ctx context.Context, job *river.Job[rankingargs.ArgsBackfillRankingRunSummaries]) (workErr error) {
	ctx = servicetenant.AdminBypass(ctx)
	plan, err := w.Store.GetRankingSummaryBackfill(ctx, job.Args.BackfillID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("get ranking summary backfill: %w", err)
	}
	if plan.Status != "running" {
		return nil
	}
	defer func() {
		if workErr != nil {
			_ = w.Store.FailRankingSummaryBackfill(ctx, database.FailRankingSummaryBackfillParams{
				ID: job.Args.BackfillID, ErrorMessage: pgtype.Text{String: workErr.Error(), Valid: true},
			})
		}
	}()

	runIDs, err := w.Store.MarkRankingSummaryBackfillBatch(ctx, job.Args.BackfillID)
	if err != nil {
		return fmt.Errorf("mark ranking summary backfill batch dirty: %w", err)
	}
	nextCursor := plan.CursorRunID
	if len(runIDs) > 0 {
		nextCursor = runIDs[len(runIDs)-1]
		if _, err := w.Queue.Insert(ctx, rankingargs.ArgsRebuildRankingRunSummaries{}, nil); err != nil {
			return fmt.Errorf("wake ranking run summary rebuild: %w", err)
		}
	}
	complete := len(runIDs) < int(plan.BatchSize)
	updated, err := w.Store.AdvanceRankingSummaryBackfill(ctx, database.AdvanceRankingSummaryBackfillParams{
		ID: job.Args.BackfillID, CursorRunID: nextCursor,
		RunsMarkedDirty: int64(len(runIDs)), Complete: complete,
	})
	if err != nil {
		return fmt.Errorf("advance ranking summary backfill: %w", err)
	}

	if updated.Status == "running" {
		opts := &river.InsertOpts{ScheduledAt: time.Now().Add(time.Duration(updated.DelayMs) * time.Millisecond)}
		if _, err := w.Queue.Insert(ctx, rankingargs.ArgsBackfillRankingRunSummaries{BackfillID: updated.ID}, opts); err != nil {
			return fmt.Errorf("schedule next ranking summary backfill batch: %w", err)
		}
	}
	w.Logger.Info("advanced ranking summary backfill",
		slog.String("backfill_id", updated.ID.String()),
		slog.String("status", updated.Status),
		slog.Int("marked", len(runIDs)),
		slog.String("cursor_run_id", nextCursor.String()),
	)
	return nil
}
