package serviceexternalapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const maxCharacterLogsPageSize = 50

type Server struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	URL         string    `json:"url,omitempty"`
	Realms      []Realm   `json:"realms,omitempty"`
}

type ServersResponse struct {
	Servers []Server `json:"servers"`
}

type Realm struct {
	ID          uuid.UUID `json:"id"`
	ServerID    uuid.UUID `json:"server_id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	URL         string    `json:"url,omitempty"`
}

type RealmsResponse struct {
	Server Server  `json:"server"`
	Realms []Realm `json:"realms"`
}

type Guild struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}

type Character struct {
	GUID                chroniclesdk.GUIDString `json:"guid"`
	Name                string                  `json:"name"`
	Class               string                  `json:"class"`
	Race                string                  `json:"race"`
	Gender              string                  `json:"gender"`
	Level               int32                   `json:"level"`
	Spec                string                  `json:"spec,omitempty"`
	Role                string                  `json:"role,omitempty"`
	AverageItemLevel    *int32                  `json:"average_item_level,omitempty"`
	Guild               *Guild                  `json:"guild,omitempty"`
	Server              Server                  `json:"server"`
	Realm               Realm                   `json:"realm"`
	UpdatedAt           time.Time               `json:"updated_at"`
	UpdatedFromInstance *uuid.UUID              `json:"updated_from_instance,omitempty"`
}

type CharacterEncounterPerformance struct {
	EncounterName string `json:"encounter_name"`
	DPSParse      *int32 `json:"dps_parse,omitempty"`
	HPSParse      *int32 `json:"hps_parse,omitempty"`
}

type CharacterLog struct {
	ID          uuid.UUID                       `json:"id"`
	Slug        string                          `json:"slug,omitempty"`
	Name        string                          `json:"name"`
	Guild       *Guild                          `json:"guild,omitempty"`
	Difficulty  string                          `json:"difficulty,omitempty"`
	MaxPlayers  int32                           `json:"max_players,omitempty"`
	BossKills   int32                           `json:"boss_kills"`
	StartedAt   time.Time                       `json:"started_at"`
	EndedAt     time.Time                       `json:"ended_at"`
	UploadedAt  time.Time                       `json:"uploaded_at"`
	Performance []CharacterEncounterPerformance `json:"performance,omitempty"`
}

type Pagination struct {
	Page     int32 `json:"page"`
	PageSize int32 `json:"page_size"`
	HasMore  bool  `json:"has_more"`
}

type CharacterLogsResponse struct {
	Character  Character      `json:"character"`
	Logs       []CharacterLog `json:"logs"`
	Pagination Pagination     `json:"pagination"`
}

type SpeedrunLeaderboardLog struct {
	ID              uuid.UUID  `json:"id"`
	Slug            string     `json:"slug,omitempty"`
	DurationMs      *int64     `json:"duration_ms,omitempty"`
	StartTime       *time.Time `json:"start_time,omitempty"`
	CompletionTime  *time.Time `json:"completion_time,omitempty"`
	ParserVersion   string     `json:"parser_version,omitempty"`
	AddonVersion    string     `json:"addon_version,omitempty"`
	HasYoutubeVideo bool       `json:"has_youtube_video"`
	YoutubeURL      string     `json:"youtube_url,omitempty"`
}

type SpeedrunLeaderboardEntry struct {
	InstanceName     string                   `json:"instance_name"`
	DifficultyName   string                   `json:"difficulty_name"`
	GuildID          uuid.UUID                `json:"guild_id"`
	GuildName        string                   `json:"guild_name"`
	GuildLogoURL     string                   `json:"guild_logo_url,omitempty"`
	RealmName        string                   `json:"realm_name"`
	PlayerCount      int64                    `json:"player_count"`
	Canonical        SpeedrunLeaderboardLog   `json:"canonical"`
	IsDuplicate      bool                     `json:"is_duplicate"`
	DuplicateGroupID *uuid.UUID               `json:"duplicate_group_id,omitempty"`
	OtherLogs        []SpeedrunLeaderboardLog `json:"other_logs,omitempty"`
}

type SpeedrunLeaderboardResponse struct {
	Timing  string                     `json:"timing"`
	Entries []SpeedrunLeaderboardEntry `json:"entries"`
}

func (s *Service) listServers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.ListExternalAPIServers(r.Context())
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	servers := make([]Server, 0, len(rows))
	serverIndexes := make(map[uuid.UUID]int, len(rows))
	for _, row := range rows {
		index, ok := serverIndexes[row.ID]
		if !ok {
			index = len(servers)
			serverIndexes[row.ID] = index
			servers = append(servers, Server{
				ID: row.ID, Name: row.Name, Description: row.Description, URL: row.Url.String,
				Realms: make([]Realm, 0),
			})
		}
		if row.RealmID.Valid {
			servers[index].Realms = append(servers[index].Realms, Realm{
				ID: row.RealmID.UUID, ServerID: row.ID, Name: row.RealmName.String,
				Description: row.RealmDescription.String, URL: row.RealmUrl.String,
			})
		}
	}
	httpapi.Write(r.Context(), w, http.StatusOK, ServersResponse{Servers: servers})
}

func (s *Service) listRealms(w http.ResponseWriter, r *http.Request) {
	serverParam := chi.URLParam(r, "server")
	serverRow, err := s.db.ResolveExternalAPIServer(r.Context(), serverParam)
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w, r, "Server not found")
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	rows, err := s.db.ListExternalAPIRealms(r.Context(), serverParam)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	realms := make([]Realm, 0, len(rows))
	for _, row := range rows {
		realms = append(realms, Realm{
			ID: row.ID, ServerID: row.ServerID, Name: row.Name,
			Description: row.Description, URL: row.Url.String,
		})
	}
	httpapi.Write(r.Context(), w, http.StatusOK, RealmsResponse{
		Server: serverFromRow(serverRow),
		Realms: realms,
	})
}

func (s *Service) getCharacter(w http.ResponseWriter, r *http.Request) {
	character, _, ok := s.resolveCharacter(w, r)
	if !ok {
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, character)
}

func (s *Service) listCharacterLogs(w http.ResponseWriter, r *http.Request) {
	character, resolved, ok := s.resolveCharacter(w, r)
	if !ok {
		return
	}

	page := queryInt(r, "page", 1)
	pageSize := queryInt(r, "page_size", maxCharacterLogsPageSize)
	if page < 1 || pageSize < 1 || pageSize > maxCharacterLogsPageSize {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "page must be at least 1 and page_size must be between 1 and 50",
		})
		return
	}

	tenantID := uuid.Nil
	if resolved.realm.TenantID.Valid {
		tenantID = resolved.realm.TenantID.UUID
	}
	rows, err := s.db.ListExternalAPICharacterLogs(r.Context(), database.ListExternalAPICharacterLogsParams{
		PlayerGuid:   resolved.player.ID,
		TenantID:     tenantID,
		ResultOffset: (page - 1) * pageSize,
		ResultLimit:  pageSize + 1,
		RealmID:      resolved.realm.ID,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	hasMore := len(rows) > int(pageSize)
	if hasMore {
		rows = rows[:pageSize]
	}
	logs := make([]CharacterLog, 0, len(rows))
	for _, row := range rows {
		log, err := characterLogFromRow(row)
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		logs = append(logs, log)
	}
	httpapi.Write(r.Context(), w, http.StatusOK, CharacterLogsResponse{
		Character:  character,
		Logs:       logs,
		Pagination: Pagination{Page: page, PageSize: pageSize, HasMore: hasMore},
	})
}

func (s *Service) listSpeedrunLeaderboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	instanceName := r.URL.Query().Get("instance_name")
	if instanceName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "instance_name query parameter is required",
		})
		return
	}

	timing, useRankedTiming, ok := externalSpeedrunTiming(r.URL.Query().Get("timing"))
	if !ok {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "timing query parameter must be full or boss_to_boss",
		})
		return
	}

	minPlayers, ok := queryNonNegativeInt64(r, "min_players")
	if !ok {
		writeInvalidNonNegativeInteger(w, r, "min_players")
		return
	}
	maxPlayers, ok := queryNonNegativeInt64(r, "max_players")
	if !ok {
		writeInvalidNonNegativeInteger(w, r, "max_players")
		return
	}
	sinceDays, ok := queryNonNegativeInt64(r, "since_days")
	if !ok {
		writeInvalidNonNegativeInteger(w, r, "since_days")
		return
	}

	filterDifficulty := r.URL.Query().Has("difficulty_name")
	rows, err := s.db.SpeedrunLeaderboard(ctx, database.SpeedrunLeaderboardParams{
		InstanceName:     instanceName,
		RealmNames:       r.URL.Query()["realm_name"],
		MinPlayers:       minPlayers,
		MaxPlayers:       maxPlayers,
		GuildID:          r.URL.Query().Get("guild_id"),
		SinceDays:        sinceDays,
		FilterDifficulty: filterDifficulty,
		DifficultyName:   r.URL.Query().Get("difficulty_name"),
		UseRankedTiming:  useRankedTiming,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	selectedIDs := make([]uuid.UUID, 0, len(rows))
	entries := make([]SpeedrunLeaderboardEntry, 0, len(rows))
	entryIndexes := make(map[uuid.UUID]int, len(rows))
	for _, row := range rows {
		duration := row.DurationMs
		startTime := row.StartTime.Time
		completionTime := row.CompletionTime.Time
		entry := SpeedrunLeaderboardEntry{
			InstanceName: row.InstanceName, DifficultyName: row.DifficultyName,
			GuildID: row.GuildID.UUID, GuildName: row.GuildName, GuildLogoURL: row.GuildLogoUrl,
			RealmName: row.RealmName, PlayerCount: row.PlayerCount,
			Canonical: SpeedrunLeaderboardLog{
				ID: row.InstanceID, Slug: row.HashedSlug.String, DurationMs: &duration,
				StartTime: &startTime, CompletionTime: &completionTime,
				ParserVersion: row.ParserVersion, AddonVersion: row.AddonVersion,
				HasYoutubeVideo: row.HasYoutubeVideo, YoutubeURL: row.YoutubeUrl,
			},
		}
		if row.DuplicateGroupID.Valid {
			groupID := row.DuplicateGroupID.UUID
			entry.DuplicateGroupID = &groupID
		}
		entryIndexes[row.InstanceID] = len(entries)
		selectedIDs = append(selectedIDs, row.InstanceID)
		entries = append(entries, entry)
	}

	if len(selectedIDs) > 0 {
		duplicates, err := s.db.ListExternalAPILeaderboardDuplicateLogs(ctx, database.ListExternalAPILeaderboardDuplicateLogsParams{
			UseRankedTiming: useRankedTiming, SelectedInstanceIds: selectedIDs,
		})
		if err != nil {
			httpapi.InternalServerError(w, err)
			return
		}
		for _, duplicate := range duplicates {
			index, found := entryIndexes[duplicate.SelectedInstanceID]
			if !found {
				continue
			}
			log := SpeedrunLeaderboardLog{
				ID: duplicate.ID, Slug: duplicate.HashedSlug.String,
				ParserVersion: duplicate.ParserVersion, AddonVersion: duplicate.AddonVersion,
				HasYoutubeVideo: duplicate.HasYoutubeVideo, YoutubeURL: duplicate.YoutubeUrl,
			}
			if duplicate.DurationMs > 0 {
				duration := duplicate.DurationMs
				log.DurationMs = &duration
			}
			if duplicate.StartTime.Valid {
				startTime := duplicate.StartTime.Time
				log.StartTime = &startTime
			}
			if duplicate.CompletionTime.Valid {
				completionTime := duplicate.CompletionTime.Time
				log.CompletionTime = &completionTime
			}
			entries[index].OtherLogs = append(entries[index].OtherLogs, log)
			entries[index].IsDuplicate = true
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, SpeedrunLeaderboardResponse{
		Timing: timing, Entries: entries,
	})
}

func externalSpeedrunTiming(value string) (string, bool, bool) {
	switch value {
	case "", "full":
		return "full", false, true
	case "boss_to_boss":
		return "boss_to_boss", true, true
	default:
		return "", false, false
	}
}

func queryNonNegativeInt64(r *http.Request, name string) (int64, bool) {
	value := r.URL.Query().Get(name)
	if value == "" {
		return 0, true
	}
	parsed, err := strconv.ParseInt(value, 10, 64)
	return parsed, err == nil && parsed >= 0
}

func writeInvalidNonNegativeInteger(w http.ResponseWriter, r *http.Request, name string) {
	httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{
		Message: name + " query parameter must be a non-negative integer",
	})
}

type resolvedCharacter struct {
	realm  database.ResolveExternalAPIRealmRow
	player database.GetExternalAPICharacterRow
}

func (s *Service) resolveCharacter(w http.ResponseWriter, r *http.Request) (Character, resolvedCharacter, bool) {
	ctx := r.Context()
	realm, err := s.db.ResolveExternalAPIRealm(ctx, database.ResolveExternalAPIRealmParams{
		Server: chi.URLParam(r, "server"), Realm: chi.URLParam(r, "realm"),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w, r, "Server or realm not found")
		return Character{}, resolvedCharacter{}, false
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return Character{}, resolvedCharacter{}, false
	}

	characterParam := chi.URLParam(r, "character")
	player, err := s.db.GetExternalAPICharacter(ctx, database.GetExternalAPICharacterParams{
		RealmID: realm.ID, Identifier: parseCharacterGUID(characterParam), Name: characterParam,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w, r, "Character not found")
		return Character{}, resolvedCharacter{}, false
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return Character{}, resolvedCharacter{}, false
	}

	resolved := resolvedCharacter{realm: realm, player: player}
	return characterFromRows(realm, player), resolved, true
}

func characterFromRows(realm database.ResolveExternalAPIRealmRow, player database.GetExternalAPICharacterRow) Character {
	var guildInfo *Guild
	if player.GuildID.Valid {
		guildInfo = &Guild{ID: player.GuildID.UUID, Name: player.GuildName}
	}
	var updatedFrom *uuid.UUID
	if player.UpdatedFromInstance.Valid {
		updatedFrom = &player.UpdatedFromInstance.UUID
	}
	var avgIlvl *int32
	if player.AvgIlvl > 0 {
		value := int32(player.AvgIlvl)
		avgIlvl = &value
	}
	return Character{
		GUID: player.ID, Name: player.Name,
		Class: db2sdk.HeroClass(player.Class).String(), Race: db2sdk.HeroRace(player.Race).String(),
		Gender: db2sdk.HeroGender(player.Gender).String(), Level: int32(player.Level),
		Spec: player.PlayerSpec, Role: player.PlayerRole, AverageItemLevel: avgIlvl,
		Guild:     guildInfo,
		Server:    Server{ID: realm.ServerID, Name: realm.ServerName, Description: realm.ServerDescription, URL: realm.ServerUrl.String},
		Realm:     Realm{ID: realm.ID, ServerID: realm.ServerID, Name: realm.Name, Description: realm.Description, URL: realm.Url.String},
		UpdatedAt: player.UpdatedAt.Time, UpdatedFromInstance: updatedFrom,
	}
}

func characterLogFromRow(row database.ListExternalAPICharacterLogsRow) (CharacterLog, error) {
	var guildInfo *Guild
	if row.GuildID.Valid {
		guildInfo = &Guild{ID: row.GuildID.UUID, Name: row.GuildName}
	}

	var performance []CharacterEncounterPerformance
	if err := json.Unmarshal([]byte(row.PerformanceJson), &performance); err != nil {
		return CharacterLog{}, err
	}
	if len(performance) == 0 {
		performance = nil
	}

	return CharacterLog{
		ID: row.ID, Slug: row.HashedSlug.String, Name: row.Name, Guild: guildInfo,
		Difficulty: row.DifficultyName, MaxPlayers: row.MaxPlayers, BossKills: row.BossKills,
		StartedAt: row.StartedAt.Time, EndedAt: row.EndedAt.Time, UploadedAt: row.UploadedAt.Time,
		Performance: performance,
	}, nil
}

func serverFromRow(row database.ResolveExternalAPIServerRow) Server {
	return Server{ID: row.ID, Name: row.Name, Description: row.Description, URL: row.Url.String}
}

func parseCharacterGUID(value string) guid.GUID {
	if parsed, err := guid.FromString(value); err == nil {
		return parsed
	}
	if parsed, err := strconv.ParseUint(value, 10, 32); err == nil {
		return guid.GUID(parsed)
	}
	return 0
}

func queryInt(r *http.Request, name string, fallback int32) int32 {
	value := r.URL.Query().Get(name)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseInt(value, 10, 32)
	if err != nil {
		return 0
	}
	return int32(parsed)
}

func writeNotFound(w http.ResponseWriter, r *http.Request, message string) {
	httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: message})
}
