package servicerankings

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
)

const renownRepairPageSize = 200

// ArgsRepairRenownFacts is a daily or operator-initiated durable keyset repair.
// A nil tenant UUID denotes the root tenant. Each page schedules its successor
// before completing, so a failed enqueue retries the current idempotent page.
type ArgsRepairRenownFacts struct {
	TenantID   uuid.UUID `json:"tenant_id"`
	AfterRunID uuid.UUID `json:"after_run_id"`
}

func (ArgsRepairRenownFacts) Kind() string { return "repair-renown-facts" }
func (ArgsRepairRenownFacts) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		// The cursor is part of the identity: different pages must not collide.
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: ratingActiveJobStates},
	}
}

type WorkerRepairRenownFacts struct {
	river.WorkerDefaults[ArgsRepairRenownFacts]
	Store database.Store
	Queue *riverqueue.Queues
	// enqueue is replaced in tests to simulate a crash before the next page is persisted.
	enqueue  func(context.Context, ArgsRepairRenownFacts) error
	pageSize int32
}

func (w *WorkerRepairRenownFacts) Work(ctx context.Context, job *river.Job[ArgsRepairRenownFacts]) error {
	pageSize := w.pageSize
	if pageSize <= 0 || pageSize > renownRepairPageSize {
		pageSize = renownRepairPageSize
	}
	ctx = servicetenant.AdminBypass(ctx)
	ids, err := w.Store.ListRenownBackfillRunIDs(ctx, database.ListRenownBackfillRunIDsParams{
		TenantID: job.Args.TenantID, AfterRunID: job.Args.AfterRunID, BatchSize: pageSize,
	})
	if err != nil {
		return fmt.Errorf("list Renown repair runs: %w", err)
	}
	if len(ids) == 0 {
		return nil
	}
	if _, err := w.Store.BackfillRenownFactsForRuns(ctx, ids); err != nil {
		return fmt.Errorf("repair player Renown facts: %w", err)
	}
	if _, err := w.Store.BackfillGuildRenownFactsForRuns(ctx, database.BackfillGuildRenownFactsForRunsParams{
		TenantID: job.Args.TenantID, RunIds: ids,
	}); err != nil {
		return fmt.Errorf("repair guild Renown facts: %w", err)
	}
	if len(ids) < int(pageSize) {
		return nil
	}
	next := ArgsRepairRenownFacts{TenantID: job.Args.TenantID, AfterRunID: ids[len(ids)-1]}
	if w.enqueue != nil {
		return w.enqueue(ctx, next)
	}
	if w.Queue == nil {
		return fmt.Errorf("renown repair queue unavailable")
	}
	_, err = w.Queue.Insert(ctx, next, nil)
	if err != nil {
		return fmt.Errorf("enqueue next Renown repair page: %w", err)
	}
	return nil
}

// ArgsDispatchRenownRepair starts a bounded pass for root and every tenant.
// River schedules it daily; operators can dispatch another pass as needed.
type ArgsDispatchRenownRepair struct{}

func (ArgsDispatchRenownRepair) Kind() string { return "dispatch-renown-repair" }
func (ArgsDispatchRenownRepair) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByState: ratingActiveJobStates}}
}

type WorkerDispatchRenownRepair struct {
	river.WorkerDefaults[ArgsDispatchRenownRepair]
	Store database.Store
	Queue *riverqueue.Queues
}

func (w *WorkerDispatchRenownRepair) Work(ctx context.Context, _ *river.Job[ArgsDispatchRenownRepair]) error {
	if w.Queue == nil {
		return fmt.Errorf("renown repair queue unavailable")
	}
	ctx = servicetenant.AdminBypass(ctx)
	tenants, err := w.Store.ListTenants(ctx)
	if err != nil {
		return fmt.Errorf("list Renown repair tenants: %w", err)
	}
	if _, err := w.Queue.Insert(ctx, ArgsRepairRenownFacts{}, nil); err != nil {
		return fmt.Errorf("enqueue root Renown repair: %w", err)
	}
	for _, tenant := range tenants {
		if _, err := w.Queue.Insert(ctx, ArgsRepairRenownFacts{TenantID: tenant.ID}, nil); err != nil {
			return fmt.Errorf("enqueue tenant %s Renown repair: %w", tenant.ID, err)
		}
	}
	return nil
}
