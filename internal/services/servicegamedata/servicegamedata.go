package servicegamedata

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/go-chi/chi/v5"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func OnInternalGameData() string {
	return (&Service{}).Name()
}

func InternalGameData(broker *services.Services) *Service {
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
		servicedbstore.OnDatabaseStore(),
		serviceauthz.OnAuthz(),
	}
}

func (s *Service) Start(_ context.Context) error {
	logger := servicelogger.Logger(s.broker)
	zed := serviceauthz.Authz(s.broker)
	s.router = chi.NewRouter()
	s.setupRoutes(zed)
	logger.Info("InternalGameData service started")
	return nil
}

func (s *Service) setupRoutes(zed *authz.Authz) {
	s.router.Get("/tooltip/item/{item_id}", s.handleItemTooltip)
	s.router.Get("/display/item/{item_id}", s.handleItemDisplay)

	mw := httpmw.Can(zed, policy.New().GlobalChronicle().CanInternal_game_data_User)
	s.router.Get("/sim/item/{item_id}", mw(http.HandlerFunc(s.handleItemSim)).ServeHTTP)
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
