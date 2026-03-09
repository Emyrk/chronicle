package servicegamedata

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func OnGameData() string {
	return (&Service{}).Name()
}

func GameData(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

type Service struct {
	broker *services.Services
	router chi.Router
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
	}
}

func (s *Service) Name() string {
	return services.ServiceGameData
}

func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
	}
}

func (s *Service) Start(_ context.Context) error {
	logger := servicelogger.Logger(s.broker)
	s.router = chi.NewRouter()
	s.setupRoutes()
	logger.Info("GameData service started")
	return nil
}

func (s *Service) setupRoutes() {
	// TODO: Add game data endpoints (items, etc.)
}

func (s *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func (s *Service) Close(_ context.Context) error {
	return nil
}

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{}
}

func (s *Service) Configures() []string {
	return []string{}
}
