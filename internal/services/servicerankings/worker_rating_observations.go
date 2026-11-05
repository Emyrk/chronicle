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

type ArgsDispatchRatingObservations struct{}

func (ArgsDispatchRatingObservations) Kind() string { return "dispatch-rating-observations" }
func (ArgsDispatchRatingObservations) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByState: ratingActiveJobStates}}
}

type WorkerDispatchRatingObservations struct {
	river.WorkerDefaults[ArgsDispatchRatingObservations]
	Store database.Store
	Queue *riverqueue.Queues
}

func (w *WorkerDispatchRatingObservations) Work(ctx context.Context, _ *river.Job[ArgsDispatchRatingObservations]) error {
	if w.Queue == nil {
		return fmt.Errorf("rating observation queue unavailable")
	}
	ctx = servicetenant.AdminBypass(ctx)
	tenants, err := w.Store.ListDirtyObservationRunTenants(ctx)
	if err != nil {
		return err
	}
	for _, tenant := range tenants {
		if _, err := w.Queue.Insert(ctx, ArgsReconcileTenantRatingObservations{TenantID: tenant}, nil); err != nil {
			return fmt.Errorf("enqueue tenant rating evidence reconciliation: %w", err)
		}
	}
	return nil
}

type ArgsReconcileTenantRatingObservations struct {
	TenantID uuid.UUID `json:"tenant_id"`
}

func (ArgsReconcileTenantRatingObservations) Kind() string {
	return "reconcile-tenant-rating-observations"
}
func (ArgsReconcileTenantRatingObservations) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: ratingActiveJobStates}}
}

type WorkerReconcileTenantRatingObservations struct {
	river.WorkerDefaults[ArgsReconcileTenantRatingObservations]
	Store database.Store
}

func (w *WorkerReconcileTenantRatingObservations) Work(ctx context.Context, job *river.Job[ArgsReconcileTenantRatingObservations]) error {
	if skip, err := skipDisabledRootRatings(ctx, w.Store, job.Args.TenantID); err != nil || skip {
		return err
	}
	if job.Args.TenantID == uuid.Nil {
		ctx = servicetenant.AdminBypass(ctx)
	} else {
		ctx = servicetenant.WithTenantID(ctx, job.Args.TenantID)
	}
	started := time.Now()
	for time.Since(started) < 8*time.Second {
		count, err := ratingmath.ReconcileDirtyTenantObservations(ctx, w.Store, job.Args.TenantID)
		if err != nil {
			return err
		}
		if count == 0 {
			return nil
		}
	}
	return river.JobSnooze(time.Second)
}
