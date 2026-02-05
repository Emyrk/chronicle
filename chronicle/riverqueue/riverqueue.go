package riverqueue

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/chronicle"
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
	Logger    *slog.Logger
	Chronicle *chronicle.Chronicle
	Pool      *pgxpool.Pool

	LogParsingWorkers int
	InsertOnly        bool
}
type Queues struct {
	Client *river.Client[pgx.Tx]
	UI     http.Handler
}

func New(ctx context.Context, opts Options) (*Queues, error) {
	driver := riverpgxv5.New(opts.Pool)
	queues := map[string]river.QueueConfig{
		river.QueueDefault: {MaxWorkers: 5},
		QueueLogParsing:    {MaxWorkers: opts.LogParsingWorkers},
	}
	if opts.InsertOnly {
		queues = map[string]river.QueueConfig{}
	}

	workers := river.NewWorkers()
	river.AddWorker(workers, &chronicle.WorkerLogParse{
		Parent: opts.Chronicle,
	})
	river.AddWorker(workers, &chronicle.WorkerLogReparse{
		Parent: opts.Chronicle,
	})

	riverClient, err := river.NewClient(driver, &river.Config{
		Queues:  queues,
		Workers: workers,
		Middleware: []rivertype.Middleware{
			NewWorkerPanicMW(opts.Logger),
		},
		// Retain all jobs
		// TODO: Create our own reaper to clean up old jobs after a certain period
		CompletedJobRetentionPeriod: -1,
		RescueStuckJobsAfter:        time.Minute * 60,
		JobTimeout:                  time.Minute * 30,
	})
	if err != nil {
		return nil, err
	}

	err = riverClient.Start(ctx)
	if err != nil {
		return nil, err
	}

	riverUI, err := webUI(ctx, opts.Logger, riverClient)
	if err != nil {
		return nil, err
	}

	return &Queues{
		Client: riverClient,
		UI:     riverUI,
	}, nil
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
