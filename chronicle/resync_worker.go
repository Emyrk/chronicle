package chronicle

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const KindResync = "resync"

// ArgsResync is the River job args for a resync (reparse) operation.
// Jobs are enqueued on the dedicated "resync" queue so the main server
// never consumes them.
type ArgsResync struct {
	LogGroupID uuid.UUID `json:"log_group_id"`
}

func (ArgsResync) Kind() string { return KindResync }

func (ArgsResync) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueResync,
		Priority:    riverconst.PriorityDefault,
		MaxAttempts: 1,
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

// WorkerResync processes a resync job: deletes previously parsed data for the
// log group, then re-parses it by delegating to WorkerLogParse.Work.
type WorkerResync struct {
	parent *Chronicle
	river.WorkerDefaults[ArgsResync]
}

func (c *Chronicle) NewWorkerResync() *WorkerResync {
	return &WorkerResync{parent: c}
}

func (w *WorkerResync) Work(ctx context.Context, job *river.Job[ArgsResync]) error {
	logGroupID := job.Args.LogGroupID
	ctx = servicetenant.AdminBypass(ctx)

	// Delete previously parsed data so the parse worker can re-insert cleanly.
	if err := w.parent.Zed.DeleteAllParsedLogsByGroupID(ctx, logGroupID); err != nil {
		return fmt.Errorf("delete parsed logs: %w", err)
	}

	// Delegate to the existing log-parse worker. We construct a synthetic
	// river.Job[ArgsLogParse] wrapping the real job row so RecordOutput and
	// other River context functions work correctly through the real River
	// context carried in ctx.
	parseWorker := &WorkerLogParse{parent: w.parent}
	parseJob := &river.Job[ArgsLogParse]{
		JobRow: job.JobRow,
		Args:   ArgsLogParse{LogID: logGroupID},
	}

	if err := parseWorker.Work(ctx, parseJob); err != nil {
		return fmt.Errorf("parse: %w", err)
	}

	return nil
}

// ResyncResult describes the outcome of resyncing a single log group.
type ResyncResult struct {
	LogGroupID    uuid.UUID
	ParseDuration time.Duration
	Err           error
}
