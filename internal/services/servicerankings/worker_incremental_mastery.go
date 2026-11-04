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

type ArgsDispatchIncrementalMastery struct{}

func (ArgsDispatchIncrementalMastery) Kind() string { return "dispatch-incremental-mastery" }
func (ArgsDispatchIncrementalMastery) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByState: ratingActiveJobStates}}
}

type WorkerDispatchIncrementalMastery struct {
	river.WorkerDefaults[ArgsDispatchIncrementalMastery]
	Store database.Store
	Queue *riverqueue.Queues
}

func (w *WorkerDispatchIncrementalMastery) Work(ctx context.Context, _ *river.Job[ArgsDispatchIncrementalMastery]) error {
	if w.Queue == nil {
		return fmt.Errorf("incremental mastery queue unavailable")
	}
	ctx = servicetenant.AdminBypass(ctx)
	tenants, err := w.Store.ListDirtyMasteryTenants(ctx)
	if err != nil {
		return err
	}
	for _, tenant := range tenants {
		if _, err := w.Queue.Insert(ctx, ArgsRefreshTenantMastery{TenantID: tenant}, nil); err != nil {
			return fmt.Errorf("enqueue tenant mastery refresh: %w", err)
		}
	}
	return nil
}

type ArgsRefreshTenantMastery struct {
	TenantID uuid.UUID `json:"tenant_id"`
}

func (ArgsRefreshTenantMastery) Kind() string { return "refresh-tenant-mastery" }
func (ArgsRefreshTenantMastery) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: ratingActiveJobStates}}
}

type WorkerRefreshTenantMastery struct {
	river.WorkerDefaults[ArgsRefreshTenantMastery]
	Store database.Store
}

func (w *WorkerRefreshTenantMastery) Work(ctx context.Context, job *river.Job[ArgsRefreshTenantMastery]) error {
	if job.Args.TenantID == uuid.Nil {
		ctx = servicetenant.AdminBypass(ctx)
	} else {
		ctx = servicetenant.WithTenantID(ctx, job.Args.TenantID)
	}
	started := time.Now()
	for time.Since(started) < 8*time.Second {
		count, err := ratingmath.RefreshDirtyTenantMastery(ctx, w.Store, job.Args.TenantID, time.Now().UTC())
		if err != nil {
			return err
		}
		if count == 0 {
			return nil
		}
	}
	return river.JobSnooze(time.Second)
}
