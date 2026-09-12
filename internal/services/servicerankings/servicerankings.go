package servicerankings

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	types "github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicechronicle"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/serviceprometheus"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/authzed/gochugaru/consistency"
	"github.com/authzed/gochugaru/rel"
	"github.com/go-chi/chi/v5"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

// Rankings returns the rankings service from the broker.
func Rankings(broker *services.Services) *Service {
	return services.MustGet[*Service](broker)
}

// OnRankings returns the service name for dependency declarations.
func OnRankings() string {
	return (&Service{}).Name()
}

// Service provides DPS rankings, speedrun leaderboard, and related queries.
type Service struct {
	broker   *services.Services
	router   chi.Router
	logger   *slog.Logger
	store    *authz.Authz
	registry *registry.Registry
	metrics  *rankingRunSummaryMetrics

	// RunSummaryBackfillWorker marks missing or stale run summaries dirty.
	RunSummaryBackfillWorker *WorkerBackfillRankingRunSummaries
	// RunSummaryWorker drains the durable per-run summary dirty queue.
	RunSummaryWorker *WorkerRebuildRankingRunSummaries

	// SummaryDispatchWorker fans out per-tenant refresh jobs.
	SummaryDispatchWorker *WorkerRefreshRankingsSummaries
	// SummaryTenantWorker refreshes summaries for a single tenant.
	SummaryTenantWorker *WorkerRefreshRankingsSummaryTenant

	// SnapshotDispatchWorker fans out per-tenant snapshot publication jobs.
	SnapshotDispatchWorker *WorkerPublishParseSnapshots
	// SnapshotTenantWorker publishes a snapshot for a single tenant+lookback.
	SnapshotTenantWorker *WorkerPublishParseSnapshotTenant

	// TimeParseSnapshotDispatchWorker fans out per-tenant time-parse snapshot jobs.
	TimeParseSnapshotDispatchWorker *WorkerPublishTimeParseSnapshots
	// TimeParseSnapshotTenantWorker publishes a time-parse snapshot for a single tenant+lookback.
	TimeParseSnapshotTenantWorker *WorkerPublishTimeParseSnapshotTenant

	// ComputeParseScoresWorker computes and persists per-instance parse scores.
	ComputeParseScoresWorker *WorkerComputeParseScores
	// RepairDispatchWorker fans daily repairs out across root and tenant scopes.
	RepairDispatchWorker *WorkerDispatchParseScoreRepairs
	// RepairParseScoresWorker dispatches bounded repair jobs for one tenant.
	RepairParseScoresWorker *WorkerRepairParseScores
}

func New(broker *services.Services) *Service {
	return &Service{
		broker: broker,
	}
}

func (s *Service) Name() string {
	return services.ServiceRankings
}

func (s *Service) DependsOn() []string {
	return []string{
		servicelogger.OnLogger(),
		serviceauthz.OnAuthz(),
		servicedbstore.OnDatabaseStore(),
		servicechronicle.OnChronicle(),
		serviceprometheus.OnPrometheus(),
	}
}

func (s *Service) Configures() []string { return []string{} }
func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{}
}

func (s *Service) Start(_ context.Context) error {
	s.logger = servicelogger.Logger(s.broker)
	s.store = serviceauthz.Authz(s.broker)
	s.registry = servicechronicle.Chronicle(s.broker).Registry()

	namedLogger := services.NamedLogger(s.logger, s.Name())
	store := servicedbstore.DatabaseStore(s.broker)
	runSummaryMetrics := newRankingRunSummaryMetrics(serviceprometheus.Registry(s.broker))
	s.metrics = runSummaryMetrics
	s.RunSummaryBackfillWorker = &WorkerBackfillRankingRunSummaries{
		Store:  store,
		Logger: namedLogger,
		// Queue is set by serviceriver after queue creation.
	}
	s.RunSummaryWorker = &WorkerRebuildRankingRunSummaries{
		Store:   store,
		Logger:  namedLogger,
		metrics: runSummaryMetrics,
	}
	s.SummaryDispatchWorker = &WorkerRefreshRankingsSummaries{
		Store:  store,
		Logger: namedLogger,
		// Queue is set by serviceriver after queue creation.
	}
	s.SummaryTenantWorker = &WorkerRefreshRankingsSummaryTenant{
		Store:  store,
		Logger: namedLogger,
	}
	s.SnapshotDispatchWorker = &WorkerPublishParseSnapshots{
		Store:  store,
		Logger: namedLogger,
		// Queue is set by serviceriver after queue creation.
	}
	s.SnapshotTenantWorker = &WorkerPublishParseSnapshotTenant{
		Store:  store,
		Logger: namedLogger,
	}

	s.TimeParseSnapshotDispatchWorker = &WorkerPublishTimeParseSnapshots{
		Store:  store,
		Logger: namedLogger,
		// Queue is set by serviceriver after queue creation.
	}
	s.TimeParseSnapshotTenantWorker = &WorkerPublishTimeParseSnapshotTenant{
		Store:  store,
		Logger: namedLogger,
	}

	s.ComputeParseScoresWorker = &WorkerComputeParseScores{
		Store:  store,
		Logger: namedLogger,
		// Queue is set by serviceriver after queue creation.
	}
	s.RepairDispatchWorker = &WorkerDispatchParseScoreRepairs{
		Store:  store,
		Logger: namedLogger,
		// Queue is set by serviceriver after queue creation.
	}
	s.RepairParseScoresWorker = &WorkerRepairParseScores{
		Store:  store,
		Logger: namedLogger,
		// Queue is set by serviceriver after queue creation.
	}

	s.router = chi.NewRouter()
	s.setupRoutes()

	s.logger.Info("rankings service started")
	return nil
}

func (s *Service) Close(_ context.Context) error {
	return nil
}

func (s *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func (s *Service) setupRoutes() {
	// All rankings/leaderboard data is public and changes infrequently.
	// Cache for 5 minutes to reduce load on repeat visits.
	s.router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet {
				w.Header().Set("Cache-Control", "public, max-age=300")
			}
			next.ServeHTTP(w, r)
		})
	})

	// DPS rankings
	s.router.Get("/instances", s.handleInstances)
	s.router.Get("/encounters", s.handleEncounters)
	s.router.Get("/leaderboard", s.handleLeaderboard)
	s.router.Get("/filters", s.handleFilters)
	s.router.Get("/stats", s.handleStats)
	s.router.Get("/realms", s.handleRealms)
	s.router.Get("/kill-times", s.handleKillTimes)
	s.router.Get("/kill-time-leaderboard", s.handleKillTimeLeaderboard)
	s.router.Get("/success-rates", s.handleSuccessRates)

	// Instance parses
	s.router.Get("/instances/{instanceID}/parses", s.handleInstanceParses)
	s.router.Get("/instances/{instanceID}/time-parses", s.handleInstanceTimeParses)

	// Character parse history
	s.router.Get("/characters/{playerGUID}/parses", s.handleCharacterParseHistory)
	s.router.Get("/characters/{playerGUID}/encounters", s.handleCharacterEncounterStats)

	// Cohort viewer (debugging/transparency)
	s.router.Get("/snapshots", s.handleListSnapshots)
	s.router.Get("/snapshots/{snapshotID}/cohort", s.handleSnapshotCohort)

	// Speedrun leaderboard
	s.router.Get("/speedrun", s.handleSpeedrunLeaderboard)
	s.router.Get("/speedrun/instances", s.handleSpeedrunInstances)
	s.router.Get("/speedrun/realms", s.handleSpeedrunRealms)
	s.router.Get("/speedrun/difficulties", s.handleSpeedrunDifficulties)
	s.router.Get("/speedrun/rules", s.handleSpeedrunRules)
	s.router.Get("/speedrun/guild-clears", s.handleSpeedrunGuildClears)
}

// handleInstances returns per-instance summaries with top 3 players.
//
//	GET /instances
func (s *Service) handleInstances(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	tid := servicetenant.TenantIDFromContext(ctx)
	rows, err := s.store.RankingsInstanceSummaries(ctx, tid)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch rankings instance summaries",
				Detail:  err.Error(),
			},
		})
		return
	}

	out := make([]chroniclesdk.RankingsInstanceSummary, 0, len(rows))
	for _, row := range rows {
		summary := chroniclesdk.RankingsInstanceSummary{
			InstanceName:   row.InstanceName,
			DifficultyName: row.DifficultyName,
			MaxPlayers:     row.MaxPlayers,
			TotalKills:     row.TotalKills,
		}

		// TopPlayers is JSONB ([]byte) from the summary table.
		if len(row.TopPlayers) > 0 {
			summary.TopPlayers = chroniclesdk.TopPlayersFromJSON(row.TopPlayers)
			for i := range summary.TopPlayers {
				summary.TopPlayers[i].PlayerClass = normalizeClassName(summary.TopPlayers[i].PlayerClass)
			}
		}
		if summary.TopPlayers == nil {
			summary.TopPlayers = []chroniclesdk.RankingsInstanceTopPlayer{}
		}

		out = append(out, summary)
	}

	httpapi.Write(ctx, w, http.StatusOK, out)
}

// handleEncounters returns encounters available in rankings for one instance.
//
//	GET /encounters?instance_name=Molten+Core
func (s *Service) handleEncounters(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	instanceName := r.URL.Query().Get("instance_name")
	if instanceName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "instance_name query parameter is required",
		})
		return
	}

	rows, err := s.store.RankingsEncounterList(ctx, instanceName)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch rankings encounters",
				Detail:  err.Error(),
			},
		})
		return
	}

	out := make([]chroniclesdk.RankingsEncounterSummary, 0, len(rows))
	for _, row := range rows {
		out = append(out, chroniclesdk.RankingsEncounterSummary{
			EncounterName: row.EncounterName,
			TotalKills:    row.TotalKills,
			TopDPS:        row.TopDps,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, out)
}

type rankingsLeaderboardStore interface {
	RankingsLeaderboardFastEligibility(context.Context, database.RankingsLeaderboardFastEligibilityParams) (database.RankingsLeaderboardFastEligibilityRow, error)
	RankingsLeaderboardFast(context.Context, database.RankingsLeaderboardFastParams) ([]database.RankingsLeaderboardFastRow, error)
	RankingsLeaderboardSlow(context.Context, database.RankingsLeaderboardSlowParams) ([]database.RankingsLeaderboardSlowRow, error)
}

type rankingsLeaderboardAuthorizer interface {
	CheckOne(context.Context, *consistency.Strategy, rel.Interface) (bool, error)
}

type leaderboardQueryMetadata struct {
	Path   string
	Reason string
}

const maxLeaderboardVerificationDifferences = 20

func rankingsLeaderboardFast(
	ctx context.Context,
	store rankingsLeaderboardStore,
	logger *slog.Logger,
	params database.RankingsLeaderboardSlowParams,
) ([]database.RankingsLeaderboardSlowRow, leaderboardQueryMetadata, bool, error) {
	unavailable := func(reason string) ([]database.RankingsLeaderboardSlowRow, leaderboardQueryMetadata, bool, error) {
		return nil, leaderboardQueryMetadata{Path: "slow", Reason: reason}, false, nil
	}

	// A relative cutoff is applied to individual encounter rows by the reference
	// query. The run projection only stores the final killed_at, so it cannot safely
	// reproduce a cutoff that falls inside a run.
	if params.SinceDays > 0 {
		return unavailable("unsupported_since")
	}

	tenant := servicetenant.TenantFromContext(ctx)
	filterTenant := tenant != nil
	tenantID := servicetenant.TenantIDFromContext(ctx)
	eligibility, err := store.RankingsLeaderboardFastEligibility(ctx, database.RankingsLeaderboardFastEligibilityParams{
		SummaryVersion:   rankingPlayerRunSummaryVersion,
		FilterTenant:     filterTenant,
		TenantID:         tenantID,
		InstanceNames:    params.InstanceNames,
		RealmNames:       params.RealmNames,
		DifficultyNames:  params.DifficultyNames,
		FilterMaxPlayers: params.FilterMaxPlayers,
		EncounterNames:   params.EncounterNames,
	})
	if err != nil {
		if logger != nil {
			logger.Warn("plan fast rankings leaderboard", slog.String("error", err.Error()))
		}
		return nil, leaderboardQueryMetadata{Path: "slow", Reason: "eligibility_error"}, false, err
	}

	switch {
	case eligibility.MissingRunCount > 0:
		return unavailable("missing_summary")
	case eligibility.StaleRunCount > 0 || eligibility.StalePlayerCount > 0:
		return unavailable("stale_summary")
	case eligibility.DirtyRunCount > 0:
		return unavailable("dirty_summary")
	case eligibility.OrphanRunCount > 0:
		return unavailable("orphan_summary")
	case eligibility.NonstandardRunCount > 0:
		return unavailable("nonstandard_encounters")
	case !eligibility.EncountersMatch:
		return unavailable("encounter_subset")
	}

	fastRows, err := store.RankingsLeaderboardFast(ctx, database.RankingsLeaderboardFastParams{
		Metric:           params.Metric,
		QueryOffset:      params.QueryOffset,
		QueryLimit:       params.QueryLimit,
		FilterTenant:     filterTenant,
		TenantID:         tenantID,
		SummaryVersion:   rankingPlayerRunSummaryVersion,
		InstanceNames:    params.InstanceNames,
		RealmNames:       params.RealmNames,
		DifficultyNames:  params.DifficultyNames,
		FilterMaxPlayers: params.FilterMaxPlayers,
		Class:            params.Class,
		Spec:             params.Spec,
		SubSpec:          params.SubSpec,
		Role:             params.Role,
		HideUnknowns:     params.HideUnknowns,
	})
	if err != nil {
		if logger != nil {
			logger.Warn("query fast rankings leaderboard", slog.String("error", err.Error()))
		}
		return nil, leaderboardQueryMetadata{Path: "fast", Reason: "fast_query_error"}, true, err
	}

	rows := make([]database.RankingsLeaderboardSlowRow, 0, len(fastRows))
	for _, row := range fastRows {
		rows = append(rows, database.RankingsLeaderboardSlowRow(row))
	}
	return rows, leaderboardQueryMetadata{Path: "fast", Reason: "eligible"}, true, nil
}

func rankingsLeaderboard(
	ctx context.Context,
	store rankingsLeaderboardStore,
	logger *slog.Logger,
	metrics *rankingRunSummaryMetrics,
	params database.RankingsLeaderboardSlowParams,
) ([]database.RankingsLeaderboardSlowRow, leaderboardQueryMetadata, error) {
	rows, metadata, available, fastErr := rankingsLeaderboardFast(ctx, store, logger, params)
	if available && fastErr == nil {
		if metrics != nil {
			metrics.leaderboardPath.WithLabelValues(metadata.Path, metadata.Reason).Inc()
		}
		if logger != nil {
			logger.Debug("using fast rankings leaderboard")
		}
		return rows, metadata, nil
	}

	metadata.Path = "slow"
	if metrics != nil {
		metrics.leaderboardPath.WithLabelValues(metadata.Path, metadata.Reason).Inc()
	}
	if logger != nil {
		logger.Debug("using slow rankings leaderboard", slog.String("reason", metadata.Reason))
	}
	rows, err := store.RankingsLeaderboardSlow(ctx, params)
	return rows, metadata, err
}

func rankingsLeaderboardResponse(rows []database.RankingsLeaderboardSlowRow) chroniclesdk.RankingsLeaderboardResponse {
	var totalCount int64
	entries := make([]chroniclesdk.RankingsEntry, 0, len(rows))
	for _, row := range rows {
		totalCount = row.TotalCount
		entry := chroniclesdk.RankingsEntry{
			EncounterName:  row.EncounterName,
			InstanceName:   row.InstanceName,
			PlayerGUID:     row.PlayerGuid,
			PlayerName:     row.PlayerName,
			PlayerClass:    normalizeClassName(row.PlayerClass),
			PlayerSpec:     row.PlayerSpec,
			PlayerRole:     row.PlayerRole,
			PlayerLevel:    row.PlayerLevel,
			DifficultyName: row.DifficultyName,
			MaxPlayers:     row.MaxPlayers,
			RealmID:        row.RealmID,
			RealmName:      row.RealmName,
			GuildName:      row.GuildName,
			DamageDone:     row.DamageDone,
			HealingDone:    row.HealingDone,
			AbsorbedDone:   row.AbsorbedDone,
			DurationSecs:   row.DurationSecs,
			DPS:            row.Dps,
			HPS:            row.Hps,
			LogHashedSlug:  row.LogHashedSlug,
			KilledAt:       row.KilledAt.Time,
		}
		if row.AvgIlvl > 0 {
			value := row.AvgIlvl
			entry.AvgIlvl = &value
		}
		if row.PlayerSubSpec != "" {
			entry.SubSpec = &row.PlayerSubSpec
		}
		if row.TalentLayout != "" {
			entry.TalentLayout = &row.TalentLayout
		}
		entries = append(entries, entry)
	}
	return chroniclesdk.RankingsLeaderboardResponse{Entries: entries, TotalCount: totalCount}
}

func leaderboardFloatEqual(a, b float64) bool {
	const relativeTolerance = 1e-6
	return math.Abs(a-b) <= relativeTolerance*math.Max(1, math.Max(math.Abs(a), math.Abs(b)))
}

func leaderboardFieldEqual(field string, fast, slow reflect.Value) bool {
	if field == "DurationSecs" || field == "DPS" || field == "HPS" {
		return leaderboardFloatEqual(fast.Float(), slow.Float())
	}
	return reflect.DeepEqual(fast.Interface(), slow.Interface())
}

func leaderboardValueString(value reflect.Value) string {
	if value.Kind() == reflect.Pointer {
		if value.IsNil() {
			return "null"
		}
		value = value.Elem()
	}
	return fmt.Sprint(value.Interface())
}

func compareRankingsLeaderboards(fast, slow chroniclesdk.RankingsLeaderboardResponse) (int, []chroniclesdk.RankingsLeaderboardDifference) {
	differenceCount := 0
	differences := make([]chroniclesdk.RankingsLeaderboardDifference, 0)
	add := func(entryIndex int, field string, fastValue, slowValue reflect.Value) {
		differenceCount++
		if len(differences) >= maxLeaderboardVerificationDifferences {
			return
		}
		differences = append(differences, chroniclesdk.RankingsLeaderboardDifference{
			EntryIndex: entryIndex,
			Field:      field,
			FastValue:  leaderboardValueString(fastValue),
			SlowValue:  leaderboardValueString(slowValue),
		})
	}

	if fast.TotalCount != slow.TotalCount {
		add(0, "total_count", reflect.ValueOf(fast.TotalCount), reflect.ValueOf(slow.TotalCount))
	}
	if len(fast.Entries) != len(slow.Entries) {
		add(0, "entry_count", reflect.ValueOf(len(fast.Entries)), reflect.ValueOf(len(slow.Entries)))
	}

	entryType := reflect.TypeOf(chroniclesdk.RankingsEntry{})
	entryCount := min(len(fast.Entries), len(slow.Entries))
	for i := range entryCount {
		fastEntry := reflect.ValueOf(fast.Entries[i])
		slowEntry := reflect.ValueOf(slow.Entries[i])
		for fieldIndex := range entryType.NumField() {
			field := entryType.Field(fieldIndex)
			fastValue := fastEntry.Field(fieldIndex)
			slowValue := slowEntry.Field(fieldIndex)
			if leaderboardFieldEqual(field.Name, fastValue, slowValue) {
				continue
			}
			fieldName := field.Tag.Get("json")
			if comma := strings.IndexByte(fieldName, ','); comma >= 0 {
				fieldName = fieldName[:comma]
			}
			add(i+1, fieldName, fastValue, slowValue)
		}
	}
	return differenceCount, differences
}

func authorizeLeaderboardVerification(ctx context.Context, authorizer rankingsLeaderboardAuthorizer) (bool, bool, error) {
	claims, authenticated := chronauth.AuthenticatedClaims(ctx)
	if !authenticated {
		return false, false, nil
	}
	allowed, err := authorizer.CheckOne(
		ctx,
		nil,
		policy.New().GlobalChronicle().CanAdmin_speedrun_requirements_User(policy.New().User(claims.Subject)),
	)
	return true, allowed, err
}

func verifyRankingsLeaderboard(
	ctx context.Context,
	store rankingsLeaderboardStore,
	logger *slog.Logger,
	metrics *rankingRunSummaryMetrics,
	params database.RankingsLeaderboardSlowParams,
) chroniclesdk.RankingsLeaderboardResponse {
	fastStarted := time.Now()
	fastRows, fastMetadata, fastAvailable, fastErr := rankingsLeaderboardFast(ctx, store, logger, params)
	fastDuration := time.Since(fastStarted)
	if metrics != nil {
		metrics.leaderboardQueryDuration.WithLabelValues("fast").Observe(fastDuration.Seconds())
	}

	slowStarted := time.Now()
	slowRows, slowErr := store.RankingsLeaderboardSlow(ctx, params)
	slowDuration := time.Since(slowStarted)
	if metrics != nil {
		metrics.leaderboardQueryDuration.WithLabelValues("slow").Observe(slowDuration.Seconds())
	}

	fastResponse := rankingsLeaderboardResponse(fastRows)
	slowResponse := rankingsLeaderboardResponse(slowRows)
	verification := &chroniclesdk.RankingsLeaderboardVerification{
		FastDurationMS: fastDuration.Milliseconds(),
		SlowDurationMS: slowDuration.Milliseconds(),
		FastQueryPath:  fastMetadata.Path,
		Differences:    []chroniclesdk.RankingsLeaderboardDifference{},
	}

	response := fastResponse
	switch {
	case fastErr != nil:
		verification.Status = "fast_error"
		verification.FallbackReason = fastMetadata.Reason
		response = slowResponse
	case slowErr != nil:
		verification.Status = "slow_error"
	case !fastAvailable:
		verification.Status = "fast_unavailable"
		verification.FallbackReason = fastMetadata.Reason
		response = slowResponse
	default:
		verification.DifferenceCount, verification.Differences = compareRankingsLeaderboards(fastResponse, slowResponse)
		if verification.DifferenceCount == 0 {
			verification.Status = "match"
		} else {
			verification.Status = "mismatch"
			if logger != nil {
				logger.Error("rankings leaderboard verification mismatch",
					slog.Any("filters", params),
					slog.Int("difference_count", verification.DifferenceCount),
					slog.Any("differences", verification.Differences),
					slog.Duration("fast_duration", fastDuration),
					slog.Duration("slow_duration", slowDuration),
				)
			}
		}
	}
	response.Verification = verification
	if metrics != nil {
		metrics.leaderboardVerification.WithLabelValues(verification.Status).Inc()
	}
	return response
}

// handleLeaderboard returns paginated DPS rankings with filters.
//
//	GET /leaderboard?instance_names=Molten+Core&encounter_names=Ragnaros&period=90d
func (s *Service) handleLeaderboard(w http.ResponseWriter, r *http.Request) {
	handleLeaderboardWithDependencies(s.store, s.store, s.logger, s.metrics, w, r)
}

func handleLeaderboardWithDependencies(
	store rankingsLeaderboardStore,
	authorizer rankingsLeaderboardAuthorizer,
	logger *slog.Logger,
	metrics *rankingRunSummaryMetrics,
	w http.ResponseWriter,
	r *http.Request,
) {
	ctx := r.Context()
	q := r.URL.Query()
	verify := q.Get("verify") == "true"
	if verify {
		w.Header().Set("Cache-Control", "private, no-store")
		authenticated, allowed, err := authorizeLeaderboardVerification(ctx, authorizer)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		if !authenticated {
			httpapi.Write(ctx, w, http.StatusUnauthorized, chroniclesdk.Response{Message: "Authentication is required to verify leaderboard results"})
			return
		}
		if !allowed {
			httpapi.Forbidden(w, nil)
			return
		}
	}

	var limit int64 = 50
	if value := q.Get("limit"); value != "" {
		if parsed, err := strconv.ParseInt(value, 10, 64); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if limit > 200 {
		limit = 200
	}

	var offset int64
	if value := q.Get("offset"); value != "" {
		offset, _ = strconv.ParseInt(value, 10, 64)
	}

	var sinceDays int64
	if value := q.Get("period"); value != "" {
		sinceDays = periodToDays(value)
	}

	// Normalize class name: the frontend sends SDK-form names (e.g. DEATHKNIGHT)
	// but the DB stores DB-form names (e.g. DEATH_KNIGHT).
	classParam := q.Get("class")
	if classParam != "" {
		classParam = string(db2sdk.HeroClassToDB(types.HeroClasses(classParam)))
	}

	params := database.RankingsLeaderboardSlowParams{
		InstanceNames:    splitCSV(q.Get("instance_names")),
		EncounterNames:   splitCSV(q.Get("encounter_names")),
		DifficultyNames:  splitCSV(q.Get("difficulty_names")),
		RealmNames:       splitCSV(q.Get("realm_names")),
		Class:            classParam,
		Spec:             q.Get("spec"),
		SubSpec:          q.Get("sub_spec"),
		Role:             q.Get("role"),
		SinceDays:        sinceDays,
		HideUnknowns:     q.Get("hide_unknowns") == "true",
		Metric:           normalizeMetric(q.Get("metric")),
		FilterMaxPlayers: parseMaxPlayers(q.Get("max_players")),
		QueryLimit:       limit,
		QueryOffset:      offset,
	}

	if verify {
		httpapi.Write(ctx, w, http.StatusOK, verifyRankingsLeaderboard(ctx, store, logger, metrics, params))
		return
	}

	rows, _, err := rankingsLeaderboard(ctx, store, logger, metrics, params)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch rankings leaderboard",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, rankingsLeaderboardResponse(rows))
}

// handleFilters returns backend-discovered class/spec/sub-spec options.
//
//	GET /filters?instance_names=Molten+Core
func (s *Service) handleFilters(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, err := s.store.RankingsFilterOptions(ctx, splitCSV(r.URL.Query().Get("instance_names")))
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{Message: "Failed to fetch rankings filter options", Detail: err.Error()},
		})
		return
	}

	classes := make([]chroniclesdk.RankingsFilterClass, 0)
	classIndexes := make(map[string]int)
	specIndexes := make(map[string]map[string]int)
	for _, row := range rows {
		className := normalizeClassName(row.PlayerClass)
		classIndex, ok := classIndexes[className]
		if !ok {
			classIndex = len(classes)
			classIndexes[className] = classIndex
			specIndexes[className] = make(map[string]int)
			classes = append(classes, chroniclesdk.RankingsFilterClass{PlayerClass: className, Specs: []chroniclesdk.RankingsFilterSpec{}})
		}
		specIndex, ok := specIndexes[className][row.PlayerSpec]
		if !ok {
			specIndex = len(classes[classIndex].Specs)
			specIndexes[className][row.PlayerSpec] = specIndex
			classes[classIndex].Specs = append(classes[classIndex].Specs, chroniclesdk.RankingsFilterSpec{Spec: row.PlayerSpec, SubSpecs: []string{}})
		}
		if row.PlayerSubSpec != "" {
			classes[classIndex].Specs[specIndex].SubSpecs = append(classes[classIndex].Specs[specIndex].SubSpecs, row.PlayerSubSpec)
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, classes)
}

// handleStats returns box plot statistics per class/spec.
//
//	GET /stats?instance_names=Molten+Core&period=90d
func (s *Service) handleStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()

	var sinceDays int64
	if v := q.Get("period"); v != "" {
		sinceDays = periodToDays(v)
	}

	rows, err := s.store.RankingsBoxPlotStats(ctx, database.RankingsBoxPlotStatsParams{
		InstanceNames:    splitCSV(q.Get("instance_names")),
		EncounterNames:   splitCSV(q.Get("encounter_names")),
		DifficultyNames:  splitCSV(q.Get("difficulty_names")),
		RealmNames:       splitCSV(q.Get("realm_names")),
		Role:             q.Get("role"),
		SinceDays:        sinceDays,
		Metric:           normalizeMetric(q.Get("metric")),
		GroupByClass:     q.Get("group_by_class") == "true",
		FilterMaxPlayers: parseMaxPlayers(q.Get("max_players")),
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch rankings stats",
				Detail:  err.Error(),
			},
		})
		return
	}

	out := make([]chroniclesdk.RankingsBoxPlotStats, 0, len(rows))
	for _, row := range rows {
		out = append(out, chroniclesdk.RankingsBoxPlotStats{
			PlayerClass:   normalizeClassName(row.PlayerClass),
			PlayerSpec:    row.PlayerSpec,
			PlayerSubSpec: row.PlayerSubSpec,
			MinDPS:        row.MinDps,
			Q1DPS:         row.Q1Dps,
			MedianDPS:     row.MedianDps,
			Q3DPS:         row.Q3Dps,
			MaxDPS:        row.MaxDps,
			Count:         row.Count,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, out)
}

// handleRealms returns the list of realm names that have DPS ranking data.
//
//	GET /realms
func (s *Service) handleRealms(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	names, err := s.store.RankingsRealmNames(ctx)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch rankings realm names",
				Detail:  err.Error(),
			},
		})
		return
	}

	httpapi.Write(ctx, w, http.StatusOK, names)
}

// normalizeMetric validates the leaderboard metric selector.
// Only "hps" is recognized; anything else falls back to "dps".
func normalizeMetric(m string) string {
	if m == "hps" {
		return "hps"
	}
	return "dps"
}

// normalizeClassName converts a DB-form class name (e.g. DEATH_KNIGHT) to the
// SDK-form name (e.g. DEATHKNIGHT) used by the frontend. For classes without
// underscores this is a no-op.
func normalizeClassName(dbClass string) string {
	return strings.ReplaceAll(dbClass, "_", "")
}

// parseMaxPlayers parses the max_players board filter. 0 disables the filter.
func parseMaxPlayers(s string) int16 {
	if s == "" {
		return 0
	}
	v, err := strconv.ParseInt(s, 10, 16)
	if err != nil || v < 0 {
		return 0
	}
	return int16(v)
}

// splitCSV splits a comma-separated string into a slice, trimming whitespace.
func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// handleKillTimes returns box plot stats on encounter kill durations.
//
//	GET /kill-times?instance_name=Molten+Core&period=90d
func (s *Service) handleKillTimes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()

	instanceName := q.Get("instance_name")
	if instanceName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "instance_name query parameter is required",
		})
		return
	}

	var sinceDays int64
	if v := q.Get("period"); v != "" {
		sinceDays = periodToDays(v)
	}

	rows, err := s.store.RankingsKillTimeStats(ctx, database.RankingsKillTimeStatsParams{
		InstanceName: instanceName,
		SinceDays:    sinceDays,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch kill time stats",
				Detail:  err.Error(),
			},
		})
		return
	}

	out := make([]chroniclesdk.RankingsKillTimeStats, 0, len(rows))
	for _, row := range rows {
		out = append(out, chroniclesdk.RankingsKillTimeStats{
			EncounterName: row.EncounterName,
			MinSecs:       row.MinSecs,
			Q1Secs:        row.Q1Secs,
			MedianSecs:    row.MedianSecs,
			Q3Secs:        row.Q3Secs,
			MaxSecs:       row.MaxSecs,
			Count:         row.Count,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, out)
}

// handleKillTimeLeaderboard returns a paginated leaderboard of fastest encounter kills.
//
//	GET /kill-time-leaderboard?instance_name=Molten+Core&encounter_name=Ragnaros&period=90d
func (s *Service) handleKillTimeLeaderboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()

	instanceName := q.Get("instance_name")
	if instanceName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "instance_name query parameter is required",
		})
		return
	}

	var sinceDays int64
	if v := q.Get("period"); v != "" {
		sinceDays = periodToDays(v)
	}

	var limit int64 = 50
	if v := q.Get("limit"); v != "" {
		if parsed, err := strconv.ParseInt(v, 10, 64); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if limit > 200 {
		limit = 200
	}

	var offset int64
	if v := q.Get("offset"); v != "" {
		offset, _ = strconv.ParseInt(v, 10, 64)
	}

	rows, err := s.store.RankingsKillTimeLeaderboard(ctx, database.RankingsKillTimeLeaderboardParams{
		InstanceName:  instanceName,
		EncounterName: q.Get("encounter_name"),
		SinceDays:     sinceDays,
		QueryLimit:    limit,
		QueryOffset:   offset,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch kill time leaderboard",
				Detail:  err.Error(),
			},
		})
		return
	}

	var totalCount int64
	entries := make([]chroniclesdk.KillTimeLeaderboardEntry, 0, len(rows))
	for _, row := range rows {
		totalCount = row.TotalCount
		entries = append(entries, chroniclesdk.KillTimeLeaderboardEntry{
			EncounterName: row.EncounterName,
			InstanceName:  row.InstanceName,
			GuildName:     row.GuildName,
			RealmName:     row.RealmName,
			DurationSecs:  row.DurationSecs,
			KilledAt:      row.KilledAt.Time,
			LogHashedSlug: row.LogHashedSlug.String,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.KillTimeLeaderboardResponse{
		Entries:    entries,
		TotalCount: totalCount,
	})
}

// handleSuccessRates returns kill/wipe/total counts per encounter.
//
//	GET /success-rates?instance_name=Molten+Core&period=90d&difficulty_names=Heroic&max_players=25
func (s *Service) handleSuccessRates(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()

	instanceName := q.Get("instance_name")
	if instanceName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "instance_name query parameter is required",
		})
		return
	}

	var sinceDays int64
	if v := q.Get("period"); v != "" {
		sinceDays = periodToDays(v)
	}

	rows, err := s.store.RankingsSuccessRates(ctx, database.RankingsSuccessRatesParams{
		InstanceName:     instanceName,
		DifficultyNames:  splitCSV(q.Get("difficulty_names")),
		FilterMaxPlayers: parseMaxPlayers(q.Get("max_players")),
		SinceDays:        sinceDays,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch success rates",
				Detail:  err.Error(),
			},
		})
		return
	}

	out := make([]chroniclesdk.RankingsSuccessRate, 0, len(rows))
	for _, row := range rows {
		out = append(out, chroniclesdk.RankingsSuccessRate{
			EncounterName: row.EncounterName,
			Kills:         row.Kills,
			Wipes:         row.Wipes,
			Total:         row.Total,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, out)
}

// periodToDays converts a period string like "7d", "30d", "90d" to days.
func periodToDays(period string) int64 {
	switch period {
	case "7d":
		return 7
	case "30d":
		return 30
	case "90d":
		return 90
	default:
		return 0
	}
}
