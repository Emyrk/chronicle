package servicedbstore

import (
	"context"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func DatabaseStore(broker *services.Services) database.Store {
	srv := services.MustGet[*Service](broker)
	return srv.db
}

func OnDatabaseStore() string {
	return (&Service{}).Name()
}

type Service struct {
	broker *services.Services

	db database.Store
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
	}
}

func (s *Service) Name() string {
	return services.ServiceDatabase
}

func (s *Service) Configures() []string { return []string{} }
func (s *Service) DependsOn() []string {
	return []string{
		servicepgxpool.OnPGXPool(),
	}
}

func (s *Service) Start(_ context.Context) error {
	pool := servicepgxpool.PGXPool(s.broker)
	db := database.New(pool)
	s.db = db

	return nil
}

func (s *Service) Close(_ context.Context) error {
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{}
}
