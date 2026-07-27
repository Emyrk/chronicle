package servicerankings

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	types "github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicechronicle"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
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

	// SummaryDispatchWorker fans out per-tenant refresh jobs.
	SummaryDispatchWorker *WorkerRefreshRankingsSummaries
	// SummaryTenantWorker refreshes summaries for a single tenant.
	SummaryTenantWorker *WorkerRefreshRankingsSummaryTenant

	// SnapshotDispatchWorker fans out per-tenant snapshot publication jobs.
	SnapshotDispatchWorker *WorkerPublishParseSnapshots
	// SnapshotTenantWorker publishes a snapshot for a single tenant+lookback.
	SnapshotTenantWorker *WorkerPublishParseSnapshotTenant
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
	s.router.Get("/stats", s.handleStats)
	s.router.Get("/realms", s.handleRealms)
	s.router.Get("/kill-times", s.handleKillTimes)
	s.router.Get("/kill-time-leaderboard", s.handleKillTimeLeaderboard)
	s.router.Get("/success-rates", s.handleSuccessRates)

	// Instance parses
	s.router.Get("/instances/{instanceID}/parses", s.handleInstanceParses)

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

// handleLeaderboard returns paginated DPS rankings with filters.
//
//	GET /leaderboard?instance_names=Molten+Core&encounter_names=Ragnaros&period=90d
func (s *Service) handleLeaderboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()

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

	var sinceDays int64
	if v := q.Get("period"); v != "" {
		sinceDays = periodToDays(v)
	}

	// Normalize class name: the frontend sends SDK-form names (e.g. DEATHKNIGHT)
	// but the DB stores DB-form names (e.g. DEATH_KNIGHT).
	classParam := q.Get("class")
	if classParam != "" {
		classParam = string(db2sdk.HeroClassToDB(types.HeroClasses(classParam)))
	}

	rows, err := s.store.RankingsLeaderboard(ctx, database.RankingsLeaderboardParams{
		InstanceNames:    splitCSV(q.Get("instance_names")),
		EncounterNames:   splitCSV(q.Get("encounter_names")),
		DifficultyNames:  splitCSV(q.Get("difficulty_names")),
		RealmNames:       splitCSV(q.Get("realm_names")),
		Class:            classParam,
		Spec:             q.Get("spec"),
		Role:             q.Get("role"),
		SinceDays:        sinceDays,
		HideUnknowns:     q.Get("hide_unknowns") == "true",
		Metric:           normalizeMetric(q.Get("metric")),
		FilterMaxPlayers: parseMaxPlayers(q.Get("max_players")),
		QueryLimit:       limit,
		QueryOffset:      offset,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch rankings leaderboard",
				Detail:  err.Error(),
			},
		})
		return
	}

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
			v := row.AvgIlvl
			entry.AvgIlvl = &v
		}
		if row.TalentSubSpec != "" {
			entry.SubSpec = &row.TalentSubSpec
		}
		entries = append(entries, entry)
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.RankingsLeaderboardResponse{
		Entries:    entries,
		TotalCount: totalCount,
	})
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
			PlayerClass: normalizeClassName(row.PlayerClass),
			PlayerSpec:  row.PlayerSpec,
			MinDPS:      row.MinDps,
			Q1DPS:       row.Q1Dps,
			MedianDPS:   row.MedianDps,
			Q3DPS:       row.Q3Dps,
			MaxDPS:      row.MaxDps,
			Count:       row.Count,
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
