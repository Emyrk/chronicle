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

type ArgsDispatchLiveEvidenceBootstrap struct{}

func (ArgsDispatchLiveEvidenceBootstrap) Kind() string { return "dispatch-live-evidence-bootstrap" }
func (ArgsDispatchLiveEvidenceBootstrap) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByState: ratingActiveJobStates}}
}

type WorkerDispatchLiveEvidenceBootstrap struct {
	river.WorkerDefaults[ArgsDispatchLiveEvidenceBootstrap]
	Store database.Store
	Queue *riverqueue.Queues
}

func (w *WorkerDispatchLiveEvidenceBootstrap) Work(ctx context.Context, _ *river.Job[ArgsDispatchLiveEvidenceBootstrap]) error {
	if w.Queue == nil {
		return fmt.Errorf("live evidence bootstrap queue unavailable")
	}
	ctx = servicetenant.AdminBypass(ctx)
	tenants, err := w.Store.ListRatingTenants(ctx)
	if err != nil {
		return err
	}
	for _, tenant := range tenants {
		if !tenant.Valid {
			return fmt.Errorf("rating tenant enumeration returned null")
		}
		ready, err := w.Store.TenantLiveEvidenceReady(ctx, tenant.UUID)
		if err != nil {
			return err
		}
		if ready {
			continue
		}
		if _, err := w.Queue.Insert(ctx, ArgsBootstrapTenantLiveEvidence{TenantID: tenant.UUID}, nil); err != nil {
			return fmt.Errorf("enqueue tenant evidence bootstrap: %w", err)
		}
	}
	return nil
}

type ArgsBootstrapTenantLiveEvidence struct {
	TenantID uuid.UUID `json:"tenant_id"`
}

func (ArgsBootstrapTenantLiveEvidence) Kind() string { return "bootstrap-tenant-live-evidence" }
func (ArgsBootstrapTenantLiveEvidence) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: ratingActiveJobStates}}
}

type WorkerBootstrapTenantLiveEvidence struct {
	river.WorkerDefaults[ArgsBootstrapTenantLiveEvidence]
	Store database.Store
}

func (w *WorkerBootstrapTenantLiveEvidence) Work(ctx context.Context, job *river.Job[ArgsBootstrapTenantLiveEvidence]) error {
	if skip, err := skipDisabledRootRatings(ctx, w.Store, job.Args.TenantID); err != nil || skip {
		return err
	}
	if job.Args.TenantID == uuid.Nil {
		ctx = servicetenant.AdminBypass(ctx)
	} else {
		ctx = servicetenant.WithTenantID(ctx, job.Args.TenantID)
	}
	completed, err := ratingmath.BootstrapTenantLiveEvidence(ctx, w.Store, job.Args.TenantID, time.Now().UTC())
	if err != nil {
		return err
	}
	if completed {
		return nil
	}
	return river.JobSnooze(time.Second)
}
