package chronicle

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivertype"
)

type RiverQueueOptions struct {
	DBURL             string
	InsertOnly        bool
	LogParsingWorkers int64
}

func (c *Chronicle) StartQueues(ctx context.Context, opts Options) error {
	cfg, migDone, err := database.PoolConfig(c.logger, opts.Queue.DBURL)
	if err != nil {
		return fmt.Errorf("db url for queues: %w", err)
	}
	migDone()

	// Pool changes
	cfg.MaxConns = 2 // Smaller pool for background workers

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return fmt.Errorf("new pool: %w", err)
	}

	driver := riverpgxv5.New(pool)

	riverClient, err := river.NewClient(driver, &river.Config{
		Queues:  c.queues(opts.Queue),
		Workers: c.workers(opts.Queue),
		Middleware: []rivertype.Middleware{
			NewWorkerPanicMW(c.logger),
		},
		// Retain all jobs
		// TODO: Create our own reaper to clean up old jobs after a certain period
		CompletedJobRetentionPeriod: -1,
		RescueStuckJobsAfter:        time.Minute * 60,
		JobTimeout:                  time.Minute * 30,
	})


	if err != nil {
		return fmt.Errorf("new river client: %w", err)
	}
	c.queue = riverClient

	err = riverClient.Start(ctx)
	if err != nil {
		return fmt.Errorf("start river client: %w", err)
	}

	return nil
}

func (c *Chronicle) queues(opts RiverQueueOptions) map[string]river.QueueConfig {
	if opts.InsertOnly {
		return nil
	}
	return map[string]river.QueueConfig{
		river.QueueDefault: {MaxWorkers: 5},
		QueueLogParsing:    {MaxWorkers: int(opts.LogParsingWorkers)},
	}
}

func (c *Chronicle) workers(opts RiverQueueOptions) *river.Workers {
	workers := river.NewWorkers()

	if opts.LogParsingWorkers <= 0 {
		return workers
	}

	river.AddWorker(workers, &WorkerLogParse{
		Parent: c,
	})
	river.AddWorker(workers, &WorkerLogReparse{
		Parent: c,
	})

	return workers
}
