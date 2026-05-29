package servicedataset

import (
	"context"

	"github.com/Emyrk/chronicle/database/datasetdb"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func OnDataset() string { return (&Service{}).Name() }

func Dataset(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

// DB returns the domain-specific dataset store.
func DB(broker *services.Services) datasetdb.Store {
	return Dataset(broker).db
}

type Service struct {
	broker *services.Services
	db     datasetdb.Store // <-- domain-specific interface, NOT database.Store
}

func New(broker *services.Services) *Service {
	return &Service{broker: broker}
}

func (s *Service) Name() string { return services.ServiceDataset }
func (s *Service) DependsOn() []string {
	return []string{servicelogger.OnLogger(), servicepgxpool.OnPGXPool()}
}
func (s *Service) Configures() []string  { return nil }
func (s *Service) Options() serpent.OptionSet { return nil }

func (s *Service) Start(_ context.Context) error {
	pool := servicepgxpool.PGXPool(s.broker)
	s.db = datasetdb.New(pool)
	return nil
}

func (s *Service) Close(_ context.Context) error { return nil }
