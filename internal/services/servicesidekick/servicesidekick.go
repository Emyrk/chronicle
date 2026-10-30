package servicesidekick

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/serviceoauth"
	"github.com/coder/serpent"
	"github.com/go-chi/chi/v5"
)

var _ services.Servicer = (*Service)(nil)

func Sidekick(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

func OnSidekick() string {
	return (&Service{}).Name()
}

type Service struct {
	broker *services.Services
	zed    *authz.Authz
	logger *slog.Logger

	accountRoutes chi.Router
	statusRoutes  chi.Router
	adminRoutes   chi.Router
}

func New(broker *services.Services) *Service {
	return &Service{broker: broker}
}

func (s *Service) Name() string { return services.ServiceSidekick }

func (s *Service) DependsOn() []string {
	return []string{
		serviceauthz.OnAuthz(),
		servicelogger.OnLogger(),
		serviceoauth.OnOAuth(),
	}
}

func (s *Service) Configures() []string       { return nil }
func (s *Service) Options() serpent.OptionSet { return nil }

func (s *Service) Start(_ context.Context) error {
	s.zed = serviceauthz.Authz(s.broker)
	s.logger = services.NamedLogger(servicelogger.Logger(s.broker), s.Name())
	s.setupRoutes()
	s.logger.Info("sidekick service started")
	return nil
}

func (s *Service) Close(context.Context) error { return nil }

func (s *Service) setupRoutes() {
	s.accountRoutes = chi.NewRouter()
	s.accountRoutes.Get("/", s.ListMySidekicks)
	s.accountRoutes.Get("/{sidekickID}/config", s.GetMySidekickConfig)
	s.accountRoutes.Put("/{sidekickID}/config", s.PutMySidekickConfig)
	s.accountRoutes.Delete("/{sidekickID}/config", s.DeleteMySidekickConfig)
	s.accountRoutes.Patch("/{sidekickID}", s.RenameMySidekick)
	s.accountRoutes.Delete("/{sidekickID}", s.DisconnectMySidekick)

	s.statusRoutes = chi.NewRouter()
	s.statusRoutes.Put("/status", s.UpdateSidekickStatus)

	s.adminRoutes = chi.NewRouter()
	s.adminRoutes.Get("/", s.AdminListUserSidekicks)
}

func (s *Service) AccountRoutes() http.Handler { return s.accountRoutes }
func (s *Service) StatusRoutes() http.Handler  { return s.statusRoutes }
func (s *Service) AdminRoutes() http.Handler   { return s.adminRoutes }
