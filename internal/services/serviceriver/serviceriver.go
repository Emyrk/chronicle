package serviceriver

import (
	"context"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicechronicle"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func RiverQueue(broker *services.Services) *Service {
	srv := services.MustGet[*Service](broker)
	return srv
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

func (s *Service) Start(ctx context.Context) error {
	logger := servicelogger.Logger(s.broker)
	pool := servicepgxpool.PGXPool(s.broker)
	chron := servicechronicle.Chronicle(s.broker)

	q, err := riverqueue.New(ctx, riverqueue.Options{
		Logger:            logger,
		Chronicle:         chron,
		Pool:              pool,
		LogParsingWorkers: int(s.logParsingWorkers),
		InsertOnly:        false,
	})
	s.Queues = q
	if err != nil {
		return err
	}
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

func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		servicepgxpool.OnPGXPool(),
		servicechronicle.OnChronicle(),
	}
}

func (s *Service) Configures() []string {
	return []string{}
}
