package serviceriver

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicechronicle"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
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

	q.AddQueue(riverqueue.QueueLogParsing, river.QueueConfig{
		MaxWorkers: int(s.logParsingWorkers),
	})

	riverqueue.AddWorker(q, chron.NewWorkerLogParse())
	riverqueue.AddWorker(q, chron.NewWorkerReLogParse())

	err = q.Start(ctx)
	if err != nil {
		return fmt.Errorf("starting river queues: %w", err)
	}

	s.Queues = q
	chron.SetQueue(s.Queues)
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
