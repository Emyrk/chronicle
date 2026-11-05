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

type ArgsDispatchTenantRatingCopy struct{}

func (ArgsDispatchTenantRatingCopy) Kind() string { return "dispatch-tenant-rating-copy" }
func (ArgsDispatchTenantRatingCopy) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByState: ratingActiveJobStates}}
}

type WorkerDispatchTenantRatingCopy struct {
	river.WorkerDefaults[ArgsDispatchTenantRatingCopy]
	Store database.Store
	Queue *riverqueue.Queues
}

func (w *WorkerDispatchTenantRatingCopy) Work(ctx context.Context, _ *river.Job[ArgsDispatchTenantRatingCopy]) error {
	if w.Queue == nil {
		return fmt.Errorf("tenant rating copy queue unavailable")
	}
	ctx = servicetenant.AdminBypass(ctx)
	tenants, err := w.Store.ListTenantRatingsNeedingCopy(ctx)
	if err != nil {
		return err
	}
	for _, tenant := range tenants {
		if _, err := w.Queue.Insert(ctx, ArgsCopyTenantRatings{TenantID: tenant}, nil); err != nil {
			return err
		}
	}
	return nil
}

type ArgsCopyTenantRatings struct {
	TenantID uuid.UUID `json:"tenant_id"`
}

func (ArgsCopyTenantRatings) Kind() string { return "copy-tenant-ratings" }
func (ArgsCopyTenantRatings) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: ratingActiveJobStates}}
}

type WorkerCopyTenantRatings struct {
	river.WorkerDefaults[ArgsCopyTenantRatings]
	Store database.Store
}

func (w *WorkerCopyTenantRatings) Work(ctx context.Context, job *river.Job[ArgsCopyTenantRatings]) error {
	if skip, err := skipDisabledRootRatings(ctx, w.Store, job.Args.TenantID); err != nil || skip {
		return err
	}
	tenant := job.Args.TenantID
	if tenant == uuid.Nil {
		ctx = servicetenant.AdminBypass(ctx)
	} else {
		ctx = servicetenant.WithTenantID(ctx, tenant)
	}
	deadline := time.Now().Add(time.Minute)
	for {
		done, err := CopyTenantRatingPage(ctx, w.Store, tenant)
		if err != nil || done {
			return err
		}
		if time.Now().After(deadline) {
			return river.JobSnooze(time.Second)
		}
	}
}

// CopyTenantRatingPage copies at most 200 source rows, recording the keyset in
// the same transaction. The read-state transition is committed separately
// before the first projection write, so no observer can see a partial copy.
func CopyTenantRatingPage(ctx context.Context, store database.Store, tenant uuid.UUID) (bool, error) {
	ctx = servicetenant.WithTenantID(ctx, tenant)
	if tenant == uuid.Nil {
		ctx = servicetenant.AdminBypass(ctx)
	}
	if err := store.BeginTenantRatingCopy(ctx, tenant); err != nil {
		return false, err
	}
	done := false
	err := store.InTx(ctx, func(tx database.Store) error {
		state, err := tx.LockTenantRatingCopyState(ctx, tenant)
		if err != nil {
			return err
		}
		if state == "evolving" {
			done = true
			return nil
		}
		if state != "copying" {
			return fmt.Errorf("unexpected tenant rating read state %q", state)
		}
		generation, err := tx.LockTenantRatingCopyGeneration(ctx, tenant)
		if err != nil {
			return fmt.Errorf("active rating generation changed for %s: %w", tenant, err)
		}
		if err := tx.StartTenantRatingCopyProgress(ctx, database.StartTenantRatingCopyProgressParams{TenantID: tenant, GenerationID: generation}); err != nil {
			return err
		}
		stages, err := tx.ListTenantRatingCopyProgress(ctx, tenant)
		if err != nil {
			return err
		}
		if len(stages) != 5 {
			return fmt.Errorf("tenant rating copy has %d stages, expected 5", len(stages))
		}
		for _, stage := range stages {
			if stage.GenerationID != generation {
				return fmt.Errorf("active rating generation changed during copy for %s", tenant)
			}
			if stage.Completed {
				continue
			}
			var next []byte
			var count int32
			switch stage.TableName {
			case "player_boss":
				row, err := tx.CopyTenantRatingPlayerBossPage(ctx, database.CopyTenantRatingPlayerBossPageParams{TenantID: tenant, GenerationID: generation, AfterKey: stage.AfterKey})
				if err != nil {
					return err
				}
				next, count = row.NextKey, row.PageSize
			case "player_scope":
				row, err := tx.CopyTenantRatingPlayerScopePage(ctx, database.CopyTenantRatingPlayerScopePageParams{TenantID: tenant, GenerationID: generation, AfterKey: stage.AfterKey})
				if err != nil {
					return err
				}
				next, count = row.NextKey, row.PageSize
			case "guild_boss":
				row, err := tx.CopyTenantRatingGuildBossPage(ctx, database.CopyTenantRatingGuildBossPageParams{TenantID: tenant, GenerationID: generation, AfterKey: stage.AfterKey})
				if err != nil {
					return err
				}
				next, count = row.NextKey, row.PageSize
			case "guild_scope":
				row, err := tx.CopyTenantRatingGuildScopePage(ctx, database.CopyTenantRatingGuildScopePageParams{TenantID: tenant, GenerationID: generation, AfterKey: stage.AfterKey})
				if err != nil {
					return err
				}
				next, count = row.NextKey, row.PageSize
			case "peak":
				row, err := tx.CopyTenantRatingPeakPage(ctx, database.CopyTenantRatingPeakPageParams{TenantID: tenant, GenerationID: generation, AfterKey: stage.AfterKey})
				if err != nil {
					return err
				}
				next, count = row.NextKey, row.PageSize
			default:
				return fmt.Errorf("unknown tenant rating copy stage %q", stage.TableName)
			}
			if count == 0 {
				updated, err := tx.CompleteTenantRatingCopyProgress(ctx, database.CompleteTenantRatingCopyProgressParams{TenantID: tenant, GenerationID: generation, TableName: stage.TableName})
				if err != nil {
					return err
				}
				if updated != 1 {
					return fmt.Errorf("lost tenant rating copy stage %s", stage.TableName)
				}
			} else {
				updated, err := tx.AdvanceTenantRatingCopyProgress(ctx, database.AdvanceTenantRatingCopyProgressParams{TenantID: tenant, GenerationID: generation, TableName: stage.TableName, AfterKey: next})
				if err != nil {
					return err
				}
				if updated != 1 {
					return fmt.Errorf("lost tenant rating copy cursor %s", stage.TableName)
				}
			}
			return nil
		}
		updated, err := tx.FinishTenantRatingCopy(ctx, database.FinishTenantRatingCopyParams{TenantID: tenant, GenerationID: generation})
		if err != nil {
			return err
		}
		if updated != 1 {
			return fmt.Errorf("tenant rating copy terminal fence failed for %s", tenant)
		}
		done = true
		return nil
	}, nil)
	return done, err
}
