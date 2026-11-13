package serviceeventrepair

import (
	"context"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"time"
)

type Args struct {
	OperationID uuid.UUID `json:"operation_id"`
	RequestedBy uuid.UUID `json:"requested_by"`
	Phase       string    `json:"phase"`
}

func (Args) Kind() string { return "admin-event-repair" }
func (Args) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: []rivertype.JobState{rivertype.JobStateAvailable, rivertype.JobStatePending, rivertype.JobStateRunning, rivertype.JobStateScheduled}}}
}

type Worker struct {
	river.WorkerDefaults[Args]
	Service *Service
}

func (*Worker) Timeout(*river.Job[Args]) time.Duration { return 5 * time.Minute }
func (w *Worker) Work(ctx context.Context, j *river.Job[Args]) error {
	more, err := w.Service.ProcessPage(ctx, j.Args.OperationID, j.Args.Phase)
	if err != nil {
		return err
	}
	if more {
		return river.JobSnooze(time.Second)
	}
	return nil
}
