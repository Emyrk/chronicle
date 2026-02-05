package riverqueue

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/internal/leveledlog"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivertype"
	"riverqueue.com/riverui"
)

const (
	QueueLogParsing = "log-parsing"
)

const (
	PriorityHighest = 1
	PriorityHigh    = 2
	PriorityDefault = 3
	PriorityLow     = 4
)

type Options struct {
	Logger *slog.Logger
	Pool   *pgxpool.Pool

	LogParsingWorkers int
	InsertOnly        bool
}
type Queues struct {
	*river.Client[pgx.Tx]
	UI http.Handler

	opts    Options
	workers *river.Workers
	queues  map[string]river.QueueConfig
}

func New(_ context.Context, opts Options) (*Queues, error) {
	return &Queues{
		UI:      nil,
		opts:    opts,
		workers: river.NewWorkers(),
		queues: map[string]river.QueueConfig{
			river.QueueDefault: {MaxWorkers: 5},
		},
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

func (q *Queues) Start(ctx context.Context) error {
	driver := riverpgxv5.New(q.opts.Pool)
	queues := q.queues
	if q.opts.InsertOnly {
		queues = map[string]river.QueueConfig{}
	}

	riverClient, err := river.NewClient(driver, &river.Config{
		Queues:  queues,
		Workers: q.workers,
		Middleware: []rivertype.Middleware{
			NewWorkerPanicMW(q.opts.Logger),
		},
		// Retain all jobs
		// TODO: Create our own reaper to clean up old jobs after a certain period
		CompletedJobRetentionPeriod: -1,
		RescueStuckJobsAfter:        time.Minute * 60,
		JobTimeout:                  time.Minute * 30,
	})
	if err != nil {
		return err
	}

	err = riverClient.Start(ctx)
	if err != nil {
		return err
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

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uc := chronauth.MustAuthenticatedClaims(r.Context())
		// TODO: Check if administrator
		var _ = uc

		srv.ServeHTTP(w, r)
	}), nil
}

func (q *Queues) Close(ctx context.Context) error {
	return q.Client.StopAndCancel(ctx)
}
