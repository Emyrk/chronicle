package api

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	defaultRecentLimit = 20
	maxRecentLimit     = 100
)

// paginationCursor encodes the pagination state.
type paginationCursor struct {
	Time time.Time `json:"t"`
	ID   uuid.UUID `json:"i"`
}

func encodeCursor(t time.Time, id uuid.UUID) string {
	cursor := paginationCursor{Time: t, ID: id}
	data, _ := json.Marshal(cursor)
	return base64.URLEncoding.EncodeToString(data)
}

func decodeCursor(s string) (time.Time, uuid.UUID, error) {
	if s == "" {
		// Default values that will be ignored by the query's CASE WHEN
		return time.Date(1, 1, 1, 0, 0, 0, 0, time.UTC), uuid.Nil, nil
	}
	data, err := base64.URLEncoding.DecodeString(s)
	if err != nil {
		return time.Time{}, uuid.Nil, err
	}
	var cursor paginationCursor
	if err := json.Unmarshal(data, &cursor); err != nil {
		return time.Time{}, uuid.Nil, err
	}
	return cursor.Time, cursor.ID, nil
}

// RecentInstances returns a paginated list of recent raid/dungeon instances.
// @Summary List recent raid/dungeon instances
// @Tags raidlogs
// @Produce json
// @Param limit query int false "Max items (default 20, max 100)"
// @Param cursor query string false "Pagination cursor"
// @Param instance_name query []string false "Filter by instance names (repeat param, e.g., instance_name=Molten+Core&instance_name=Onyxia's+Lair)"
// @Param has_video query string false "Filter by video presence (true, false)"
// @Param realm_id query string false "Filter by realm UUID"
// @Param player_name query string false "Filter by player name (partial match)"
// @Success 200 {object} chroniclesdk.RecentInstancesResponse
// @Router /api/v1/raidlogs/recent [get]
func (api *API) RecentInstances(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	cacheKey := r.URL.RawQuery
	if api.recentCache != nil {
		if cached, ok := api.recentCache.Get(cacheKey); ok {
			httpapi.Write(ctx, w, http.StatusOK, cached)
			return
		}
	}

	// Parse query parameters
	q := r.URL.Query()

	limit := defaultRecentLimit
	if l := q.Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if limit > maxRecentLimit {
		limit = maxRecentLimit
	}

	cursorTime, cursorID, err := decodeCursor(q.Get("cursor"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid cursor",
			Detail:  err.Error(),
		})
		return
	}

	instanceNames := q["instance_name"]
	hasVideo := q.Get("has_video")
	if hasVideo != "true" && hasVideo != "false" {
		hasVideo = ""
	}

	playerName := q.Get("player_name")

	var realmID uuid.UUID
	if rid := q.Get("realm_id"); rid != "" {
		if parsed, err := uuid.Parse(rid); err == nil {
			realmID = parsed
		}
	}

	// Fetch limit+1 to detect if there are more results
	fetchLimit := int32(limit + 1)

	var rows []database.ListRecentInstancesRow
	if playerName != "" {
		// Use the player search query
		playerRows, err := api.Opts.Zed.ListRecentInstancesByPlayer(ctx, database.ListRecentInstancesByPlayerParams{
			PlayerName:    "%" + playerName + "%",
			InstanceNames: instanceNames,
			HasVideo:      hasVideo,
			RealmID:       realmID,
			CursorTime:    pgtype.Timestamptz{Time: cursorTime, Valid: !cursorTime.IsZero()},
			CursorID:      cursorID,
			LimitCount:    fetchLimit,
		})
		if err != nil {
			httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
				Response: chroniclesdk.Response{
					Message: "Failed to fetch recent instances",
					Detail:  err.Error(),
				},
				Status:  http.StatusInternalServerError,
				Wrapped: err,
			})
			return
		}
		// Convert to the common row type
		for _, pr := range playerRows {
			rows = append(rows, database.ListRecentInstancesRow(pr))
		}
	} else {
		rows, err = api.Opts.Zed.ListRecentInstances(ctx, database.ListRecentInstancesParams{
			InstanceNames: instanceNames,
			HasVideo:      hasVideo,
			RealmID:       realmID,
			CursorTime:    pgtype.Timestamptz{Time: cursorTime, Valid: !cursorTime.IsZero()},
			CursorID:      cursorID,
			LimitCount:    fetchLimit,
		})
		if err != nil {
			httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
				Response: chroniclesdk.Response{
					Message: "Failed to fetch recent instances",
					Detail:  err.Error(),
				},
				Status:  http.StatusInternalServerError,
				Wrapped: err,
			})
			return
		}
	}

	// Determine if there are more results
	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}

	// Build response
	instances := make([]chroniclesdk.RecentInstance, 0, len(rows))
	for _, row := range rows {
		inst := chroniclesdk.RecentInstance{
			ID:                 row.ID,
			Slug:               row.Slug.String,
			Name:               row.Name,
			RealmID:            row.RealmID,
			RealmName:          row.RealmName,
			UploaderID:         row.UploaderID,
			UploaderName:       row.UploaderName,
			UploadedAt:         row.UploadedAt.Time,
			FirstEncounterTime: row.FirstEncounterTime.Time,
			PlayerCount:        row.PlayerCount,
			BossCount:          row.BossCount,
			BossKills:          row.BossKills,
			HasYoutubeVideo:    row.HasYoutubeVideo,
		}
		if row.DurationMs != 0 {
			d := row.DurationMs
			inst.DurationMs = &d
		}
		if row.GuildID.Valid {
			inst.GuildID = &row.GuildID.UUID
		}
		if row.GuildName.Valid {
			inst.GuildName = &row.GuildName.String
		}

		// Fetch encounter summaries for this instance
		encounters, err := api.Opts.Zed.GetEncounterSummariesByInstanceID(ctx, row.ID)
		if err == nil {
			inst.Encounters = make([]chroniclesdk.RecentEncounter, 0, len(encounters))
			for _, enc := range encounters {
				inst.Encounters = append(inst.Encounters, chroniclesdk.RecentEncounter{
					Name:     enc.Name,
					Boss:     enc.Boss,
					KillType: chroniclesdk.KillType(enc.KillType),
				})
			}
		}

		instances = append(instances, inst)
	}

	// Build next cursor
	var nextCursor string
	if hasMore && len(rows) > 0 {
		lastRow := rows[len(rows)-1]
		nextCursor = encodeCursor(lastRow.FirstEncounterTime.Time, lastRow.ID)
	}

	response := chroniclesdk.RecentInstancesResponse{
		Instances:  instances,
		NextCursor: nextCursor,
		HasMore:    hasMore,
	}
	if api.recentCache != nil {
		api.recentCache.Set(cacheKey, response)
	}

	httpapi.Write(ctx, w, http.StatusOK, response)
}
