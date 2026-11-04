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
	"github.com/prometheus/client_golang/prometheus"
	"github.com/riverqueue/river"
)

// Periodic dispatch recovers missed enqueues from the four durable dirty tables.
type ArgsDispatchTenantRatingDrain struct{}

func (ArgsDispatchTenantRatingDrain) Kind() string { return "dispatch-tenant-rating-drain" }
func (ArgsDispatchTenantRatingDrain) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByState: ratingActiveJobStates}}
}

type WorkerDispatchTenantRatingDrain struct {
	river.WorkerDefaults[ArgsDispatchTenantRatingDrain]
	Store database.Store
	Queue *riverqueue.Queues
}

func (w *WorkerDispatchTenantRatingDrain) Work(ctx context.Context, _ *river.Job[ArgsDispatchTenantRatingDrain]) error {
	if w.Queue == nil {
		return fmt.Errorf("tenant rating drain queue unavailable")
	}
	ctx = servicetenant.AdminBypass(ctx)
	tenants, err := w.Store.ListDirtyTenantRatings(ctx)
	if err != nil {
		return err
	}
	for _, tenant := range tenants {
		if _, err := w.Queue.Insert(ctx, ArgsDrainTenantRatings{TenantID: tenant}, nil); err != nil {
			return fmt.Errorf("enqueue tenant rating drain %s: %w", tenant, err)
		}
	}
	return nil
}

type ArgsDrainTenantRatings struct {
	TenantID uuid.UUID `json:"tenant_id"`
}

func (ArgsDrainTenantRatings) Kind() string { return "drain-tenant-ratings" }
func (ArgsDrainTenantRatings) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: ratingActiveJobStates}}
}

type WorkerDrainTenantRatings struct {
	river.WorkerDefaults[ArgsDrainTenantRatings]
	Store database.Store
	// Each collector has one bounded "stage" label (runs, renown, mastery, peak).
	// Optional so standalone workers and tests need no metrics registry.
	PageDuration   prometheus.ObserverVec
	PagesProcessed *prometheus.CounterVec
	KeysProcessed  *prometheus.CounterVec
	PageErrors     *prometheus.CounterVec
}

func (w *WorkerDrainTenantRatings) Work(ctx context.Context, job *river.Job[ArgsDrainTenantRatings]) error {
	tenant := job.Args.TenantID
	if tenant == uuid.Nil {
		ctx = servicetenant.AdminBypass(ctx)
	} else {
		ctx = servicetenant.WithTenantID(ctx, tenant)
	}
	stages := []ratingDrainStage{
		{name: "runs", run: func(ctx context.Context) (int, error) {
			return ratingmath.ReconcileDirtyTenantObservations(ctx, w.Store, tenant)
		}},
		{name: "renown", run: func(ctx context.Context) (int, error) {
			return ratingmath.RefreshDirtyTenantRenown(ctx, w.Store, tenant, time.Now().UTC())
		}},
		{name: "mastery", run: func(ctx context.Context) (int, error) {
			return ratingmath.RefreshDirtyTenantMastery(ctx, w.Store, tenant, time.Now().UTC())
		}},
		{name: "peak", run: func(ctx context.Context) (int, error) {
			return ratingmath.RefreshDirtyTenantPeak(ctx, w.Store, tenant, time.Now().UTC())
		}},
	}
	// River is configured with a 30-minute job timeout; the one-minute budget
	// is deliberately soft, allowing a page already started to finish.
	return drainTenantRatingPages(ctx, stages, time.Now().Add(time.Minute), time.Now, w)
}

type ratingDrainStage struct {
	name string
	run  func(context.Context) (int, error)
}

// Each stage commits one bounded page before moving to the next. A zero-count
// cycle means no stage made progress (including when generation gates prevent
// writes), so leave remaining dirty intent for the next periodic dispatch.
func drainTenantRatingPages(ctx context.Context, stages []ratingDrainStage, deadline time.Time, now func() time.Time, metrics *WorkerDrainTenantRatings) error {
	firstPage := true
	for {
		progress := false
		for _, stage := range stages {
			if err := ctx.Err(); err != nil {
				return err
			}
			if !firstPage && !now().Before(deadline) {
				return river.JobSnooze(time.Second)
			}
			firstPage = false
			started := time.Now()
			count, err := stage.run(ctx)
			if metrics != nil {
				if metrics.PageDuration != nil {
					metrics.PageDuration.WithLabelValues(stage.name).Observe(time.Since(started).Seconds())
				}
				if err != nil {
					if metrics.PageErrors != nil {
						metrics.PageErrors.WithLabelValues(stage.name).Inc()
					}
				} else if count > 0 {
					if metrics.PagesProcessed != nil {
						metrics.PagesProcessed.WithLabelValues(stage.name).Inc()
					}
					if metrics.KeysProcessed != nil {
						metrics.KeysProcessed.WithLabelValues(stage.name).Add(float64(count))
					}
				}
			}
			if err != nil {
				return fmt.Errorf("drain tenant rating %s: %w", stage.name, err)
			}
			progress = progress || count > 0
		}
		if !progress {
			return nil
		}
	}
}
