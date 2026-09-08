package servicesupport

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/coder/serpent"
	"github.com/go-chi/chi/v5"
)

var _ services.Servicer = (*Service)(nil)

type Service struct {
	broker  *services.Services
	enabled bool
	db      database.Store
	public  chi.Router
	admin   chi.Router
}

func New(broker *services.Services) *Service     { return &Service{broker: broker} }
func Support(broker *services.Services) *Service { return services.MustGet[*Service](broker) }
func OnSupport() string                          { return (&Service{}).Name() }
func (s *Service) Name() string                  { return services.ServiceSupport }
func (s *Service) Configures() []string          { return nil }
func (s *Service) DependsOn() []string {
	return []string{servicelogger.OnLogger(), servicedbstore.OnDatabaseStore()}
}
func (s *Service) Enabled() bool              { return s.enabled }
func (s *Service) PublicRoutes() http.Handler { return s.public }
func (s *Service) AdminRoutes() http.Handler  { return s.admin }

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{{
		Name:        "Support Tracking Enabled",
		Description: "Enable donation transparency tracking and support APIs.",
		Flag:        "support-enabled",
		Env:         "CHRONICLE_SUPPORT_ENABLED",
		Default:     "false",
		Value:       serpent.BoolOf(&s.enabled),
	}}
}

func (s *Service) Start(_ context.Context) error {
	if !s.enabled {
		return nil
	}
	s.db = servicedbstore.DatabaseStore(s.broker)
	s.setupRoutes()
	servicelogger.Logger(s.broker).Info("support tracking service started")
	return nil
}

func (s *Service) setupRoutes() {
	s.public = chi.NewRouter()
	s.public.Get("/summary", s.getSummary)

	s.admin = chi.NewRouter()
	s.admin.Get("/", s.getAdmin)
	s.admin.Put("/settings", s.updateSettings)
	s.admin.Post("/services", s.createService)
	s.admin.Put("/services/{serviceID}", s.updateService)
	s.admin.Delete("/services/{serviceID}", s.deleteService)
}

func (s *Service) Close(_ context.Context) error { return nil }
