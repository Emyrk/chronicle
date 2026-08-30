package serviceexternalapi

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/coder/serpent"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
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
type externalAPIStore interface {
	ListExternalAPIServers(context.Context) ([]database.ListExternalAPIServersRow, error)
	ResolveExternalAPIServer(context.Context, string) (database.ResolveExternalAPIServerRow, error)
	ListExternalAPIRealms(context.Context, string) ([]database.ListExternalAPIRealmsRow, error)
	ResolveExternalAPIRealm(context.Context, database.ResolveExternalAPIRealmParams) (database.ResolveExternalAPIRealmRow, error)
	GetExternalAPICharacter(context.Context, database.GetExternalAPICharacterParams) (database.GetExternalAPICharacterRow, error)
	ListExternalAPICharacterLogs(context.Context, database.ListExternalAPICharacterLogsParams) ([]database.ListExternalAPICharacterLogsRow, error)
	SpeedrunLeaderboard(context.Context, database.SpeedrunLeaderboardParams) ([]database.SpeedrunLeaderboardRow, error)
	ListExternalAPILeaderboardDuplicateLogs(context.Context, database.ListExternalAPILeaderboardDuplicateLogsParams) ([]database.ListExternalAPILeaderboardDuplicateLogsRow, error)
	ListExternalAPIRecentInstances(context.Context, database.ListExternalAPIRecentInstancesParams) ([]database.ListExternalAPIRecentInstancesRow, error)
	InstanceBySlug(context.Context, pgtype.Text) (database.LogInstancesGuild, error)
	EncountersByInstanceID(context.Context, uuid.UUID) ([]database.LogInstanceEncounter, error)
	InstanceUnitsByInstanceID(context.Context, uuid.UUID) ([]database.LogInstanceUnit, error)
	InstancePlayersByInstanceID(context.Context, uuid.UUID) ([]database.LogInstancePlayer, error)
	GetInstanceEncounterCharacterFights(context.Context, uuid.UUID) ([]database.LogInstanceEncounterHostile, error)
	GetEncounterPhasesByInstanceID(context.Context, uuid.UUID) ([]database.LogInstanceEncounterPhase, error)
	InstanceEvent(context.Context, database.InstanceEventParams) (database.LogInstanceEvent, error)
}

type Service struct {
	broker  *services.Services
	db      externalAPIStore
	router  chi.Router
	openapi OpenAPIDocument
}

func New(broker *services.Services) *Service {
	return &Service{broker: broker}
}

func (s *Service) Name() string         { return services.ServiceExternalAPI }
func (s *Service) Configures() []string { return nil }
func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		servicedbstore.OnDatabaseStore(),
	}
}

func (s *Service) Start(_ context.Context) error {
	s.db = servicedbstore.DatabaseStore(s.broker)
	s.setupRoutes()
	servicelogger.Logger(s.broker).Info("external API service started")
	return nil
}

func (s *Service) setupRoutes() {
	s.router = chi.NewRouter()
	s.openapi = newOpenAPIDocument()
	s.registerRoutes()
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
