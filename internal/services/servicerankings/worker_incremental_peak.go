package servicerankings

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/ratingmath"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
)

type ArgsDispatchIncrementalPeak struct{}

func (ArgsDispatchIncrementalPeak) Kind() string { return "dispatch-incremental-peak" }
func (ArgsDispatchIncrementalPeak) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByState: ratingActiveJobStates}}
}

type WorkerDispatchIncrementalPeak struct {
	river.WorkerDefaults[ArgsDispatchIncrementalPeak]
	Store database.Store
	Queue *riverqueue.Queues
}

func (w *WorkerDispatchIncrementalPeak) Work(ctx context.Context, _ *river.Job[ArgsDispatchIncrementalPeak]) error {
	if w.Queue == nil {
		return fmt.Errorf("incremental peak queue unavailable")
	}
	ctx = servicetenant.AdminBypass(ctx)
	tenants, err := w.Store.ListDirtyPeakTenants(ctx)
	if err != nil {
		return err
	}
	for _, tenant := range tenants {
		if _, err := w.Queue.Insert(ctx, ArgsRefreshTenantPeak{TenantID: tenant}, nil); err != nil {
			return fmt.Errorf("enqueue tenant peak refresh: %w", err)
		}
	}
	return nil
}

type ArgsRefreshTenantPeak struct {
	TenantID uuid.UUID `json:"tenant_id"`
}

func (ArgsRefreshTenantPeak) Kind() string { return "refresh-tenant-peak" }
func (ArgsRefreshTenantPeak) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: ratingActiveJobStates}}
}

type WorkerRefreshTenantPeak struct {
	river.WorkerDefaults[ArgsRefreshTenantPeak]
	Store database.Store
}

func (w *WorkerRefreshTenantPeak) Work(ctx context.Context, job *river.Job[ArgsRefreshTenantPeak]) error {
	if job.Args.TenantID == uuid.Nil {
		ctx = servicetenant.AdminBypass(ctx)
	} else {
		ctx = servicetenant.WithTenantID(ctx, job.Args.TenantID)
	}
	started := time.Now()
	for time.Since(started) < 8*time.Second {
		count, err := ratingmath.RefreshDirtyTenantPeak(ctx, w.Store, job.Args.TenantID, time.Now().UTC())
		if err != nil {
			return err
		}
		if count == 0 {
			return nil
		}
	}
	return river.JobSnooze(time.Second)
}
