package servicerankings

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
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

// Service provides DPS performance rankings queries and (future) population.
type Service struct {
	broker *services.Services
	router chi.Router
	logger *slog.Logger
	store  *authz.Authz
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
	}
}

func (s *Service) Configures() []string { return []string{} }
func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{}
}

func (s *Service) Start(_ context.Context) error {
	s.logger = servicelogger.Logger(s.broker)
	s.store = serviceauthz.Authz(s.broker)

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
	s.router.Get("/instances", s.handleInstances)
	s.router.Get("/encounters", s.handleEncounters)
	s.router.Get("/leaderboard", s.handleLeaderboard)
	s.router.Get("/stats", s.handleStats)
}

// handleInstances returns per-instance summaries with top 3 players.
//
//	GET /instances
func (s *Service) handleInstances(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	rows, err := s.store.RankingsInstanceSummaries(ctx)
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
			InstanceName: row.InstanceName,
			TotalKills:   row.TotalKills,
		}

		// TopPlayers comes as interface{} (json type) — parse it.
		if row.TopPlayers != nil {
			if data, err := json.Marshal(row.TopPlayers); err == nil {
				summary.TopPlayers = chroniclesdk.TopPlayersFromJSON(data)
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

	rows, err := s.store.RankingsLeaderboard(ctx, database.RankingsLeaderboardParams{
		InstanceNames:  splitCSV(q.Get("instance_names")),
		EncounterNames: splitCSV(q.Get("encounter_names")),
		RealmID:        q.Get("realm_id"),
		Class:          q.Get("class"),
		Spec:           q.Get("spec"),
		SinceDays:      sinceDays,
		QueryLimit:     limit,
		QueryOffset:    offset,
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
			ID:            row.ID,
			EncounterName: row.EncounterName,
			InstanceName:  row.InstanceName,
			PlayerGUID:    row.PlayerGuid,
			PlayerName:    row.PlayerName,
			PlayerClass:   row.PlayerClass,
			PlayerSpec:    row.PlayerSpec,
			RealmID:       row.RealmID,
			RealmName:     row.RealmName,
			GuildName:     row.GuildName,
			DamageDone:    row.DamageDone,
			DurationSecs:  row.DurationSecs,
			DPS:           row.Dps,
			LogHashedSlug: row.LogHashedSlug,
			KilledAt:      row.KilledAt.Time,
		}
		if row.AvgIlvl.Valid {
			v := row.AvgIlvl.Int16
			entry.AvgIlvl = &v
		}
		if row.TalentSubSpec.Valid {
			entry.SubSpec = &row.TalentSubSpec.String
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
		InstanceNames:  splitCSV(q.Get("instance_names")),
		EncounterNames: splitCSV(q.Get("encounter_names")),
		RealmID:        q.Get("realm_id"),
		SinceDays:      sinceDays,
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
			PlayerClass: row.PlayerClass,
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
