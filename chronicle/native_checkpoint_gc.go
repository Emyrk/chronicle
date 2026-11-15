package chronicle

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
)

// Checkpoint objects below published progress can no longer acquire publication
// authority. Walk immutable predecessor metadata in bounded batches, never the
// current head. Metadata stays available for uncertain-commit reconciliation.
type ArgsNativeCheckpointGC struct {
	LogID  uuid.UUID `json:"log_group_id"`
	Cursor uuid.UUID `json:"cursor"`
}

func (ArgsNativeCheckpointGC) Kind() string { return "native-checkpoint-gc" }
func (ArgsNativeCheckpointGC) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: QueueLogFinalizing, MaxAttempts: 5, UniqueOpts: river.UniqueOpts{ByArgs: true}}
}

type workerNativeCheckpointGC struct {
	river.WorkerDefaults[ArgsNativeCheckpointGC]
	parent *Chronicle
	grace  time.Duration
	now    func() time.Time
}

func (c *Chronicle) NewWorkerNativeCheckpointGC(grace ...time.Duration) river.Worker[ArgsNativeCheckpointGC] {
	retention := 24 * time.Hour
	if len(grace) > 0 {
		retention = grace[0]
	}
	return &workerNativeCheckpointGC{parent: c, grace: retention, now: time.Now}
}
func (w *workerNativeCheckpointGC) Work(ctx context.Context, job *river.Job[ArgsNativeCheckpointGC]) error {
	if w.grace <= 0 {
		return fmt.Errorf("checkpoint GC grace must be positive")
	}
	state, err := w.parent.Zed.GetParserHandoff(ctx, job.Args.LogID)
	if err != nil {
		return err
	}
	cursor := job.Args.Cursor
	for range 32 {
		if cursor == uuid.Nil {
			return nil
		}
		attempt, err := w.parent.Zed.GetParserCheckpointAttempt(ctx, database.GetParserCheckpointAttemptParams{LogGroupID: job.Args.LogID, AttemptID: cursor})
		if err != nil {
			return err
		}
		if attempt.Iteration >= state.PublishedIteration || attempt.AttemptID == state.HeadAttemptID.UUID {
			return fmt.Errorf("checkpoint GC cursor is not obsolete")
		}
		eligibleAt := attempt.AcceptedAt.Time.Add(w.grace)
		if w.now().Before(eligibleAt) {
			return river.JobSnooze(eligibleAt.Sub(w.now()))
		}
		if _, err := w.parent.Storage.RemoveFile(ctx, BucketRaidLogs, []string{attempt.ObjectKey}); err != nil {
			return err
		}
		cursor = attempt.PredecessorAttemptID.UUID
	}
	if cursor != uuid.Nil {
		_, err := w.parent.queue.Insert(ctx, ArgsNativeCheckpointGC{LogID: job.Args.LogID, Cursor: cursor}, nil)
		return err
	}
	return nil
}
