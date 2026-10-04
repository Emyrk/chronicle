package servicetelemetry

import (
	"context"
	"time"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceaccessurl"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

// TelemetryService returns the telemetry service from the broker.
func TelemetryService(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

// OnTelemetry returns the service name for dependency declarations.
func OnTelemetry() string {
	return (&Service{}).Name()
}

// Service collects and reports telemetry data from self-hosted Chronicle
// installations. It exposes a Worker that serviceriver registers with the
// queue and schedules as a periodic job.
type Service struct {
	broker *services.Services

	Worker   *Worker
	Schedule time.Duration
}

func New(broker *services.Services) *Service {
	return &Service{
		broker:   broker,
		Schedule: time.Hour,
	}
}

func (s *Service) Name() string {
	return services.ServiceTelemetry
}

func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		servicedbstore.OnDatabaseStore(),
		serviceaccessurl.OnAccessURL(),
	}
}

func (s *Service) Configures() []string { return []string{} }

func (s *Service) Start(_ context.Context) error {
	logger := servicelogger.Logger(s.broker)
	store := servicedbstore.DatabaseStore(s.broker)
	accessURL := serviceaccessurl.AccessURL(s.broker)

	namedLogger := services.NamedLogger(logger, s.Name())

	s.Worker = &Worker{
		Store:     store,
		Logger:    namedLogger,
		AccessURL: accessURL,
	}

	return nil
}

func (s *Service) Close(_ context.Context) error {
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{}
}
