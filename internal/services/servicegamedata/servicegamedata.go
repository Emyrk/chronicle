package servicegamedata

import (
	"context"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/go-chi/chi/v5"
	"golang.org/x/time/rate"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"

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

// datasetIDFromContext resolves the dataset ID for game-data queries.
// Resolution order:
//  1. Tenant's default dataset (from tenant context / subdomain)
//  2. Server's compiled-in default dataset
func datasetIDFromContext(ctx context.Context) uuid.UUID {
	if t := servicetenant.TenantFromContext(ctx); t != nil && t.DefaultDatasetID.Valid {
		return t.DefaultDatasetID.UUID
	}
	return servicedataset.DefaultDatasetID
}

func (s *Service) setupRoutes(_ *authz.Authz) {
	s.router.Get("/tooltip/item/{item_id}", s.handleItemTooltip)
	s.router.Get("/tooltip/gem/{enchant_id}", s.handleGemTooltip)
	s.router.Get("/display/item/{item_id}", s.handleItemDisplay)
	s.router.Get("/sim/item/{item_id}", s.handleItemSim)

	// Rate limit search endpoints: burst 30, refill 5/min (one token every 12s).
	searchLimiter := newIPLimiter(rate.Every(12*time.Second), 30)
	s.router.With(searchLimiter.middleware).Get("/search/items", s.handleSearchItems)
	s.router.With(searchLimiter.middleware).Get("/search/creatures", s.handleSearchCreatures)
	s.router.With(searchLimiter.middleware).Get("/search/item-sets", s.handleSearchItemSets)
	s.router.With(searchLimiter.middleware).Get("/search/enchantments", s.handleSearchEnchantments)
	s.router.Get("/item-set", s.handleGetItemSetDetail)
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
