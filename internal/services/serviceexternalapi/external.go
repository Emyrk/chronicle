package serviceexternalapi

import (
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

const maxCharacterLogsPageSize = 20

type Server struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	URL         string    `json:"url,omitempty"`
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

type CharacterPerformance struct {
	Spec             string   `json:"spec,omitempty"`
	Role             string   `json:"role,omitempty"`
	AverageItemLevel *int32   `json:"average_item_level,omitempty"`
	BestDPS          *float64 `json:"best_dps,omitempty"`
	BestHPS          *float64 `json:"best_hps,omitempty"`
	BestDPSParse     *int32   `json:"best_dps_parse,omitempty"`
	BestHPSParse     *int32   `json:"best_hps_parse,omitempty"`
}

type CharacterLog struct {
	ID          uuid.UUID             `json:"id"`
	Slug        string                `json:"slug,omitempty"`
	Name        string                `json:"name"`
	Guild       *Guild                `json:"guild,omitempty"`
	Difficulty  string                `json:"difficulty,omitempty"`
	MaxPlayers  int32                 `json:"max_players,omitempty"`
	BossKills   int32                 `json:"boss_kills"`
	StartedAt   time.Time             `json:"started_at"`
	EndedAt     time.Time             `json:"ended_at"`
	UploadedAt  time.Time             `json:"uploaded_at"`
	Performance *CharacterPerformance `json:"performance,omitempty"`
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

func (s *Service) listServers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.ListExternalAPIServers(r.Context())
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	servers := make([]Server, 0, len(rows))
	for _, row := range rows {
		servers = append(servers, Server{
			ID: row.ID, Name: row.Name, Description: row.Description, URL: row.Url.String,
		})
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
			Message: "page must be at least 1 and page_size must be between 1 and 20",
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
		logs = append(logs, characterLogFromRow(row))
	}
	httpapi.Write(r.Context(), w, http.StatusOK, CharacterLogsResponse{
		Character:  character,
		Logs:       logs,
		Pagination: Pagination{Page: page, PageSize: pageSize, HasMore: hasMore},
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

func characterLogFromRow(row database.ListExternalAPICharacterLogsRow) CharacterLog {
	var guildInfo *Guild
	if row.GuildID.Valid {
		guildInfo = &Guild{ID: row.GuildID.UUID, Name: row.GuildName}
	}
	performance := CharacterPerformance{Spec: row.PlayerSpec, Role: row.PlayerRole}
	if row.AvgIlvl > 0 {
		value := int32(row.AvgIlvl)
		performance.AverageItemLevel = &value
	}
	if row.BestDps > 0 {
		value := row.BestDps
		performance.BestDPS = &value
	}
	if row.BestHps > 0 {
		value := row.BestHps
		performance.BestHPS = &value
	}
	if row.BestDpsParse > 0 {
		value := int32(row.BestDpsParse)
		performance.BestDPSParse = &value
	}
	if row.BestHpsParse > 0 {
		value := int32(row.BestHpsParse)
		performance.BestHPSParse = &value
	}
	var performanceInfo *CharacterPerformance
	if performance.Spec != "" || performance.Role != "" || performance.AverageItemLevel != nil || performance.BestDPS != nil || performance.BestHPS != nil || performance.BestDPSParse != nil || performance.BestHPSParse != nil {
		performanceInfo = &performance
	}
	return CharacterLog{
		ID: row.ID, Slug: row.HashedSlug.String, Name: row.Name, Guild: guildInfo,
		Difficulty: row.DifficultyName, MaxPlayers: row.MaxPlayers, BossKills: row.BossKills,
		StartedAt: row.StartedAt.Time, EndedAt: row.EndedAt.Time, UploadedAt: row.UploadedAt.Time,
		Performance: performanceInfo,
	}
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
