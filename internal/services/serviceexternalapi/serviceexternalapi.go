package serviceexternalapi

import (
	"context"
	"net/http"

	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/aikey"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/serviceinstancesearch"
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
	InstanceRankingRecords(context.Context, uuid.UUID) ([]database.EncounterDpsRanking, error)
	GetParseScoreResultsForInstance(context.Context, uuid.UUID) ([]database.ParseScoreResult, error)
	InstanceEvent(context.Context, database.InstanceEventParams) (database.LogInstanceEvent, error)
	ListConsumableDisambiguationsByDataset(context.Context, uuid.UUID) ([]database.ListConsumableDisambiguationsByDatasetRow, error)
}

type Service struct {
	broker      *services.Services
	db          externalAPIStore
	router      chi.Router
	rateLimiter *externalIPLimiter
	openapi     OpenAPIDocument
	// search is the replica's shared instance-search service; it owns the
	// concurrency cap and search rate buckets.
	search *serviceinstancesearch.Service
	// aiKeys authenticates ?ai_key= requests. Nil disables AI keys.
	aiKeys *aikey.Authenticator

	deathCache       *summaryCache[*deathSummary]
	consumablesCache *summaryCache[*consumablesSummary]
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
		serviceinstancesearch.OnSearch(),
	}
}

func (s *Service) Start(_ context.Context) error {
	store := servicedbstore.DatabaseStore(s.broker)
	s.db = store
	s.search = serviceinstancesearch.SearchService(s.broker)
	s.aiKeys = aikey.NewAuthenticator(servicelogger.Logger(s.broker), store, s.searchTier)
	s.setupRoutes()
	servicelogger.Logger(s.broker).Info("external API service started")
	return nil
}

func (s *Service) setupRoutes() {
	s.router = chi.NewRouter()
	if s.aiKeys != nil {
		s.router.Use(s.aiKeys.Middleware)
	}
	s.rateLimiter = newExternalIPLimiter()
	s.openapi = newOpenAPIDocument()
	summarySlots := make(chan struct{}, summaryMaxConcurrent)
	s.deathCache = newSummaryCache[*deathSummary](summarySlots)
	s.consumablesCache = newSummaryCache[*consumablesSummary](summarySlots)
	s.registerRoutes()
}

// searchTier is the live supporter tier, from the same check that sets
// search budgets.
func (s *Service) searchTier(ctx context.Context, user uuid.UUID) (string, error) {
	access, err := s.search.UserAccess(ctx, user)
	return access.Tier, err
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
