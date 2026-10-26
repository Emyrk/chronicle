package riverqueue

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/leveledlog"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivertype"
	"riverqueue.com/riverui"
)

// Re-export constants from riverconst for backward compatibility.
const (
	QueueLogParsing           = riverconst.QueueLogParsing
	QueueDiscordSync          = riverconst.QueueDiscordSync
	QueueDiscordAnnouncements = riverconst.QueueDiscordAnnouncements
	QueueRetention            = riverconst.QueueRetention
	QueueRankings             = riverconst.QueueRankings
	QueueResync               = riverconst.QueueResync
	QueueRunStills            = riverconst.QueueRunStills
	PriorityHighest           = riverconst.PriorityHighest
	PriorityHigh              = riverconst.PriorityHigh
	PriorityDefault           = riverconst.PriorityDefault
	PriorityLow               = riverconst.PriorityLow
)

type Options struct {
	Logger   *slog.Logger
	Pool     *pgxpool.Pool
	Registry prometheus.Registerer

	LogParsingWorkers int
	InsertOnly        bool
}
type Queues struct {
	*river.Client[pgx.Tx]
	UI http.Handler

	opts              Options
	workers           *river.Workers
	queues            map[string]river.QueueConfig
	periodicJobs      []*river.PeriodicJob
	registry          prometheus.Registerer
	metrics           *riverMetrics
	cancelMetricsFeed func()
}

func New(_ context.Context, opts Options) (*Queues, error) {
	registry := opts.Registry
	if registry == nil {
		registry = prometheus.NewRegistry()
	}
	return &Queues{
		UI:      nil,
		opts:    opts,
		workers: river.NewWorkers(),
		queues: map[string]river.QueueConfig{
			river.QueueDefault: {MaxWorkers: 5},
		},
		registry: registry,
		metrics:  newRiverMetrics(registry),
	}, nil
}

func AddWorker[T rivertype.JobArgs](q *Queues, worker river.Worker[T]) *Queues {
	river.AddWorker(q.workers, worker)
	return q
}

func (q *Queues) AddQueue(name string, config river.QueueConfig) *Queues {
	q.queues[name] = config
	return q
}

func (q *Queues) AddPeriodicJob(job *river.PeriodicJob) *Queues {
	q.periodicJobs = append(q.periodicJobs, job)
	return q
}

// WorkerMiddleware returns the middleware shared by every Chronicle River
// worker client, including isolated CLI clients.
func WorkerMiddleware(logger *slog.Logger) []rivertype.Middleware {
	return []rivertype.Middleware{
		NewWorkerPanicMW(logger),
	}
}

func (q *Queues) Start(ctx context.Context) error {
	driver := riverpgxv5.New(q.opts.Pool)
	queues := q.queues
	if q.opts.InsertOnly {
		queues = map[string]river.QueueConfig{}
	}

	queueNames := make([]string, 0, len(q.queues))
	for name, config := range q.queues {
		queueNames = append(queueNames, name)
		q.metrics.configuredWorkers.WithLabelValues(name).Set(float64(config.MaxWorkers))
	}
	slices.Sort(queueNames)
	collector := newRiverQueueCollector(database.New(q.opts.Pool), q.opts.Logger, q.metrics, queueNames)
	if err := q.registry.Register(collector); err != nil {
		return fmt.Errorf("register River queue metrics collector: %w", err)
	}

	riverClient, err := river.NewClient(driver, &river.Config{
		Queues:       queues,
		Workers:      q.workers,
		Logger:       leveledlog.New(q.opts.Logger.With(slog.String("service", "riverqueue")), slog.LevelWarn),
		Middleware:   WorkerMiddleware(q.opts.Logger),
		Hooks:        []rivertype.Hook{q.metrics.hook()},
		PeriodicJobs: q.periodicJobs,
		// Retain all jobs
		// TODO: Create our own reaper to clean up old jobs after a certain period
		CompletedJobRetentionPeriod: time.Hour * 24 * 30, // 30 days
		RescueStuckJobsAfter:        time.Minute * 60,
		JobTimeout:                  time.Minute * 30,
	})
	if err != nil {
		return err
	}

	var metricEvents <-chan *river.Event
	if !q.opts.InsertOnly {
		var cancelMetricsFeed func()
		metricEvents, cancelMetricsFeed = riverClient.Subscribe(
			river.EventKindJobCancelled,
			river.EventKindJobCompleted,
			river.EventKindJobFailed,
			river.EventKindJobSnoozed,
		)
		q.cancelMetricsFeed = cancelMetricsFeed
	}
	err = riverClient.Start(ctx)
	if err != nil {
		if q.cancelMetricsFeed != nil {
			q.cancelMetricsFeed()
		}
		return err
	}
	if metricEvents != nil {
		go func() {
			for event := range metricEvents {
				q.metrics.observeEvent(event)
			}
		}()
	}

	riverUI, err := webUI(ctx, q.opts.Logger, riverClient)
	if err != nil {
		return err
	}
	q.UI = riverUI
	q.Client = riverClient

	return nil
}

func webUI(ctx context.Context, parentLogger *slog.Logger, client *river.Client[pgx.Tx]) (http.Handler, error) {
	endpoints := riverui.NewEndpoints(client, nil)

	// Drop debug logs
	logger := parentLogger.With(slog.String("server", "river_ui"))
	logger = leveledlog.New(logger, slog.LevelInfo)

	opts := &riverui.HandlerOpts{
		DevMode:                  false,
		Endpoints:                endpoints,
		JobListHideArgsByDefault: false,
		LiveFS:                   false,
		Logger:                   logger,
		Prefix:                   "/river",
	}

	srv, err := riverui.NewHandler(opts)
	if err != nil {
		return nil, fmt.Errorf("new handler: %w", err)
	}

	err = srv.Start(ctx)
	if err != nil {
		return nil, fmt.Errorf("start riverui server: %w", err)
	}

	riverHandler := withLogLinks(srv)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uc := chronauth.MustAuthenticatedClaims(r.Context())
		// TODO: Check if administrator
		var _ = uc

		riverHandler.ServeHTTP(w, r)
	}), nil
}

func (q *Queues) Close(ctx context.Context) error {
	if q.cancelMetricsFeed != nil {
		q.cancelMetricsFeed()
	}
	return q.StopAndCancel(ctx)
}
