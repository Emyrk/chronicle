package servicerankings

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type guildRatingBossLeaderboardQuerier interface {
	ListActiveGuildRatingBossScores(context.Context, database.ListActiveGuildRatingBossScoresParams) ([]database.GuildRatingBossScore, error)
}

type guildRatingScopeLeaderboardQuerier interface {
	ListActiveGuildRatingScopeScores(context.Context, database.ListActiveGuildRatingScopeScoresParams) ([]database.GuildRatingScopeScore, error)
}

func guildRatingBadRequest(w http.ResponseWriter, r *http.Request, message string) {
	httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: message})
}

func guildRatingParams(w http.ResponseWriter, r *http.Request) (uuid.UUID, string, string, int32, bool) {
	q := r.URL.Query()
	groupID, err := uuid.Parse(q.Get("group_id"))
	if err != nil || groupID == uuid.Nil {
		guildRatingBadRequest(w, r, "group_id must be a valid UUID")
		return uuid.Nil, "", "", 0, false
	}
	metric, window := q.Get("rating_metric"), q.Get("window_kind")
	switch metric {
	case "peak":
		if window != "period" && window != "all_time" {
			guildRatingBadRequest(w, r, "peak requires a period or all_time window")
			return uuid.Nil, "", "", 0, false
		}
	case "mastery", "ranked_mastery":
		if window != "period" {
			guildRatingBadRequest(w, r, "mastery requires a period window")
			return uuid.Nil, "", "", 0, false
		}
	case "renown":
		if window != "period" && window != "career" {
			guildRatingBadRequest(w, r, "renown requires a period or career window")
			return uuid.Nil, "", "", 0, false
		}
	default:
		guildRatingBadRequest(w, r, "rating_metric must be peak, mastery, ranked_mastery or renown")
		return uuid.Nil, "", "", 0, false
	}
	// Guild scores have no player class, spec, or DPS/HPS cohort.
	for _, name := range []string{"class", "spec", "sub_spec", "performance_metric"} {
		if q.Has(name) {
			guildRatingBadRequest(w, r, name+" is not a guild rating cohort parameter")
			return uuid.Nil, "", "", 0, false
		}
	}
	limit := int64(50)
	if q.Has("limit") {
		limit, err = strconv.ParseInt(q.Get("limit"), 10, 32)
		if err != nil || limit < 1 || limit > 100 {
			guildRatingBadRequest(w, r, "limit must be between 1 and 100")
			return uuid.Nil, "", "", 0, false
		}
	}
	return groupID, metric, window, int32(limit), true
}

// GET /ratings/guild-boss-leaderboard?group_id=...&instance_name=...&encounter_name=...&difficulty_name=...&max_players=...&rating_metric=peak&window_kind=period
func (s *Service) handleGuildRatingBossLeaderboard(w http.ResponseWriter, r *http.Request) {
	handleGuildRatingBossLeaderboardWithStore(s.store, w, r)
}

func handleGuildRatingBossLeaderboardWithStore(store guildRatingBossLeaderboardQuerier, w http.ResponseWriter, r *http.Request) {
	groupID, metric, window, limit, ok := guildRatingParams(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	if strings.TrimSpace(q.Get("instance_name")) == "" || strings.TrimSpace(q.Get("encounter_name")) == "" || !q.Has("difficulty_name") || !q.Has("max_players") {
		guildRatingBadRequest(w, r, "exact boss queries require instance_name, encounter_name, difficulty_name and max_players")
		return
	}
	maxPlayers, err := strconv.ParseInt(q.Get("max_players"), 10, 16)
	if err != nil || (metric == "renown" && (maxPlayers != 0 || q.Get("difficulty_name") != "")) ||
		(metric != "renown" && maxPlayers <= 0) {
		guildRatingBadRequest(w, r, "max_players and difficulty_name must match the rating cohort")
		return
	}
	ctx := r.Context()
	rows, err := store.ListActiveGuildRatingBossScores(ctx, database.ListActiveGuildRatingBossScoresParams{
		TenantID: servicetenant.TenantIDFromContext(ctx), GroupID: groupID,
		InstanceName: q.Get("instance_name"), EncounterName: q.Get("encounter_name"),
		DifficultyName: q.Get("difficulty_name"), MaxPlayers: int16(maxPlayers),
		RatingMetric: metric, WindowKind: window, LimitCount: limit,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to fetch guild rating boss leaderboard", Detail: err.Error()}})
		return
	}
	entries := make([]chroniclesdk.GuildRatingBossLeaderboardEntry, 0, len(rows))
	for _, row := range rows {
		if row.GuildID == uuid.Nil {
			continue
		}
		entries = append(entries, chroniclesdk.GuildRatingBossLeaderboardEntry{
			GenerationID: row.GenerationID, GroupID: row.GroupID, RealmID: row.RealmID, GuildID: row.GuildID,
			InstanceName: row.InstanceName, EncounterName: row.EncounterName, DifficultyName: row.DifficultyName,
			MaxPlayers: row.MaxPlayers, RatingMetric: row.RatingMetric, WindowKind: row.WindowKind,
			WindowStart: guildRatingTime(row.WindowStart), WindowEnd: guildRatingTime(row.WindowEnd),
			Score: row.Score, BestRaw: guildRatingFloat(row.BestRaw), RankOneRaw: guildRatingFloat(row.RankOneRaw),
			BestLockedParse: guildRatingFloat(row.BestLockedParse), Form: guildRatingFloat(row.Form),
			FloorScore: guildRatingFloat(row.FloorScore), EligibleKills: row.EligibleKills,
			ComputedAt: guildRatingTime(row.ComputedAt),
		})
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildRatingBossLeaderboardResponse{Entries: entries})
}

func guildRatingFloat(value pgtype.Float8) *float64 {
	if !value.Valid {
		return nil
	}
	return &value.Float64
}

func guildRatingTime(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}
	return &value.Time
}

// GET /ratings/guild-scope-leaderboard?group_id=...&instance_name=...&difficulty_name=...&max_players=...&rating_metric=peak&window_kind=period
// Empty instance_name selects the global board.
func (s *Service) handleGuildRatingScopeLeaderboard(w http.ResponseWriter, r *http.Request) {
	handleGuildRatingScopeLeaderboardWithStore(s.store, w, r)
}

func handleGuildRatingScopeLeaderboardWithStore(store guildRatingScopeLeaderboardQuerier, w http.ResponseWriter, r *http.Request) {
	groupID, metric, window, limit, ok := guildRatingParams(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	if !q.Has("difficulty_name") || !q.Has("max_players") {
		guildRatingBadRequest(w, r, "difficulty_name and max_players cohort parameters are required")
		return
	}
	instanceName := q.Get("instance_name")
	if instanceName != "" && strings.TrimSpace(instanceName) == "" {
		guildRatingBadRequest(w, r, "instance_name must be non-empty for raid scores")
		return
	}
	maxPlayers, err := strconv.ParseInt(q.Get("max_players"), 10, 16)
	if err != nil || maxPlayers < 0 || (metric == "renown" && (maxPlayers != 0 || q.Get("difficulty_name") != "")) || (metric != "renown" && maxPlayers == 0) {
		guildRatingBadRequest(w, r, "max_players and difficulty_name must match the rating cohort")
		return
	}
	ctx := r.Context()
	rows, err := store.ListActiveGuildRatingScopeScores(ctx, database.ListActiveGuildRatingScopeScoresParams{
		TenantID: servicetenant.TenantIDFromContext(ctx), GroupID: groupID,
		InstanceName: instanceName, DifficultyName: q.Get("difficulty_name"), MaxPlayers: int16(maxPlayers),
		RatingMetric: metric, WindowKind: window, LimitCount: limit,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{Response: chroniclesdk.Response{Message: "Failed to fetch guild rating scope leaderboard", Detail: err.Error()}})
		return
	}
	scope := "raid"
	if instanceName == "" {
		scope = "global"
	}
	entries := make([]chroniclesdk.GuildRatingScopeLeaderboardEntry, 0, len(rows))
	for _, row := range rows {
		if row.GuildID == uuid.Nil {
			continue
		}
		entries = append(entries, chroniclesdk.GuildRatingScopeLeaderboardEntry{
			GenerationID: row.GenerationID, GroupID: row.GroupID, RealmID: row.RealmID, GuildID: row.GuildID,
			InstanceName: row.InstanceName, DifficultyName: row.DifficultyName, MaxPlayers: row.MaxPlayers,
			RatingMetric: row.RatingMetric, WindowKind: row.WindowKind, Score: row.Score,
			ComputedAt: guildRatingTime(row.ComputedAt),
		})
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildRatingScopeLeaderboardResponse{Scope: scope, Entries: entries})
}
