package serviceratings

import (
	"context"
	"errors"
	"fmt"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"time"
)

// RepairWorker processes one canonical run per invocation, not a whole tenant.
// Projection is deliberately outside the claim/publication transactions.
type RepairWorker struct {
	river.WorkerDefaults[ArgsRepair]
	Store database.Store
}
type ArgsRepair struct {
	TenantID uuid.UUID `json:"tenant_id"`
}

func (ArgsRepair) Kind() string                                    { return "leaderboard-d1-repair" }
func (ArgsRepair) InsertOpts() river.InsertOpts                    { return insertOptions() }
func (*RepairWorker) Timeout(*river.Job[ArgsRepair]) time.Duration { return WorkTimeout }
func (w *RepairWorker) Work(ctx context.Context, job *river.Job[ArgsRepair]) error {
	if !DispatchEnabled {
		return nil
	}
	_, err := w.Drain(ctx, job.Args.TenantID)
	return err
}
func (w *RepairWorker) Drain(ctx context.Context, tenant uuid.UUID) (bool, error) {
	if servicetenant.IsBypass(ctx) {
		return false, fmt.Errorf("repair requires tenant context")
	}
	ctx = servicetenant.WithTenantID(ctx, tenant)
	ctx, cancel := context.WithTimeout(ctx, WorkTimeout)
	defer cancel()
	var claims []database.LeaderboardDirtyRun
	err := w.Store.InTx(ctx, func(tx database.Store) error {
		var err error
		claims, err = tx.ClaimLeaderboardRun(ctx, tenant)
		return err
	}, nil)
	if err != nil || len(claims) == 0 {
		return false, err
	}
	c := claims[0]
	rows, err := ComputeProjection(ctx, w.Store, tenant, c.RunID)
	if err == nil {
		err = w.publish(ctx, c, rows)
	}
	if err == nil {
		return true, nil
	}
	cleanup, stop := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer stop()
	retryErr := w.Store.RetryLeaderboardRun(cleanup, database.RetryLeaderboardRunParams{TenantID: tenant, RunID: c.RunID, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64})
	return false, errors.Join(err, retryErr)
}
func (w *RepairWorker) publish(ctx context.Context, c database.LeaderboardDirtyRun, rows []database.ProjectLeaderboardRunRow) error {
	ctx, cancel := context.WithTimeout(ctx, PublicationTimeout)
	defer cancel()
	return w.Store.InTx(ctx, func(tx database.Store) error {
		if err := tx.SetLeaderboardWorkerTimeouts(ctx, "30s"); err != nil {
			return err
		}
		args := database.LockLeaderboardRunClaimParams{TenantID: c.TenantID, RunID: c.RunID, ClaimToken: c.ClaimToken.UUID, ClaimedRevision: c.ClaimedRevision.Int64}
		_, err := tx.LockLeaderboardRunClaim(ctx, args)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		valid, err := tx.LeaderboardRunClaimUnexpired(ctx, database.LeaderboardRunClaimUnexpiredParams(args))
		if err != nil || !valid {
			return err
		}
		if err := PublishProjectionTx(ctx, tx, c.TenantID, c.RunID, rows); err != nil {
			return err
		}
		// A lease that expires during publication rolls back ALL evidence and D2 work.
		valid, err = tx.LeaderboardRunClaimUnexpired(ctx, database.LeaderboardRunClaimUnexpiredParams(args))
		if err != nil {
			return err
		}
		if !valid {
			return fmt.Errorf("repair lease expired during publication")
		}
		return tx.AcknowledgeLeaderboardRun(ctx, database.AcknowledgeLeaderboardRunParams(args))
	}, nil)
}

type ArgsRepairDispatch struct {
	AfterTenant uuid.UUID `json:"after_tenant"`
}

func (ArgsRepairDispatch) Kind() string                 { return "leaderboard-d1-dispatch" }
func (ArgsRepairDispatch) InsertOpts() river.InsertOpts { return insertOptions() }

type RepairDispatcher struct {
	river.WorkerDefaults[ArgsRepairDispatch]
	Store database.Store
	Queue JobInserter
}

func (d *RepairDispatcher) Work(ctx context.Context, job *river.Job[ArgsRepairDispatch]) error {
	if !DispatchEnabled {
		return nil
	}
	return d.dispatch(ctx, job.Args)
}
func (d *RepairDispatcher) dispatch(ctx context.Context, args ArgsRepairDispatch) error {
	ctx, cancel := context.WithTimeout(ctx, PublicationTimeout)
	defer cancel()
	tenants, err := d.Store.ListDueLeaderboardRuns(servicetenant.AdminBypass(ctx), database.ListDueLeaderboardRunsParams{AfterTenant: args.AfterTenant, LimitCount: BatchSize + 1})
	if err != nil {
		return err
	}
	more := len(tenants) > BatchSize
	if more {
		tenants = tenants[:BatchSize]
	}
	for _, tenant := range tenants {
		if _, err := d.Queue.Insert(ctx, ArgsRepair{TenantID: tenant}, nil); err != nil {
			return err
		}
	}
	if more {
		_, err = d.Queue.Insert(ctx, ArgsRepairDispatch{AfterTenant: tenants[len(tenants)-1]}, &river.InsertOpts{ScheduledAt: time.Now().Add(DispatchInterval)})
	}
	return err
}
