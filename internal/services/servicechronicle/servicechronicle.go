package servicechronicle

import (
	"context"

	"github.com/Emyrk/chronicle/chronicle"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/dbstoreservice"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicestorage"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func Chronicle(broker *services.Services) *chronicle.Chronicle {
	srv := services.MustGet[*Service](broker)
	return srv.chronicle
}

func OnChronicle() string {
	return (&Service{}).Name()
}

type Service struct {
	broker *services.Services

	chronicle *chronicle.Chronicle
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
	}
}

func (s *Service) Name() string {
	return services.ServiceChronicle
}

func (s *Service) Start(ctx context.Context) error {
	logger := servicelogger.Logger(s.broker)
	db := dbstoreservice.DatabaseStore(s.broker)
	st := servicestorage.Storage(s.broker)

	c, err := chronicle.New(ctx, logger, chronicle.Options{
		Storage: st,
		DB:      db,
	})
	if err != nil {
		return err
	}
	s.chronicle = c

	return nil
}

func (s *Service) Close(_ context.Context) error {
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{}
}

func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		dbstoreservice.OnDatabaseStore(),
		dbstoreservice.OnDatabaseStore(),
	}
}

func (s *Service) Configures() []string {
	return []string{}
}
