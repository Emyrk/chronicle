package riverservice

import (
	"context"

	"github.com/Emyrk/chronicle/chronicle/riverqueue"
	"github.com/Emyrk/chronicle/internal/services"

	"github.com/coder/serpent"
)

type Service struct {
	queue             *riverqueue.Queues
	logParsingWorkers int64
}

func New() *Service {
	return &Service{}
}

func (s *Service) Name() string {
	return services.ServiceRiverQueue
}

func (s *Service) Start(ctx context.Context) error {
	return nil
}

func (s *Service) Close(ctx context.Context) error {
	return s.queue.Close(ctx)
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
