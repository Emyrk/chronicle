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

// A periodic dispatcher is also the recovery mechanism for a missed enqueue:
// committed dirty facts do not rely on a River insert in the source transaction.
type ArgsDispatchIncrementalRenown struct{}

func (ArgsDispatchIncrementalRenown) Kind() string { return "dispatch-incremental-renown" }
func (ArgsDispatchIncrementalRenown) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByState: ratingActiveJobStates}}
}

type WorkerDispatchIncrementalRenown struct {
	river.WorkerDefaults[ArgsDispatchIncrementalRenown]
	Store database.Store
	Queue *riverqueue.Queues
}

func (w *WorkerDispatchIncrementalRenown) Work(ctx context.Context, _ *river.Job[ArgsDispatchIncrementalRenown]) error {
	ctx = servicetenant.AdminBypass(ctx)
	if w.Queue == nil {
		return fmt.Errorf("incremental Renown queue unavailable")
	}
	tenants, err := w.Store.ListDirtyRenownTenants(ctx)
	if err != nil {
		return err
	}
	for _, tenant := range tenants {
		if _, err := w.Queue.Insert(ctx, ArgsRefreshTenantRenown{TenantID: tenant}, nil); err != nil {
			return fmt.Errorf("enqueue tenant Renown refresh: %w", err)
		}
	}
	return nil
}

type ArgsRefreshTenantRenown struct {
	TenantID uuid.UUID `json:"tenant_id"`
}

func (ArgsRefreshTenantRenown) Kind() string { return "refresh-tenant-renown" }
func (ArgsRefreshTenantRenown) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: ratingActiveJobStates}}
}

type WorkerRefreshTenantRenown struct {
	river.WorkerDefaults[ArgsRefreshTenantRenown]
	Store database.Store
}

func (w *WorkerRefreshTenantRenown) Work(ctx context.Context, job *river.Job[ArgsRefreshTenantRenown]) error {
	if job.Args.TenantID == uuid.Nil {
		ctx = servicetenant.AdminBypass(ctx)
	} else {
		ctx = servicetenant.WithTenantID(ctx, job.Args.TenantID)
	}
	started := time.Now()
	for time.Since(started) < 8*time.Second {
		count, err := ratingmath.RefreshDirtyTenantRenown(ctx, w.Store, job.Args.TenantID, time.Now().UTC())
		if err != nil {
			return err
		}
		if count == 0 {
			return nil // No active generation, building snapshot, or pending keys.
		}
	}
	return river.JobSnooze(time.Second)
}
