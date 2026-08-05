package serviceexternalapi

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/coder/serpent"
	"github.com/go-chi/chi/v5"
)

var (
	_ services.Servicer = (*Service)(nil)
	_ http.Handler      = (*Service)(nil)
)

func ExternalAPI(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

func OnExternalAPI() string {
	return (&Service{}).Name()
}

// Service owns Chronicle's public, unauthenticated API endpoints.
type Service struct {
	broker *services.Services
	router chi.Router
}

func New(broker *services.Services) *Service {
	return &Service{broker: broker}
}

func (s *Service) Name() string         { return services.ServiceExternalAPI }
func (s *Service) Configures() []string { return nil }
func (s *Service) DependsOn() []string {
	return []string{servicelogger.OnLogger()}
}

func (s *Service) Start(_ context.Context) error {
	s.setupRoutes()
	servicelogger.Logger(s.broker).Info("external API service started")
	return nil
}

func (s *Service) setupRoutes() {
	s.router = chi.NewRouter()
	s.router.Get("/health", s.health)
}

func (s *Service) Close(_ context.Context) error { return nil }
func (s *Service) Options() serpent.OptionSet    { return nil }

func (s *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

type HealthResponse struct {
	Status string `json:"status"`
}

func (s *Service) health(w http.ResponseWriter, r *http.Request) {
	httpapi.Write(r.Context(), w, http.StatusOK, HealthResponse{Status: "ok"})
}
