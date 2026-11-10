package serviceratings

import (
	"context"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"time"
)

type ArgsCareerDispatch struct {
	AfterTenant uuid.UUID `json:"after_tenant"`
	Sweep       bool      `json:"sweep"`
}

func (ArgsCareerDispatch) Kind() string                 { return "leaderboard-career-dispatch" }
func (ArgsCareerDispatch) InsertOpts() river.InsertOpts { return insertOptions() }

type ArgsCareerDrain struct {
	TenantID uuid.UUID `json:"tenant_id"`
}

func (ArgsCareerDrain) Kind() string                 { return "leaderboard-career-drain" }
func (ArgsCareerDrain) InsertOpts() river.InsertOpts { return insertOptions() }

type CareerDispatcher struct {
	river.WorkerDefaults[ArgsCareerDispatch]
	Store database.Store
	Queue JobInserter
}

func (d *CareerDispatcher) Work(ctx context.Context, job *river.Job[ArgsCareerDispatch]) error {
	var tenants []uuid.UUID
	var err error
	if job.Args.Sweep {
		tenants, err = d.Store.ListLeaderboardMetricTenants(servicetenant.AdminBypass(ctx), job.Args.AfterTenant)
	} else {
		tenants, err = d.Store.ListDueLeaderboardCareerTenants(servicetenant.AdminBypass(ctx), job.Args.AfterTenant)
	}
	if err != nil {
		return err
	}
	for _, id := range tenants {
		if job.Args.Sweep {
			if err = d.Store.EnsureLeaderboardCareerSweep(servicetenant.WithTenantID(ctx, id), id); err != nil {
				return err
			}
		}
		if _, err = d.Queue.Insert(ctx, ArgsCareerDrain{TenantID: id}, nil); err != nil {
			return err
		}
	}
	if len(tenants) == BatchSize {
		_, err = d.Queue.Insert(ctx, ArgsCareerDispatch{AfterTenant: tenants[len(tenants)-1], Sweep: job.Args.Sweep}, nil)
	}
	return err
}

type CareerDrainWorker struct {
	river.WorkerDefaults[ArgsCareerDrain]
	Worker *CareerWorker
}

func (w *CareerDrainWorker) Work(ctx context.Context, job *river.Job[ArgsCareerDrain]) error {
	return continueWork(ctx, func(ctx context.Context) (bool, error) { return w.Worker.Drain(ctx, job.Args.TenantID) }, func(ctx context.Context) (bool, error) {
		return w.Worker.Store.HasDueLeaderboardCareer(servicetenant.WithTenantID(ctx, job.Args.TenantID), job.Args.TenantID)
	})
}

func (*CareerDrainWorker) Timeout(*river.Job[ArgsCareerDrain]) time.Duration { return WorkTimeout }
