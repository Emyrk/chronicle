package serviceratings

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/serviceprometheus"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/coder/serpent"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

type Service struct {
	metrics             *Metrics
	cancelMetrics       context.CancelFunc
	metricsDone         chan struct{}
	OperationDispatcher *OperationDispatcher
	OperationWorker     *OperationWorker
	broker              *services.Services
	Dispatcher          *Dispatcher
	TenantWorker        *TenantWorker
	RepairWorker        *RepairWorker
	RepairDispatcher    *RepairDispatcher
}

func New(broker *services.Services) *Service     { return &Service{broker: broker} }
func Ratings(broker *services.Services) *Service { return services.MustGet[*Service](broker) }
func OnRatings() string                          { return services.ServiceRatings }
func (*Service) Name() string                    { return OnRatings() }
func (*Service) DependsOn() []string {
	return []string{servicedbstore.OnDatabaseStore(), servicetenant.OnTenant(), serviceprometheus.OnPrometheus()}
}
func (*Service) Configures() []string       { return nil }
func (*Service) Options() serpent.OptionSet { return nil } // Deliberately no runtime batch setting.
func (s *Service) Start(ctx context.Context) error {
	var err error
	s.metrics, err = NewMetrics(serviceprometheus.Registry(s.broker))
	if err != nil {
		return err
	}
	store := servicedbstore.DatabaseStore(s.broker)
	s.Dispatcher = &Dispatcher{Store: store}
	s.OperationDispatcher = &OperationDispatcher{Store: store}
	s.OperationWorker = &OperationWorker{Store: store}
	s.RepairWorker = &RepairWorker{Store: store}
	s.RepairDispatcher = &RepairDispatcher{Store: store}
	s.TenantWorker = &TenantWorker{Worker: &Worker{Store: store, Metrics: s.metrics}}
	s.RepairWorker.Metrics = s.metrics
	s.OperationWorker.Metrics = s.metrics
	metricsctx, cancel := context.WithCancel(ctx)
	s.cancelMetrics = cancel
	s.metricsDone = make(chan struct{})
	go func() {
		defer close(s.metricsDone)
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-metricsctx.Done():
				return
			case <-ticker.C:
				_ = s.metrics.RefreshPage(metricsctx, store)
			}
		}
	}()
	return nil
}
func (s *Service) Close(ctx context.Context) error {
	if s.cancelMetrics != nil {
		s.cancelMetrics()
		select {
		case <-s.metricsDone:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return nil
}

func insertOptions() river.InsertOpts {
	return river.InsertOpts{
		Queue: riverconst.QueueRankings, MaxAttempts: 3,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: []rivertype.JobState{rivertype.JobStateAvailable, rivertype.JobStatePending, rivertype.JobStateRunning, rivertype.JobStateScheduled}},
	}
}

type ArgsDispatch struct {
	AfterTenant uuid.UUID `json:"after_tenant"`
	AfterFamily int32     `json:"after_family"`
}

func (ArgsDispatch) Kind() string                 { return "leaderboard-d2-dispatch" }
func (ArgsDispatch) InsertOpts() river.InsertOpts { return insertOptions() }

type ArgsDrain struct {
	TenantID uuid.UUID `json:"tenant_id"`
	Family   Family    `json:"family"`
}

func (ArgsDrain) Kind() string                 { return "leaderboard-d2-drain" }
func (ArgsDrain) InsertOpts() river.InsertOpts { return insertOptions() }

type JobInserter interface {
	Insert(context.Context, river.JobArgs, *river.InsertOpts) (*rivertype.JobInsertResult, error)
}
type Dispatcher struct {
	river.WorkerDefaults[ArgsDispatch]
	Store database.Store
	Queue JobInserter
}

func (d *Dispatcher) Work(ctx context.Context, job *river.Job[ArgsDispatch]) error {
	if !DispatchEnabled {
		return nil
	}
	return d.dispatch(ctx, job.Args)
}

// Paginated continuation gives every due tenant/family a turn even if a hot
// prefix stays dirty. Cursor continuations run promptly; bounded workers yield between bursts.
// Future-only or leased/backed-off scopes produce no jobs. Root periodic scans
// discover newly due keys; active River uniqueness suppresses duplicate jobs.
func (d *Dispatcher) dispatch(ctx context.Context, args ArgsDispatch) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	rows, err := d.Store.ListDueLeaderboardD2(servicetenant.AdminBypass(ctx), database.ListDueLeaderboardD2Params{AfterTenant: args.AfterTenant, AfterFamily: args.AfterFamily, LimitCount: BatchSize + 1})
	if err != nil {
		return err
	}
	more := len(rows) > BatchSize
	if more {
		rows = rows[:BatchSize]
	}
	for _, row := range rows {
		if err := ctx.Err(); err != nil {
			return err
		}
		if _, err = d.Queue.Insert(ctx, ArgsDrain{TenantID: row.TenantID, Family: Family(row.Family)}, nil); err != nil {
			return fmt.Errorf("dispatch tenant: %w", err)
		}
	}
	if more {
		last := rows[len(rows)-1]
		_, err = d.Queue.Insert(ctx, ArgsDispatch{AfterTenant: last.TenantID, AfterFamily: last.Family}, nil)
	}
	return err
}

type TenantWorker struct {
	river.WorkerDefaults[ArgsDrain]
	Worker *Worker
}

func (*TenantWorker) Timeout(*river.Job[ArgsDrain]) time.Duration { return WorkTimeout }
func (w *TenantWorker) Work(ctx context.Context, job *river.Job[ArgsDrain]) error {
	if !DispatchEnabled {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, WorkTimeout)
	defer cancel()
	var total DrainResult
	err := continueWork(ctx, func(ctx context.Context) (bool, error) {
		result, err := w.Worker.Drain(ctx, job.Args.TenantID, job.Args.Family)
		total.Claimed += result.Claimed
		total.Processed += result.Processed
		total.Failed += result.Failed
		return result.Claimed > 0, err
	}, func(ctx context.Context) (bool, error) {
		return w.Worker.Store.HasDueLeaderboardD2(servicetenant.WithTenantID(ctx, job.Args.TenantID), database.HasDueLeaderboardD2Params{TenantID: job.Args.TenantID, Family: int32(job.Args.Family)})
	})
	_ = river.RecordOutput(ctx, total)
	return err
}
