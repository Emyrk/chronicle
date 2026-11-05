package servicerankings

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
)

const liveEvidenceRepairPageSize int32 = 200

type ArgsDispatchLiveEvidenceRepair struct{}

func (ArgsDispatchLiveEvidenceRepair) Kind() string { return "dispatch-live-evidence-repair" }
func (ArgsDispatchLiveEvidenceRepair) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByState: ratingActiveJobStates}}
}

type WorkerDispatchLiveEvidenceRepair struct {
	river.WorkerDefaults[ArgsDispatchLiveEvidenceRepair]
	Store database.Store
	Queue *riverqueue.Queues
}

func (w *WorkerDispatchLiveEvidenceRepair) Work(ctx context.Context, _ *river.Job[ArgsDispatchLiveEvidenceRepair]) error {
	if w.Queue == nil {
		return fmt.Errorf("live evidence repair queue unavailable")
	}
	ctx = servicetenant.AdminBypass(ctx)
	tenants, err := w.Store.ListRatingTenants(ctx)
	if err != nil {
		return err
	}
	cutoff := time.Now().UTC()
	for _, tenant := range tenants {
		if !tenant.Valid {
			return fmt.Errorf("rating tenant enumeration returned null")
		}
		ready, err := w.Store.TenantLiveEvidenceReady(ctx, tenant.UUID)
		if err != nil {
			return err
		}
		if !ready {
			continue // bootstrap is still reconciling historical sources
		}
		if _, err := w.Queue.Insert(ctx, ArgsRepairLiveEvidence{TenantID: tenant.UUID, Cutoff: cutoff}, nil); err != nil {
			return err
		}
	}
	return nil
}

type ArgsRepairLiveEvidence struct {
	TenantID   uuid.UUID `json:"tenant_id"`
	Cutoff     time.Time `json:"cutoff"`
	AfterRunID uuid.UUID `json:"after_run_id"`
}

func (ArgsRepairLiveEvidence) Kind() string { return "repair-live-rating-evidence" }
func (ArgsRepairLiveEvidence) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: ratingActiveJobStates}}
}

type WorkerRepairLiveEvidence struct {
	river.WorkerDefaults[ArgsRepairLiveEvidence]
	Store database.Store
	Queue *riverqueue.Queues
}

func (w *WorkerRepairLiveEvidence) Work(ctx context.Context, job *river.Job[ArgsRepairLiveEvidence]) error {
	if skip, err := skipDisabledRootRatings(ctx, w.Store, job.Args.TenantID); err != nil || skip {
		return err
	}
	args := job.Args
	if args.Cutoff.IsZero() {
		return fmt.Errorf("live evidence repair requires fixed cutoff")
	}
	if args.TenantID == uuid.Nil {
		ctx = servicetenant.AdminBypass(ctx)
	} else {
		ctx = servicetenant.WithTenantID(ctx, args.TenantID)
	}
	page, err := w.Store.ListLiveEvidenceRepairPage(ctx, database.ListLiveEvidenceRepairPageParams{
		TenantID: args.TenantID, AfterRunID: args.AfterRunID,
		SourceCutoff: database.Timestamptz(args.Cutoff), BatchSize: liveEvidenceRepairPageSize,
	})
	if err != nil {
		return err
	}
	for _, run := range page {
		if !run.NeedsRepair.Valid {
			return fmt.Errorf("null repair state for rating run %s", run.RunID)
		}
		if run.NeedsRepair.Bool {
			if err := w.Store.MarkMissingLiveEvidenceRevision(ctx, database.MarkMissingLiveEvidenceRevisionParams{
				TenantID: args.TenantID, RunID: run.RunID,
			}); err != nil {
				return err
			}
		}
	}
	if len(page) < int(liveEvidenceRepairPageSize) {
		return nil
	}
	if w.Queue == nil {
		return fmt.Errorf("live evidence repair queue unavailable")
	}
	_, err = w.Queue.Insert(ctx, ArgsRepairLiveEvidence{
		TenantID: args.TenantID, Cutoff: args.Cutoff, AfterRunID: page[len(page)-1].RunID,
	}, nil)
	return err
}
