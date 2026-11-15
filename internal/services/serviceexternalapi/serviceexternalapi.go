package serviceexternalapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/serviceoauth"
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
	RankingsLeaderboardNoJIT(context.Context, database.RankingsLeaderboardParams) ([]database.RankingsLeaderboardRow, error)
	SpeedrunLeaderboard(context.Context, database.SpeedrunLeaderboardParams) ([]database.SpeedrunLeaderboardRow, error)
	ListExternalAPILeaderboardDuplicateLogs(context.Context, database.ListExternalAPILeaderboardDuplicateLogsParams) ([]database.ListExternalAPILeaderboardDuplicateLogsRow, error)
	ListExternalAPIRecentInstances(context.Context, database.ListExternalAPIRecentInstancesParams) ([]database.ListExternalAPIRecentInstancesRow, error)
	PublicInstance(context.Context, uuid.UUID) (database.LogInstancesGuild, error)
	PublicInstanceBySlug(context.Context, pgtype.Text) (database.LogInstancesGuild, error)
	EncountersByInstanceID(context.Context, uuid.UUID) ([]database.LogInstanceEncounter, error)
	InstanceUnitsByInstanceID(context.Context, uuid.UUID) ([]database.LogInstanceUnit, error)
	InstancePlayersByInstanceID(context.Context, uuid.UUID) ([]database.LogInstancePlayer, error)
	GetInstanceEncounterCharacterFights(context.Context, uuid.UUID) ([]database.LogInstanceEncounterHostile, error)
	GetEncounterPhasesByInstanceID(context.Context, uuid.UUID) ([]database.LogInstanceEncounterPhase, error)
	ResolveDatasetByRealm(context.Context, uuid.UUID) (database.ResolveDatasetByRealmRow, error)
	InstanceRankingRecords(context.Context, uuid.UUID) ([]database.EncounterDpsRankingsResolved, error)
	GetParseScoreResultsForInstance(context.Context, uuid.UUID) ([]database.ParseScoreResultsResolved, error)
	InstanceEvent(context.Context, database.InstanceEventParams) (database.LogInstanceEvent, error)
}

// accessTokenValidator is intentionally narrow: external API requests only need
// the application identity, never the owner's user-session privileges.
type accessTokenValidator interface {
	ValidateAccessToken(context.Context, string) (serviceoauth.AccessTokenIdentity, error)
}

type Service struct {
	broker      *services.Services
	db          externalAPIStore
	oauth       accessTokenValidator
	router      chi.Router
	rateLimiter *externalIPLimiter
	openapi     OpenAPIDocument
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
		serviceoauth.OnOAuth(),
	}
}

func (s *Service) Start(_ context.Context) error {
	s.db = servicedbstore.DatabaseStore(s.broker)
	s.oauth = serviceoauth.OAuth(s.broker)
	s.setupRoutes()
	servicelogger.Logger(s.broker).Info("external API service started")
	return nil
}

func (s *Service) setupRoutes() {
	s.router = chi.NewRouter()
	s.rateLimiter = newExternalIPLimiter()
	s.openapi = newOpenAPIDocument()
	s.registerRoutes()
}

func (s *Service) Close(_ context.Context) error { return nil }
func (s *Service) Options() serpent.OptionSet    { return nil }

func (s *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if s.oauth != nil && r.Header.Get("Authorization") != "" {
		parts := strings.Fields(r.Header.Get("Authorization"))
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			httpapi.Write(r.Context(), w, http.StatusUnauthorized, externalAuthError())
			return
		}
		identity, err := s.oauth.ValidateAccessToken(r.Context(), parts[1])
		if err != nil || identity.DeveloperAppID == uuid.Nil || identity.Scope != serviceoauth.ScopeExternalRead {
			httpapi.Write(r.Context(), w, http.StatusUnauthorized, externalAuthError())
			return
		}
		r = r.WithContext(withDeveloperAppID(r.Context(), identity.DeveloperAppID))
	}
	s.router.ServeHTTP(w, r)
}

func externalAuthError() chroniclesdk.Response {
	return chroniclesdk.Response{Message: "Invalid developer OAuth bearer token."}
}

type HealthResponse struct {
	Status string `json:"status"`
}

func (s *Service) health(w http.ResponseWriter, r *http.Request) {
	httpapi.Write(r.Context(), w, http.StatusOK, HealthResponse{Status: "ok"})
}
