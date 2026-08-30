package serviceexternalapi

import (
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type RecentActivity struct {
	ID              uuid.UUID `json:"id"`
	Slug            string    `json:"slug"`
	Name            string    `json:"name"`
	Realm           Realm     `json:"realm"`
	Guild           *Guild    `json:"guild,omitempty"`
	UploadedAt      time.Time `json:"uploaded_at"`
	StartedAt       time.Time `json:"started_at"`
	EndedAt         time.Time `json:"ended_at"`
	PlayerCount     int64     `json:"player_count"`
	BossCount       int64     `json:"boss_count"`
	BossKills       int64     `json:"boss_kills"`
	HasYoutubeVideo bool      `json:"has_youtube_video"`
	Difficulty      string    `json:"difficulty,omitempty"`
	MaxPlayers      int32     `json:"max_players,omitempty"`
	RecorderName    string    `json:"recorder_name,omitempty"`
}

type RecentActivityResponse struct {
	Activities []RecentActivity `json:"activities"`
	Pagination Pagination       `json:"pagination"`
}

func (s *Service) listRecentActivity(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	query := r.URL.Query()

	page := queryInt(r, "page", 1)
	pageSize := queryInt(r, "page_size", 25)
	if page < 1 || pageSize < 1 || pageSize > maxRecentPageSize {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "page must be at least 1 and page_size must be between 1 and 50",
		})
		return
	}

	var afterDate pgtype.Timestamptz
	if value := query.Get("after_date"); value != "" {
		parsed, err := time.Parse(time.RFC3339, value)
		if err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "after_date must be an RFC3339 timestamp",
			})
			return
		}
		afterDate = pgtype.Timestamptz{Time: parsed, Valid: true}
	}

	realmID, ok := optionalUUIDQuery(w, r, "realm_id")
	if !ok {
		return
	}
	guildID, ok := optionalUUIDQuery(w, r, "guild_id")
	if !ok {
		return
	}

	hasVideo := query.Get("has_video")
	if hasVideo != "" && hasVideo != "true" && hasVideo != "false" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "has_video must be true or false",
		})
		return
	}

	rows, err := s.db.ListExternalAPIRecentInstances(ctx, database.ListExternalAPIRecentInstancesParams{
		AfterDate:     afterDate,
		InstanceNames: query["instance_name"],
		RealmID:       realmID,
		GuildID:       guildID,
		HasVideo:      hasVideo,
		ResultOffset:  (page - 1) * pageSize,
		ResultLimit:   pageSize + 1,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	hasMore := len(rows) > int(pageSize)
	if hasMore {
		rows = rows[:pageSize]
	}
	activities := make([]RecentActivity, 0, len(rows))
	for _, row := range rows {
		var guild *Guild
		if row.GuildID.Valid {
			guild = &Guild{ID: row.GuildID.UUID, Name: row.GuildName}
		}
		activities = append(activities, RecentActivity{
			ID: row.ID, Slug: row.HashedSlug.String, Name: row.Name,
			Realm: Realm{ID: row.RealmID, Name: row.RealmName}, Guild: guild,
			UploadedAt: row.UploadedAt.Time, StartedAt: row.StartedAt.Time, EndedAt: row.EndedAt.Time,
			PlayerCount: row.PlayerCount, BossCount: row.BossCount, BossKills: row.BossKills,
			HasYoutubeVideo: row.HasYoutubeVideo, Difficulty: row.DifficultyName,
			MaxPlayers: row.MaxPlayers, RecorderName: row.RecorderName,
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, RecentActivityResponse{
		Activities: activities,
		Pagination: Pagination{Page: page, PageSize: pageSize, HasMore: hasMore},
	})
}

func optionalUUIDQuery(w http.ResponseWriter, r *http.Request, name string) (uuid.UUID, bool) {
	value := r.URL.Query().Get(name)
	if value == "" {
		return uuid.Nil, true
	}
	parsed, err := uuid.Parse(value)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{
			Message: name + " must be a UUID",
		})
		return uuid.Nil, false
	}
	return parsed, true
}
