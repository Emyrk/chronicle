package servicerankings

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	types "github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type ratingBossLeaderboardQuerier interface {
	ListActiveGroupBossRatingScores(context.Context, database.ListActiveGroupBossRatingScoresParams) ([]database.RatingBossScore, error)
	ListGroupRatingBossScores(context.Context, database.ListGroupRatingBossScoresParams) ([]database.RatingBossScore, error)
}

// handleRatingBossLeaderboardWithStore retains the retired group-based reader
// for legacy tests. Public boards now use the tenant-wide reader.
func handleRatingBossLeaderboardWithStore(store ratingBossLeaderboardQuerier, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()
	badRequest := func(message string) {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: message})
	}
	groupID, err := uuid.Parse(q.Get("group_id"))
	if err != nil || groupID == uuid.Nil {
		badRequest("group_id must be a valid UUID")
		return
	}
	ratingMetric := q.Get("rating_metric")
	switch ratingMetric {
	case "peak", "mastery", "ranked_mastery", "renown":
	default:
		badRequest("rating_metric must be peak, mastery, ranked_mastery or renown")
		return
	}
	windowKind := q.Get("window_kind")
	performanceMetric := q.Get("performance_metric")
	if ratingMetric == "renown" {
		if performanceMetric != "none" || (windowKind != "period" && windowKind != "career") ||
			q.Get("class") != "" || q.Get("spec") != "" || q.Get("sub_spec") != "" {
			badRequest("Renown requires performance_metric=none, empty class/spec/sub_spec, and period or career window")
			return
		}
	} else {
		if !q.Has("class") || strings.TrimSpace(q.Get("class")) == "" || !q.Has("spec") || !q.Has("sub_spec") ||
			(performanceMetric != "dps" && performanceMetric != "hps") ||
			(ratingMetric == "peak" && windowKind != "period" && windowKind != "all_time") ||
			(ratingMetric != "peak" && windowKind != "period") {
			badRequest("Peak/Mastery require class, spec, sub_spec, dps or hps, and an applicable window")
			return
		}
	}
	limit := int64(50)
	if q.Has("limit") {
		limit, err = strconv.ParseInt(q.Get("limit"), 10, 32)
		if err != nil || limit < 1 || limit > 100 {
			badRequest("limit must be between 1 and 100")
			return
		}
	}

	bossParameters := []string{"instance_name", "encounter_name", "difficulty_name", "max_players"}
	bossCount := 0
	for _, name := range bossParameters {
		if q.Has(name) {
			bossCount++
		}
	}
	if bossCount != 0 && bossCount != len(bossParameters) {
		badRequest("exact boss queries require instance_name, encounter_name, difficulty_name and max_players")
		return
	}
	if bossCount != 0 && (strings.TrimSpace(q.Get("instance_name")) == "" || strings.TrimSpace(q.Get("encounter_name")) == "") {
		badRequest("instance_name and encounter_name must be non-empty")
		return
	}
	playerClass := ""
	if ratingMetric != "renown" {
		playerClass = string(db2sdk.HeroClassToDB(types.HeroClasses(q.Get("class"))))
	}
	tenantID := servicetenant.TenantIDFromContext(ctx)
	var rows []database.RatingBossScore
	if bossCount == 0 {
		rows, err = store.ListGroupRatingBossScores(ctx, database.ListGroupRatingBossScoresParams{
			TenantID: tenantID, GroupID: groupID, PlayerClass: playerClass,
			PlayerSpec: q.Get("spec"), PlayerSubSpec: q.Get("sub_spec"),
			PerformanceMetric: performanceMetric, RatingMetric: ratingMetric,
			WindowKind: windowKind, LimitCount: int32(limit),
		})
	} else {
		maxPlayers, parseErr := strconv.ParseInt(q.Get("max_players"), 10, 16)
		if parseErr != nil || maxPlayers <= 0 {
			badRequest("max_players must be a positive 16-bit integer")
			return
		}
		rows, err = store.ListActiveGroupBossRatingScores(ctx, database.ListActiveGroupBossRatingScoresParams{
			TenantID: tenantID, GroupID: groupID,
			InstanceName: q.Get("instance_name"), EncounterName: q.Get("encounter_name"),
			DifficultyName: q.Get("difficulty_name"), MaxPlayers: int16(maxPlayers),
			PlayerClass: playerClass, PlayerSpec: q.Get("spec"), PlayerSubSpec: q.Get("sub_spec"),
			PerformanceMetric: performanceMetric, RatingMetric: ratingMetric,
			WindowKind: windowKind, LimitCount: int32(limit),
		})
	}
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{Message: "Failed to fetch rating boss leaderboard", Detail: err.Error()},
		})
		return
	}
	entries := make([]chroniclesdk.RatingBossLeaderboardEntry, 0, len(rows))
	for _, row := range rows {
		entries = append(entries, ratingBossLeaderboardEntry(row))
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.RatingBossLeaderboardResponse{Entries: entries})
}

func ratingBossLeaderboardEntry(row database.RatingBossScore) chroniclesdk.RatingBossLeaderboardEntry {
	optionalFloat := func(value pgtype.Float8) *float64 {
		if !value.Valid {
			return nil
		}
		return &value.Float64
	}
	optionalTime := func(value pgtype.Timestamptz) *time.Time {
		if !value.Valid {
			return nil
		}
		return &value.Time
	}
	return chroniclesdk.RatingBossLeaderboardEntry{
		GenerationID: row.GenerationID, GroupID: row.GroupID.UUID, RealmID: row.RealmID,
		PlayerGUID: row.PlayerGuid, InstanceName: row.InstanceName, EncounterName: row.EncounterName,
		DifficultyName: row.DifficultyName, MaxPlayers: row.MaxPlayers, PlayerClass: row.PlayerClass,
		PlayerSpec: row.PlayerSpec, PlayerSubSpec: row.PlayerSubSpec,
		PerformanceMetric: row.PerformanceMetric, RatingMetric: row.RatingMetric, WindowKind: row.WindowKind,
		WindowStart: optionalTime(row.WindowStart), WindowEnd: optionalTime(row.WindowEnd),
		Score: row.Score, BestRaw: optionalFloat(row.BestRaw), RankOneRaw: optionalFloat(row.RankOneRaw),
		BestLockedParse: optionalFloat(row.BestLockedParse), Form: optionalFloat(row.Form),
		FloorScore: optionalFloat(row.FloorScore), EligibleKills: row.EligibleKills,
		ComputedAt: optionalTime(row.ComputedAt),
	}
}

// Retired group scope reader, retained for legacy tests only.
type ratingScopeLeaderboardQuerier interface {
	ListActiveRatingScopeScores(context.Context, database.ListActiveRatingScopeScoresParams) ([]database.RatingScopeScore, error)
}

func handleRatingScopeLeaderboardWithStore(store ratingScopeLeaderboardQuerier, w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q := r.URL.Query()
	badRequest := func(message string) {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: message})
	}
	groupID, err := uuid.Parse(q.Get("group_id"))
	if err != nil || groupID == uuid.Nil {
		badRequest("group_id must be a valid UUID")
		return
	}
	if !q.Has("difficulty_name") || !q.Has("max_players") {
		badRequest("difficulty_name and max_players cohort parameters are required")
		return
	}
	maxPlayers, err := strconv.ParseInt(q.Get("max_players"), 10, 16)
	if err != nil || maxPlayers < 0 {
		badRequest("max_players must be a non-negative 16-bit integer")
		return
	}
	ratingMetric := q.Get("rating_metric")
	windowKind := q.Get("window_kind")
	performanceMetric := q.Get("performance_metric")
	playerClass := ""
	switch ratingMetric {
	case "renown":
		if performanceMetric != "none" || (windowKind != "period" && windowKind != "career") ||
			q.Get("class") != "" || q.Get("spec") != "" || q.Get("sub_spec") != "" || maxPlayers != 0 || q.Get("difficulty_name") != "" {
			badRequest("Renown requires performance_metric=none, empty class/spec/sub_spec/difficulty_name, max_players=0, and period or career window")
			return
		}
	case "peak", "mastery", "ranked_mastery":
		if !q.Has("class") || strings.TrimSpace(q.Get("class")) == "" || !q.Has("spec") || !q.Has("sub_spec") ||
			(performanceMetric != "dps" && performanceMetric != "hps") ||
			(ratingMetric == "peak" && windowKind != "period" && windowKind != "all_time") ||
			(ratingMetric != "peak" && windowKind != "period") || maxPlayers == 0 {
			badRequest("Peak/Mastery require class, spec, sub_spec, dps or hps, positive max_players and an applicable window")
			return
		}
		playerClass = string(db2sdk.HeroClassToDB(types.HeroClasses(q.Get("class"))))
	default:
		badRequest("rating_metric must be peak, mastery, ranked_mastery or renown")
		return
	}
	limit := int64(50)
	if q.Has("limit") {
		limit, err = strconv.ParseInt(q.Get("limit"), 10, 32)
		if err != nil || limit < 1 || limit > 100 {
			badRequest("limit must be between 1 and 100")
			return
		}
	}
	instanceName := q.Get("instance_name")
	if q.Has("instance_name") && instanceName != "" && strings.TrimSpace(instanceName) == "" {
		badRequest("instance_name must be non-empty for raid scores")
		return
	}
	rows, err := store.ListActiveRatingScopeScores(ctx, database.ListActiveRatingScopeScoresParams{
		TenantID: servicetenant.TenantIDFromContext(ctx), GroupID: groupID,
		InstanceName: instanceName, DifficultyName: q.Get("difficulty_name"), MaxPlayers: int16(maxPlayers),
		PlayerClass: playerClass, PlayerSpec: q.Get("spec"), PlayerSubSpec: q.Get("sub_spec"),
		PerformanceMetric: performanceMetric, RatingMetric: ratingMetric, WindowKind: windowKind,
		LimitCount: int32(limit),
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{Message: "Failed to fetch rating scope leaderboard", Detail: err.Error()},
		})
		return
	}
	scope := "raid"
	if instanceName == "" {
		scope = "global"
	}
	entries := make([]chroniclesdk.RatingScopeLeaderboardEntry, 0, len(rows))
	for _, row := range rows {
		entry := chroniclesdk.RatingScopeLeaderboardEntry{
			GenerationID: row.GenerationID, GroupID: row.GroupID, RealmID: row.RealmID,
			PlayerGUID: row.PlayerGuid, InstanceName: row.InstanceName, DifficultyName: row.DifficultyName,
			MaxPlayers: row.MaxPlayers, PlayerClass: row.PlayerClass, PlayerSpec: row.PlayerSpec,
			PlayerSubSpec: row.PlayerSubSpec, PerformanceMetric: row.PerformanceMetric,
			RatingMetric: row.RatingMetric, WindowKind: row.WindowKind, Score: row.Score,
		}
		if row.ComputedAt.Valid {
			computedAt := row.ComputedAt.Time
			entry.ComputedAt = &computedAt
		}
		entries = append(entries, entry)
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.RatingScopeLeaderboardResponse{Scope: scope, Entries: entries})
}
