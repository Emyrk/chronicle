package serviceriver

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/chronicle/retention"
	"github.com/google/uuid"
	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicebot"
	"github.com/Emyrk/chronicle/internal/services/servicechronicle"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/serviceretention"
	"github.com/Emyrk/chronicle/internal/services/servicetelemetry"
	"github.com/riverqueue/river"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func RiverQueue(broker *services.Services) *riverqueue.Queues {
	srv := services.MustGet[*Service](broker)
	return srv.Queues
}

func OnRiverQueue() string {
	return (&Service{}).Name()
}

type Service struct {
	broker *services.Services

	*riverqueue.Queues
	logParsingWorkers int64
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
	}
}

func (s *Service) Name() string {
	return services.ServiceRiverQueue
}

func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		servicepgxpool.OnPGXPool(),
		servicechronicle.OnChronicle(),
		servicebot.OnDiscordBot(),
		serviceretention.OnRetention(),
		servicetelemetry.OnTelemetry(),
		servicerankings.OnRankings(),
	}
}

func (s *Service) Start(ctx context.Context) error {
	logger := servicelogger.Logger(s.broker)
	pool := servicepgxpool.PGXPool(s.broker)
	chron := servicechronicle.Chronicle(s.broker)

	q, err := riverqueue.New(ctx, riverqueue.Options{
		Logger:            logger,
		Pool:              pool,
		LogParsingWorkers: int(s.logParsingWorkers),
		InsertOnly:        false,
	})
	if err != nil {
		return fmt.Errorf("creating river queues: %w", err)
	}

	bot := servicebot.DiscordBot(s.broker)

	q.AddQueue(riverqueue.QueueLogParsing, river.QueueConfig{
		MaxWorkers: int(s.logParsingWorkers),
	})
	q.AddQueue(riverqueue.QueueDiscordSync, river.QueueConfig{
		MaxWorkers: 2,
	})

	riverqueue.AddWorker(q, chron.NewWorkerLogParse())
	riverqueue.AddWorker(q, chron.NewWorkerReLogParse())
	riverqueue.AddWorker(q, chron.NewWorkerRegressionSnapshot())
	riverqueue.AddWorker(q, bot.NewWorkerSyncDiscordUser())
	riverqueue.AddWorker(q, bot.NewWorkerNotifyApplication())

	// Register retention workers and periodic job.
	ret := serviceretention.RetentionService(s.broker)
	ret.Worker.Queue = q
	ret.RealmWorker.Queue = q
	riverqueue.AddWorker(q, ret.Worker)
	riverqueue.AddWorker(q, ret.RealmWorker)
	riverqueue.AddWorker(q, ret.RawLogWorker)
	q.AddQueue(riverqueue.QueueRetention, river.QueueConfig{
		MaxWorkers: 3,
	})
	if ret.Schedule > 0 {
		q.AddPeriodicJob(
			river.NewPeriodicJob(
				river.PeriodicInterval(ret.Schedule),
				func() (river.JobArgs, *river.InsertOpts) {
					return retention.ArgsRetention{DryRun: false}, nil
				},
				&river.PeriodicJobOpts{RunOnStart: false},
			),
		)
		q.AddPeriodicJob(
			river.NewPeriodicJob(
				river.PeriodicInterval(ret.Schedule),
				func() (river.JobArgs, *river.InsertOpts) {
					return retention.ArgsRawLogRetention{}, nil
				},
				&river.PeriodicJobOpts{RunOnStart: false},
			),
		)
	}

	// Register telemetry worker and periodic job.
	tel := servicetelemetry.TelemetryService(s.broker)
	riverqueue.AddWorker(q, tel.Worker)
	if tel.Schedule > 0 {
		q.AddPeriodicJob(
			river.NewPeriodicJob(
				river.PeriodicInterval(tel.Schedule),
				func() (river.JobArgs, *river.InsertOpts) {
					return servicetelemetry.ArgsTelemetryReport{}, nil
				},
				&river.PeriodicJobOpts{RunOnStart: true},
			),
		)
	}

	// Register rankings summary refresh workers and periodic job (hourly).
	rank := servicerankings.Rankings(s.broker)
	rank.SummaryDispatchWorker.Queue = q
	riverqueue.AddWorker(q, rank.SummaryDispatchWorker)
	riverqueue.AddWorker(q, rank.SummaryTenantWorker)
	rank.SnapshotDispatchWorker.Queue = q
	riverqueue.AddWorker(q, rank.SnapshotDispatchWorker)
	riverqueue.AddWorker(q, rank.SnapshotTenantWorker)
	rank.TimeParseSnapshotDispatchWorker.Queue = q
	riverqueue.AddWorker(q, rank.TimeParseSnapshotDispatchWorker)
	riverqueue.AddWorker(q, rank.TimeParseSnapshotTenantWorker)
	rank.ComputeParseScoresWorker.Queue = q
	riverqueue.AddWorker(q, rank.ComputeParseScoresWorker)
	rank.RepairParseScoresWorker.Queue = q
	riverqueue.AddWorker(q, rank.RepairParseScoresWorker)
	q.AddQueue(riverqueue.QueueRankings, river.QueueConfig{
		MaxWorkers: 1,
	})
	q.AddPeriodicJob(
		river.NewPeriodicJob(
			river.PeriodicInterval(1*time.Hour),
			func() (river.JobArgs, *river.InsertOpts) {
				return servicerankings.ArgsRefreshRankingsSummaries{}, nil
			},
			&river.PeriodicJobOpts{RunOnStart: true},
		),
	)
	q.AddPeriodicJob(
		river.NewPeriodicJob(
			river.PeriodicInterval(1*time.Hour),
			func() (river.JobArgs, *river.InsertOpts) {
				return servicerankings.ArgsPublishParseSnapshots{}, nil
			},
			&river.PeriodicJobOpts{RunOnStart: true},
		),
	)
	q.AddPeriodicJob(
		river.NewPeriodicJob(
			river.PeriodicInterval(1*time.Hour),
			func() (river.JobArgs, *river.InsertOpts) {
				return servicerankings.ArgsPublishTimeParseSnapshots{}, nil
			},
			&river.PeriodicJobOpts{RunOnStart: true},
		),
	)
	// Daily bounded repair dispatcher for parse score receipts.
	// Finds ALL eligible instances missing a matching receipt.
	q.AddPeriodicJob(
		river.NewPeriodicJob(
			river.PeriodicInterval(24*time.Hour),
			func() (river.JobArgs, *river.InsertOpts) {
				return servicerankings.ArgsRepairParseScores{
					TenantID: uuid.Nil, // default tenant
				}, nil
			},
			&river.PeriodicJobOpts{RunOnStart: false},
		),
	)

	err = q.Start(ctx)
	if err != nil {
		return fmt.Errorf("starting river queues: %w", err)
	}

	s.Queues = q
	chron.SetQueue(s.Queues)
	bot.SetQueue(s.Queues)
	return nil
}

func (s *Service) Close(ctx context.Context) error {
	return s.Queues.Close(ctx)
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "Log Parsing Worker Count",
			Description: "Number of workers to use for parsing raid log files.",
			Required:    false,
			Flag:        "log-parse-worker-count",
			Env:         "CHRONICLE_LOG_PARSING_WORKERS",
			Default:     "1",
			Value:       serpent.Int64Of(&s.logParsingWorkers),
		},
	}
}

func (s *Service) Configures() []string {
	return []string{}
}
