package serviceparser

import (
	"context"
	"fmt"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicechronicle"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"

	"github.com/coder/serpent"
	"github.com/riverqueue/river"
)

var _ services.Servicer = (*Service)(nil)

type Service struct {
	broker *services.Services

	queues            *riverqueue.Queues
	logParsingWorkers int64
}

func New(broker *services.Services) *Service {
	return &Service{broker: broker}
}

func (s *Service) Name() string { return services.ServiceParser }

func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		servicepgxpool.OnPGXPool(),
		servicechronicle.OnChronicle(),
	}
}

func (s *Service) Configures() []string { return nil }

func (s *Service) Start(ctx context.Context) error {
	if s.logParsingWorkers < 1 {
		return fmt.Errorf("log parsing worker count must be at least 1")
	}

	logger := servicelogger.Logger(s.broker)
	pool := servicepgxpool.PGXPool(s.broker)
	chron := servicechronicle.Chronicle(s.broker)

	q, err := riverqueue.New(ctx, riverqueue.Options{
		Logger: logger,
		Pool:   pool,
	})
	if err != nil {
		return fmt.Errorf("creating parser queue: %w", err)
	}

	q.RemoveQueue(river.QueueDefault)
	chron.RegisterParsingWorkers(q, int(s.logParsingWorkers))
	s.queues = q
	chron.SetQueue(q)
	if err := q.Start(ctx); err != nil {
		return fmt.Errorf("starting parser queue: %w", err)
	}

	return nil
}

func (s *Service) Close(ctx context.Context) error {
	if s.queues == nil {
		return nil
	}
	return s.queues.Close(ctx)
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
