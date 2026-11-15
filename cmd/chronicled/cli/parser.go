package cli

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/internal/parseradmission"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
	"github.com/Emyrk/chronicle/internal/services/servicestorage"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/coder/serpent"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
)

// ParserCmd runs the native compute stage in this exact executable. No HTTP
// server, authorization service, tenant router, or primary worker graph starts.
func ParserCmd() *serpent.Command {
	broker := parserServices()
	var primaryURL string
	var workers int64
	var interval time.Duration
	opts := broker.OptionSet()
	for index := range opts {
		if opts[index].Flag == "storage-type" {
			opts[index].Default = "s3"
		}
	}
	opts = append(opts, serpent.OptionSet{
		{Name: "Primary URL", Flag: "primary-url", Env: "CHRONICLE_PRIMARY_URL", Required: true, Description: "Consistent primary origin for exact binary compatibility (not a mixed-build load balancer).", Value: serpent.StringOf(&primaryURL)},
		{Name: "Parser Workers", Flag: "log-parsing-workers", Env: "CHRONICLE_LOG_PARSING_WORKERS", Default: "1", Value: serpent.Int64Of(&workers)},
		{Name: "Compatibility Poll Interval", Flag: "compatibility-poll-interval", Env: "CHRONICLE_COMPATIBILITY_POLL_INTERVAL", Default: "5s", Value: serpent.DurationOf(&interval)},
	}...)
	return &serpent.Command{Use: "parser", Short: "Run only native parsing against a compatible primary", Options: opts, Handler: func(i *serpent.Invocation) error {
		if workers < 1 || interval <= 0 {
			return fmt.Errorf("parser workers and compatibility interval must be positive")
		}
		ctx, cancel := context.WithCancel(i.Context())
		defer cancel()
		logger := getLogger(i)
		identity, err := parserStartupIdentity(logger)
		if err != nil {
			return err
		}
		fetch, err := parseradmission.HTTPFetcher(primaryURL)
		if err != nil {
			return err
		}
		gate, err := parseradmission.New(identity, fetch)
		if err != nil {
			return err
		}
		defer gate.Close()
		// Fail closed before any queue can fetch a job.
		if err := gate.Refresh(ctx); err != nil {
			return fmt.Errorf("initial primary compatibility: %w", err)
		}
		if err := broker.Start(ctx, logger); err != nil {
			return err
		}
		defer func() {
			shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			_ = broker.Close(shutdown)
		}()
		pool := servicepgxpool.PGXPool(broker)
		worker, err := chronicle.NewHeadlessParseWorker(chronicle.HeadlessParseOptions{
			Pool: pool, Storage: servicestorage.Storage(broker), Logger: logger, BinaryIdentity: identity, Admit: gate.Admit,
		})
		if err != nil {
			return err
		}
		queues, err := riverqueue.New(ctx, riverqueue.Options{Pool: pool, Logger: logger, ExplicitQueues: true, DisableUI: true})
		if err != nil {
			return err
		}
		config := river.QueueConfig{MaxWorkers: int(workers)}
		queues.AddQueue(chronicle.QueueNativeLogParsing, config)
		riverqueue.AddWorker(queues, worker)
		if err := gate.Refresh(ctx); err != nil {
			return fmt.Errorf("pre-start primary compatibility: %w", err)
		}
		if err := queues.Start(ctx); err != nil {
			return err
		}
		defer func() {
			gate.Close()
			shutdown, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			_ = queues.Close(shutdown)
		}()
		logger.Info("headless parser started", "binary_identity", identity, "queue", chronicle.QueueNativeLogParsing)
		return gate.Watch(ctx, queues.Queues(), chronicle.QueueNativeLogParsing, config, interval, logger)
	}}
}

// Only the context-aware database hooks are installed. The tenant service and
// its HTTP/cache graph are deliberately not started in this process.
func parserPoolHooks(cfg *pgxpool.Config) {
	cfg.PrepareConn = func(ctx context.Context, conn *pgx.Conn) (bool, error) {
		return true, servicetenant.PrepareConn(ctx, conn)
	}
	cfg.AfterRelease = func(conn *pgx.Conn) bool { servicetenant.ResetConn(conn); return true }
}
