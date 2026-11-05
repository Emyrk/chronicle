package servicerankings

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
)

// Only explicit admin action seeds this scan. Dispatch recovers a stranded
// cursor after process restarts, failed jobs, or an enqueue/reset race.
type ArgsDispatchRatingPolicyScan struct{}

func (ArgsDispatchRatingPolicyScan) Kind() string { return "dispatch-rating-policy-scan" }
func (ArgsDispatchRatingPolicyScan) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByState: ratingActiveJobStates}}
}

type WorkerDispatchRatingPolicyScan struct {
	river.WorkerDefaults[ArgsDispatchRatingPolicyScan]
	Store database.Store
	Queue *riverqueue.Queues
}

func (w *WorkerDispatchRatingPolicyScan) Work(ctx context.Context, _ *river.Job[ArgsDispatchRatingPolicyScan]) error {
	if w.Queue == nil {
		return fmt.Errorf("rating policy scan queue unavailable")
	}
	tenants, err := w.Store.ListRatingPolicyScanTenants(servicetenant.AdminBypass(ctx))
	if err != nil {
		return err
	}
	for _, tenant := range tenants {
		if _, err := w.Queue.Insert(ctx, ArgsRatingPolicyScan{TenantID: tenant}, nil); err != nil {
			return err
		}
	}
	return nil
}

type ArgsRatingPolicyScan struct {
	TenantID uuid.UUID `json:"tenant_id"`
}

func (ArgsRatingPolicyScan) Kind() string { return "rating-policy-scan" }
func (ArgsRatingPolicyScan) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: riverconst.QueueRankings, Priority: riverconst.PriorityLow, MaxAttempts: 10,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: ratingActiveJobStates}}
}

type WorkerRatingPolicyScan struct {
	river.WorkerDefaults[ArgsRatingPolicyScan]
	Store database.Store
}

func (w *WorkerRatingPolicyScan) Work(ctx context.Context, job *river.Job[ArgsRatingPolicyScan]) error {
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
		pageCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
		done, err := ScanRatingPolicyPage(pageCtx, w.Store, tenant)
		cancel()
		if err != nil || done {
			return err
		}
		if time.Now().After(deadline) {
			return river.JobSnooze(time.Second)
		}
	}
}

// A progress row serializes multiple workers, including across daemons. The
// cursor and at most 100 dirty keys commit together; a failed page rolls back.
func ScanRatingPolicyPage(ctx context.Context, store database.Store, tenant uuid.UUID) (bool, error) {
	done := false
	err := store.InTx(ctx, func(tx database.Store) error {
		// A policy scope sweep must not delete a row committed by a concurrent
		// writer after the sweep's existence check but before its DELETE.
		if err := tx.AcquireTenantRatingProjectionLock(ctx, tenant); err != nil {
			return err
		}
		progress, err := tx.LockRatingPolicyScanProgress(ctx, tenant)
		if errors.Is(err, pgx.ErrNoRows) {
			done = true
			return nil
		}
		if err != nil {
			return err
		}
		var next []byte
		var size int32
		switch progress.Stage {
		case "runs":
			row, err := tx.MarkPolicyScanRunPage(ctx, database.MarkPolicyScanRunPageParams{TenantID: tenant, AfterKey: progress.AfterKey})
			if err != nil {
				return err
			}
			next, size = row.NextKey, row.PageSize
		case "renown":
			row, err := tx.MarkPolicyScanRenownPage(ctx, database.MarkPolicyScanRenownPageParams{TenantID: tenant, AfterKey: progress.AfterKey})
			if err != nil {
				return err
			}
			next, size = row.NextKey, row.PageSize
		case "mastery":
			row, err := tx.MarkPolicyScanMasteryPage(ctx, database.MarkPolicyScanMasteryPageParams{TenantID: tenant, AfterKey: progress.AfterKey})
			if err != nil {
				return err
			}
			next, size = row.NextKey, row.PageSize
		case "player_scope":
			row, err := tx.CleanPolicyScanPlayerScopePage(ctx, database.CleanPolicyScanPlayerScopePageParams{TenantID: tenant, AfterKey: progress.AfterKey})
			if err != nil {
				return err
			}
			next, size = row.NextKey, row.PageSize
		case "guild_scope":
			row, err := tx.CleanPolicyScanGuildScopePage(ctx, database.CleanPolicyScanGuildScopePageParams{TenantID: tenant, AfterKey: progress.AfterKey})
			if err != nil {
				return err
			}
			next, size = row.NextKey, row.PageSize
		case "peak":
			row, err := tx.MarkPolicyScanPeakPage(ctx, database.MarkPolicyScanPeakPageParams{TenantID: tenant, AfterKey: progress.AfterKey})
			if err != nil {
				return err
			}
			next, size = row.NextKey, row.PageSize
		default:
			return fmt.Errorf("unknown rating policy scan stage %q", progress.Stage)
		}
		var changed int64
		if size == 0 {
			changed, err = tx.CompleteRatingPolicyScanStage(ctx, database.CompleteRatingPolicyScanStageParams{TenantID: tenant, Stage: progress.Stage})
		} else {
			changed, err = tx.AdvanceRatingPolicyScanStage(ctx, database.AdvanceRatingPolicyScanStageParams{TenantID: tenant, Stage: progress.Stage, AfterKey: next})
		}
		if err != nil {
			return err
		}
		if changed != 1 {
			return fmt.Errorf("rating policy scan cursor lost: %s", progress.Stage)
		}
		return nil
	}, nil)
	return done, err
}
