package servicerankings

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	types "github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type tenantRatingReader interface {
	GetActiveTenantRatingGeneration(context.Context, uuid.UUID) (uuid.UUID, error)
	ListActivePlayerTenantBossScores(context.Context, database.ListActivePlayerTenantBossScoresParams) ([]database.ListActivePlayerTenantBossScoresRow, error)
	ListActivePlayerTenantScopeScores(context.Context, database.ListActivePlayerTenantScopeScoresParams) ([]database.ListActivePlayerTenantScopeScoresRow, error)
	ListActiveAllClassPlayerTenantBossScores(context.Context, database.ListActiveAllClassPlayerTenantBossScoresParams) ([]database.ListActiveAllClassPlayerTenantBossScoresRow, error)
	ListActiveAllClassPlayerTenantScopeScores(context.Context, database.ListActiveAllClassPlayerTenantScopeScoresParams) ([]database.ListActiveAllClassPlayerTenantScopeScoresRow, error)
	ListActiveGuildTenantBossScores(context.Context, database.ListActiveGuildTenantBossScoresParams) ([]database.ListActiveGuildTenantBossScoresRow, error)
	ListActiveGuildTenantScopeScores(context.Context, database.ListActiveGuildTenantScopeScoresParams) ([]database.ListActiveGuildTenantScopeScoresRow, error)
}

// Tenant leaderboard handlers read only published tenant generations.
func (s *Service) handleTenantPlayerBossLeaderboard(w http.ResponseWriter, r *http.Request) {
	handleTenantRatingLeaderboardWithStore(s.store, w, r, false, true)
}
func (s *Service) handleTenantPlayerScopeLeaderboard(w http.ResponseWriter, r *http.Request) {
	handleTenantRatingLeaderboardWithStore(s.store, w, r, false, false)
}
func (s *Service) handleTenantGuildBossLeaderboard(w http.ResponseWriter, r *http.Request) {
	handleTenantRatingLeaderboardWithStore(s.store, w, r, true, true)
}
func (s *Service) handleTenantGuildScopeLeaderboard(w http.ResponseWriter, r *http.Request) {
	handleTenantRatingLeaderboardWithStore(s.store, w, r, true, false)
}

type tenantRatingCursor struct {
	Binding    string    `json:"b"`
	Generation uuid.UUID `json:"g"`
	Score      float64   `json:"s"`
	// Raw breaks tied player Peaks (higher DPS/HPS first); 0 for other metrics,
	// unknown throughput, and cursors issued before it existed.
	Raw    float64   `json:"w,omitempty"`
	Realm  uuid.UUID `json:"r"`
	Player string    `json:"p,omitempty"`
	Guild  uuid.UUID `json:"u,omitempty"`
}

func tenantRatingBad(w http.ResponseWriter, r *http.Request, msg string) {
	httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: msg})
}
func tenantRatingStale(w http.ResponseWriter, r *http.Request) {
	httpapi.Write(r.Context(), w, http.StatusConflict, chroniclesdk.Response{Message: "Rating leaderboard cursor is stale; restart from the first page"})
}

func tenantRatingInput(r *http.Request, guild, boss bool) (url.Values, []uuid.UUID, int32, string, tenantRatingCursor, error) {
	q := r.URL.Query()
	if q.Has("group_id") {
		return nil, nil, 0, "", tenantRatingCursor{}, errors.New("group_id is not a tenant leaderboard parameter")
	}
	for key, values := range q {
		if len(values) != 1 {
			return nil, nil, 0, "", tenantRatingCursor{}, errors.New(key + " must appear once")
		}
	}
	required := []string{"instance_name", "difficulty_name", "max_players", "rating_metric", "window_kind"}
	if boss {
		required = append(required, "encounter_name")
	}
	if !guild {
		required = append(required, "performance_metric")
		if q.Get("rating_metric") != "renown" && !q.Has("all_classes") {
			required = append(required, "class", "spec", "sub_spec")
		}
	}
	for _, key := range required {
		if !q.Has(key) {
			return nil, nil, 0, "", tenantRatingCursor{}, errors.New(key + " is required")
		}
	}
	if boss && (strings.TrimSpace(q.Get("instance_name")) == "" || strings.TrimSpace(q.Get("encounter_name")) == "") {
		return nil, nil, 0, "", tenantRatingCursor{}, errors.New("exact boss requires non-empty instance_name and encounter_name")
	}
	if !boss && q.Has("encounter_name") {
		return nil, nil, 0, "", tenantRatingCursor{}, errors.New("encounter_name is not a scope parameter")
	}
	if !boss && strings.TrimSpace(q.Get("instance_name")) == "" {
		return nil, nil, 0, "", tenantRatingCursor{}, errors.New("instance_name must be non-empty for raid scores")
	}
	max, err := strconv.ParseInt(q.Get("max_players"), 10, 16)
	if err != nil || max < 0 {
		return nil, nil, 0, "", tenantRatingCursor{}, errors.New("invalid max_players")
	}
	metric, window := q.Get("rating_metric"), q.Get("window_kind")
	switch metric {
	case "peak":
		if window != "period" && window != "all_time" {
			return nil, nil, 0, "", tenantRatingCursor{}, errors.New("invalid peak window")
		}
	case "mastery", "ranked_mastery":
		if window != "period" && window != "all_time" {
			return nil, nil, 0, "", tenantRatingCursor{}, errors.New("invalid mastery window")
		}
	case "renown":
		if window != "period" && window != "career" {
			return nil, nil, 0, "", tenantRatingCursor{}, errors.New("invalid renown window")
		}
	default:
		return nil, nil, 0, "", tenantRatingCursor{}, errors.New("invalid rating_metric")
	}
	if q.Has("all_classes") && (q.Get("all_classes") != "true" || guild || metric == "renown") {
		return nil, nil, 0, "", tenantRatingCursor{}, errors.New("all_classes is only supported for non-renown player boards")
	}
	if guild {
		for _, key := range []string{"class", "spec", "sub_spec", "performance_metric"} {
			if q.Has(key) {
				return nil, nil, 0, "", tenantRatingCursor{}, errors.New(key + " is not a guild parameter")
			}
		}
	} else if metric == "renown" {
		if q.Get("class") != "" || q.Get("spec") != "" || q.Get("sub_spec") != "" || q.Get("performance_metric") != "none" {
			return nil, nil, 0, "", tenantRatingCursor{}, errors.New("invalid renown player cohort")
		}
	} else if (q.Get("performance_metric") != "dps" && q.Get("performance_metric") != "hps") ||
		(q.Has("all_classes") && ((q.Get("class") == "" && (q.Get("spec") != "" || q.Get("sub_spec") != "")) || (q.Get("spec") == "" && q.Get("sub_spec") != ""))) ||
		(!q.Has("all_classes") && strings.TrimSpace(q.Get("class")) == "") ||
		(q.Has("all_classes") && q.Get("class") != "" && strings.TrimSpace(q.Get("class")) == "") {
		return nil, nil, 0, "", tenantRatingCursor{}, errors.New("invalid player cohort")
	}
	// The request already requires both keys by presence. Empty difficulty and
	// size zero are valid exact Turtle/vanilla raid cohorts.
	if metric == "renown" && (max != 0 || q.Get("difficulty_name") != "") {
		return nil, nil, 0, "", tenantRatingCursor{}, errors.New("max_players and difficulty_name must match the rating cohort")
	}
	limit := int64(50)
	if q.Has("limit") {
		limit, err = strconv.ParseInt(q.Get("limit"), 10, 32)
		if err != nil || limit < 1 || limit > 100 {
			return nil, nil, 0, "", tenantRatingCursor{}, errors.New("limit must be between 1 and 100")
		}
	}
	var realms []uuid.UUID
	if q.Has("realm_ids") {
		if q.Get("realm_ids") == "" {
			return nil, nil, 0, "", tenantRatingCursor{}, errors.New("realm_ids must contain UUIDs")
		}
		seen := make(map[uuid.UUID]bool)
		for _, text := range strings.Split(q.Get("realm_ids"), ",") {
			id, e := uuid.Parse(strings.TrimSpace(text))
			if e != nil || id == uuid.Nil {
				return nil, nil, 0, "", tenantRatingCursor{}, errors.New("realm_ids must contain UUIDs")
			}
			if !seen[id] {
				realms = append(realms, id)
				seen[id] = true
			}
		}
		sort.Slice(realms, func(i, j int) bool { return realms[i].String() < realms[j].String() })
	}
	// Bind only semantic cohort/filter fields, not page size. A canonical encoding also
	// allows equivalent realm orderings to resume the same board.
	cohort := []any{servicetenant.TenantIDFromContext(r.Context()), guild, boss, q.Get("instance_name"), q.Get("encounter_name"), q.Get("difficulty_name"), max, q.Get("class"), q.Get("spec"), q.Get("sub_spec"), q.Get("performance_metric"), metric, window, realms}
	if q.Has("all_classes") {
		cohort = append(cohort, "all_classes")
	}
	raw, _ := json.Marshal(cohort)
	hash := sha256.Sum256(raw)
	binding := hex.EncodeToString(hash[:])
	var cursor tenantRatingCursor
	if q.Has("cursor") {
		encoded := q.Get("cursor")
		if len(encoded) > 2048 {
			return nil, nil, 0, "", cursor, errors.New("invalid cursor")
		}
		bytes, e := base64.RawURLEncoding.DecodeString(encoded)
		if e != nil || json.Unmarshal(bytes, &cursor) != nil || cursor.Binding != binding || cursor.Generation == uuid.Nil || cursor.Realm == uuid.Nil || math.IsNaN(cursor.Score) || math.IsInf(cursor.Score, 0) || (guild && (cursor.Guild == uuid.Nil || cursor.Player != "")) || (!guild && (cursor.Player == "" || cursor.Guild != uuid.Nil)) {
			return nil, nil, 0, "", cursor, errors.New("invalid cursor for this leaderboard")
		}
	}
	return q, realms, int32(limit), binding, cursor, nil
}

// tenantPeakTieRaw is the player board's tie-break key after the score: the
// Peak's DPS/HPS, or 0 when unknown or for other metrics (matches the SQL).
func tenantPeakTieRaw(metric string, raw pgtype.Float8) float64 {
	if metric != "peak" || !raw.Valid {
		return 0
	}
	return raw.Float64
}

func tenantCursorEncode(cursor tenantRatingCursor) string {
	raw, _ := json.Marshal(cursor)
	return base64.RawURLEncoding.EncodeToString(raw)
}

func handleTenantRatingLeaderboardWithStore(store tenantRatingReader, w http.ResponseWriter, r *http.Request, guild, boss bool) {
	q, realms, limit, binding, cursor, err := tenantRatingInput(r, guild, boss)
	if err != nil {
		tenantRatingBad(w, r, err.Error())
		return
	}
	ctx := r.Context()
	tenant := servicetenant.TenantIDFromContext(ctx)
	generation, err := store.GetActiveTenantRatingGeneration(ctx, tenant)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) && !errors.Is(err, sql.ErrNoRows) {
		httpapi.InternalServerError(w, err)
		return
	}
	if cursor.Generation != uuid.Nil && (err != nil || cursor.Generation != generation) {
		tenantRatingStale(w, r)
		return
	}
	if err != nil || generation == uuid.Nil {
		writeEmptyTenantRating(w, r, guild, boss)
		return
	}
	// Both first and continuation pages pin the generation; never use the SQL wildcard.
	var payload any
	next := ""
	if guild && boss {
		params := database.ListActiveGuildTenantBossScoresParams{TenantID: tenant, GenerationID: generation, InstanceName: q.Get("instance_name"), EncounterName: q.Get("encounter_name"), DifficultyName: q.Get("difficulty_name"), MaxPlayers: tenantMax(q), RatingMetric: q.Get("rating_metric"), WindowKind: q.Get("window_kind"), RealmIds: realms, LimitCount: limit}
		params.AfterScore, params.AfterRealmID, params.AfterGuildID = cursor.Score, cursor.Realm, cursor.Guild
		rows, e := store.ListActiveGuildTenantBossScores(ctx, params)
		if e != nil {
			httpapi.InternalServerError(w, e)
			return
		}
		entries := make([]chroniclesdk.TenantGuildBossLeaderboardEntry, 0, len(rows))
		for _, row := range rows {
			if row.GenerationID != generation || row.TenantID != tenant {
				httpapi.InternalServerError(w, errors.New("tenant rating row generation mismatch"))
				return
			}
			entries = append(entries, chroniclesdk.TenantGuildBossLeaderboardEntry{GenerationID: row.GenerationID, RealmID: row.RealmID, GuildID: row.GuildID, GuildName: tenantRatingName(row.GuildName), RealmName: row.RealmName, InstanceName: row.InstanceName, EncounterName: row.EncounterName, DifficultyName: row.DifficultyName, MaxPlayers: row.MaxPlayers, RatingMetric: row.RatingMetric, WindowKind: row.WindowKind, WindowStart: guildRatingTime(row.WindowStart), WindowEnd: guildRatingTime(row.WindowEnd), Score: row.Score, BestRaw: guildRatingFloat(row.BestRaw), RankOneRaw: guildRatingFloat(row.RankOneRaw), BestLockedParse: guildRatingFloat(row.BestLockedParse), Form: guildRatingFloat(row.Form), FloorScore: guildRatingFloat(row.FloorScore), EligibleKills: row.EligibleKills, ComputedAt: guildRatingTime(row.ComputedAt)})
		}
		if len(rows) == int(limit) {
			last := rows[len(rows)-1]
			params.AfterScore, params.AfterRealmID, params.AfterGuildID = last.Score, last.RealmID, last.GuildID
			params.LimitCount = 1
			more, e := store.ListActiveGuildTenantBossScores(ctx, params)
			if e != nil {
				httpapi.InternalServerError(w, e)
				return
			}
			if len(more) > 0 {
				next = tenantCursorEncode(tenantRatingCursor{Binding: binding, Generation: generation, Score: last.Score, Realm: last.RealmID, Guild: last.GuildID})
			}
		}
		payload = chroniclesdk.TenantGuildBossLeaderboardResponse{Entries: entries, NextCursor: next}
	} else if guild {
		params := database.ListActiveGuildTenantScopeScoresParams{TenantID: tenant, GenerationID: generation, InstanceName: q.Get("instance_name"), DifficultyName: q.Get("difficulty_name"), MaxPlayers: tenantMax(q), RatingMetric: q.Get("rating_metric"), WindowKind: q.Get("window_kind"), RealmIds: realms, LimitCount: limit}
		params.AfterScore, params.AfterRealmID, params.AfterGuildID = cursor.Score, cursor.Realm, cursor.Guild
		rows, e := store.ListActiveGuildTenantScopeScores(ctx, params)
		if e != nil {
			httpapi.InternalServerError(w, e)
			return
		}
		entries := make([]chroniclesdk.TenantGuildScopeLeaderboardEntry, 0, len(rows))
		for _, row := range rows {
			if row.GenerationID != generation || row.TenantID != tenant {
				httpapi.InternalServerError(w, errors.New("tenant rating row generation mismatch"))
				return
			}
			entries = append(entries, chroniclesdk.TenantGuildScopeLeaderboardEntry{GenerationID: row.GenerationID, RealmID: row.RealmID, GuildID: row.GuildID, GuildName: tenantRatingName(row.GuildName), RealmName: row.RealmName, InstanceName: row.InstanceName, DifficultyName: row.DifficultyName, MaxPlayers: row.MaxPlayers, RatingMetric: row.RatingMetric, WindowKind: row.WindowKind, Score: row.Score, ComputedAt: guildRatingTime(row.ComputedAt)})
		}
		if len(rows) == int(limit) {
			last := rows[len(rows)-1]
			params.AfterScore, params.AfterRealmID, params.AfterGuildID = last.Score, last.RealmID, last.GuildID
			params.LimitCount = 1
			more, e := store.ListActiveGuildTenantScopeScores(ctx, params)
			if e != nil {
				httpapi.InternalServerError(w, e)
				return
			}
			if len(more) > 0 {
				next = tenantCursorEncode(tenantRatingCursor{Binding: binding, Generation: generation, Score: last.Score, Realm: last.RealmID, Guild: last.GuildID})
			}
		}
		payload = chroniclesdk.TenantGuildScopeLeaderboardResponse{Scope: "raid", Entries: entries, NextCursor: next}
	} else if boss {
		read := func(p database.ListActivePlayerTenantBossScoresParams) ([]database.ListActivePlayerTenantBossScoresRow, error) {
			if !q.Has("all_classes") {
				return store.ListActivePlayerTenantBossScores(ctx, p)
			}
			all := database.ListActiveAllClassPlayerTenantBossScoresParams{TenantID: p.TenantID, GenerationID: p.GenerationID,
				InstanceName: p.InstanceName, EncounterName: p.EncounterName, DifficultyName: p.DifficultyName,
				MaxPlayers: p.MaxPlayers, PlayerClass: p.PlayerClass, PlayerSpec: p.PlayerSpec, PlayerSubSpec: p.PlayerSubSpec,
				PerformanceMetric: p.PerformanceMetric, RatingMetric: p.RatingMetric, WindowKind: p.WindowKind,
				RealmIds: p.RealmIds, LimitCount: p.LimitCount, AfterScore: p.AfterScore, AfterRaw: p.AfterRaw,
				AfterRealmID: p.AfterRealmID, AfterPlayerGuid: p.AfterPlayerGuid}
			selected, err := store.ListActiveAllClassPlayerTenantBossScores(ctx, all)
			if err != nil {
				return nil, err
			}
			rows := make([]database.ListActivePlayerTenantBossScoresRow, len(selected))
			for i, row := range selected {
				rows[i] = database.ListActivePlayerTenantBossScoresRow(row)
			}
			return rows, nil
		}
		params := database.ListActivePlayerTenantBossScoresParams{TenantID: tenant, GenerationID: generation, InstanceName: q.Get("instance_name"), EncounterName: q.Get("encounter_name"), DifficultyName: q.Get("difficulty_name"), MaxPlayers: tenantMax(q), PlayerClass: tenantClass(q), PlayerSpec: q.Get("spec"), PlayerSubSpec: q.Get("sub_spec"), PerformanceMetric: q.Get("performance_metric"), RatingMetric: q.Get("rating_metric"), WindowKind: q.Get("window_kind"), RealmIds: realms, LimitCount: limit}
		params.AfterScore, params.AfterRaw, params.AfterRealmID, params.AfterPlayerGuid = cursor.Score, cursor.Raw, cursor.Realm, cursor.Player
		rows, e := read(params)
		if e != nil {
			httpapi.InternalServerError(w, e)
			return
		}
		entries := make([]chroniclesdk.TenantPlayerBossLeaderboardEntry, 0, len(rows))
		for _, row := range rows {
			if row.GenerationID != generation || row.TenantID != tenant {
				httpapi.InternalServerError(w, errors.New("tenant rating row generation mismatch"))
				return
			}
			entries = append(entries, chroniclesdk.TenantPlayerBossLeaderboardEntry{GenerationID: row.GenerationID, RealmID: row.RealmID, PlayerGUID: row.PlayerGuid, PlayerName: tenantRatingName(row.PlayerName), GuildName: tenantRatingName(row.GuildName), RealmName: row.RealmName, InstanceName: row.InstanceName, EncounterName: row.EncounterName, DifficultyName: row.DifficultyName, MaxPlayers: row.MaxPlayers, PlayerClass: row.PlayerClass, PlayerSpec: row.PlayerSpec, PlayerSubSpec: row.PlayerSubSpec, PerformanceMetric: row.PerformanceMetric, RatingMetric: row.RatingMetric, WindowKind: row.WindowKind, WindowStart: guildRatingTime(row.WindowStart), WindowEnd: guildRatingTime(row.WindowEnd), Score: row.Score, BestRaw: guildRatingFloat(row.BestRaw), RankOneRaw: guildRatingFloat(row.RankOneRaw), BestLockedParse: guildRatingFloat(row.BestLockedParse), Form: guildRatingFloat(row.Form), FloorScore: guildRatingFloat(row.FloorScore), EligibleKills: row.EligibleKills, ComputedAt: guildRatingTime(row.ComputedAt)})
		}
		if len(rows) == int(limit) {
			last := rows[len(rows)-1]
			raw := tenantPeakTieRaw(last.RatingMetric, last.BestRaw)
			params.AfterScore, params.AfterRaw, params.AfterRealmID, params.AfterPlayerGuid = last.Score, raw, last.RealmID, last.PlayerGuid
			params.LimitCount = 1
			more, e := read(params)
			if e != nil {
				httpapi.InternalServerError(w, e)
				return
			}
			if len(more) > 0 {
				next = tenantCursorEncode(tenantRatingCursor{Binding: binding, Generation: generation, Score: last.Score, Raw: raw, Realm: last.RealmID, Player: last.PlayerGuid})
			}
		}
		payload = chroniclesdk.TenantPlayerBossLeaderboardResponse{Entries: entries, NextCursor: next}
	} else {
		read := func(p database.ListActivePlayerTenantScopeScoresParams) ([]database.ListActivePlayerTenantScopeScoresRow, error) {
			if !q.Has("all_classes") {
				return store.ListActivePlayerTenantScopeScores(ctx, p)
			}
			all := database.ListActiveAllClassPlayerTenantScopeScoresParams{TenantID: p.TenantID, GenerationID: p.GenerationID,
				InstanceName: p.InstanceName, DifficultyName: p.DifficultyName,
				MaxPlayers: p.MaxPlayers, PlayerClass: p.PlayerClass, PlayerSpec: p.PlayerSpec, PlayerSubSpec: p.PlayerSubSpec,
				PerformanceMetric: p.PerformanceMetric, RatingMetric: p.RatingMetric, WindowKind: p.WindowKind,
				RealmIds: p.RealmIds, LimitCount: p.LimitCount, AfterScore: p.AfterScore, AfterRaw: p.AfterRaw,
				AfterRealmID: p.AfterRealmID, AfterPlayerGuid: p.AfterPlayerGuid}
			selected, err := store.ListActiveAllClassPlayerTenantScopeScores(ctx, all)
			if err != nil {
				return nil, err
			}
			rows := make([]database.ListActivePlayerTenantScopeScoresRow, len(selected))
			for i, row := range selected {
				rows[i] = database.ListActivePlayerTenantScopeScoresRow(row)
			}
			return rows, nil
		}
		params := database.ListActivePlayerTenantScopeScoresParams{TenantID: tenant, GenerationID: generation, InstanceName: q.Get("instance_name"), DifficultyName: q.Get("difficulty_name"), MaxPlayers: tenantMax(q), PlayerClass: tenantClass(q), PlayerSpec: q.Get("spec"), PlayerSubSpec: q.Get("sub_spec"), PerformanceMetric: q.Get("performance_metric"), RatingMetric: q.Get("rating_metric"), WindowKind: q.Get("window_kind"), RealmIds: realms, LimitCount: limit}
		params.AfterScore, params.AfterRaw, params.AfterRealmID, params.AfterPlayerGuid = cursor.Score, cursor.Raw, cursor.Realm, cursor.Player
		rows, e := read(params)
		if e != nil {
			httpapi.InternalServerError(w, e)
			return
		}
		entries := make([]chroniclesdk.TenantPlayerScopeLeaderboardEntry, 0, len(rows))
		for _, row := range rows {
			if row.GenerationID != generation || row.TenantID != tenant {
				httpapi.InternalServerError(w, errors.New("tenant rating row generation mismatch"))
				return
			}
			entries = append(entries, chroniclesdk.TenantPlayerScopeLeaderboardEntry{GenerationID: row.GenerationID, RealmID: row.RealmID, PlayerGUID: row.PlayerGuid, PlayerName: tenantRatingName(row.PlayerName), GuildName: tenantRatingName(row.GuildName), RealmName: row.RealmName, InstanceName: row.InstanceName, DifficultyName: row.DifficultyName, MaxPlayers: row.MaxPlayers, PlayerClass: row.PlayerClass, PlayerSpec: row.PlayerSpec, PlayerSubSpec: row.PlayerSubSpec, PerformanceMetric: row.PerformanceMetric, RatingMetric: row.RatingMetric, WindowKind: row.WindowKind, Score: row.Score, BestRaw: guildRatingFloat(row.BestRaw), ComputedAt: guildRatingTime(row.ComputedAt)})
		}
		if len(rows) == int(limit) {
			last := rows[len(rows)-1]
			raw := tenantPeakTieRaw(last.RatingMetric, last.BestRaw)
			params.AfterScore, params.AfterRaw, params.AfterRealmID, params.AfterPlayerGuid = last.Score, raw, last.RealmID, last.PlayerGuid
			params.LimitCount = 1
			more, e := read(params)
			if e != nil {
				httpapi.InternalServerError(w, e)
				return
			}
			if len(more) > 0 {
				next = tenantCursorEncode(tenantRatingCursor{Binding: binding, Generation: generation, Score: last.Score, Raw: raw, Realm: last.RealmID, Player: last.PlayerGuid})
			}
		}
		payload = chroniclesdk.TenantPlayerScopeLeaderboardResponse{Scope: "raid", Entries: entries, NextCursor: next}
	}
	// An activation between queries invalidates the entire response, including the lookahead.
	active, e := store.GetActiveTenantRatingGeneration(ctx, tenant)
	if e != nil || active != generation {
		if e == nil || errors.Is(e, pgx.ErrNoRows) || errors.Is(e, sql.ErrNoRows) {
			tenantRatingStale(w, r)
		} else {
			httpapi.InternalServerError(w, e)
		}
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, payload)
}
func tenantRatingName(name pgtype.Text) *string {
	if !name.Valid {
		return nil
	}
	return &name.String
}
func tenantMax(q url.Values) int16 {
	n, _ := strconv.ParseInt(q.Get("max_players"), 10, 16)
	return int16(n)
}
func tenantClass(q url.Values) string {
	if q.Get("rating_metric") == "renown" || q.Get("class") == "" {
		return ""
	}
	return string(db2sdk.HeroClassToDB(types.HeroClasses(q.Get("class"))))
}
func writeEmptyTenantRating(w http.ResponseWriter, r *http.Request, guild, boss bool) {
	var payload any
	switch {
	case guild && boss:
		payload = chroniclesdk.TenantGuildBossLeaderboardResponse{Entries: []chroniclesdk.TenantGuildBossLeaderboardEntry{}}
	case guild:
		payload = chroniclesdk.TenantGuildScopeLeaderboardResponse{Scope: "raid", Entries: []chroniclesdk.TenantGuildScopeLeaderboardEntry{}}
	case boss:
		payload = chroniclesdk.TenantPlayerBossLeaderboardResponse{Entries: []chroniclesdk.TenantPlayerBossLeaderboardEntry{}}
	default:
		payload = chroniclesdk.TenantPlayerScopeLeaderboardResponse{Scope: "raid", Entries: []chroniclesdk.TenantPlayerScopeLeaderboardEntry{}}
	}
	httpapi.Write(r.Context(), w, http.StatusOK, payload)
}
