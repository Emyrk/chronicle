package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// RecentInstances returns instances from the last 2 weeks.
// It delegates to InstancesByTimeRange with a preset time window.
// @Summary List recent raid/dungeon instances (last 2 weeks)
// @Tags raidlogs
// @Produce json
// @Param instance_name query []string false "Filter by instance names"
// @Param has_video query string false "Filter by video presence (true, false)"
// @Param realm_id query string false "Filter by realm UUID"
// @Param guild_id query string false "Filter by guild UUID"
// @Success 200 {object} chroniclesdk.RecentInstancesResponse
// @Router /api/v1/raidlogs/recent [get]
func (api *API) RecentInstances(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if q.Get("start") == "" {
		q.Set("start", time.Now().AddDate(0, 0, -365).UTC().Format(time.RFC3339))
	}
	if q.Get("end") == "" {
		q.Set("end", time.Now().Add(24*time.Hour).UTC().Format(time.RFC3339))
	}
	if q.Get("limit") == "" {
		q.Set("limit", "25")
	}
	r.URL.RawQuery = q.Encode()
	api.InstancesByTimeRange(w, r)
}

// InstancesByTimeRange returns instances within a given time range.
// @Summary List instances within a time range
// @Tags raidlogs
// @Produce json
// @Param start query string true "Start time (RFC3339)"
// @Param end query string true "End time (RFC3339)"
// @Param instance_name query []string false "Filter by instance names"
// @Param has_video query string false "Filter by video presence (true, false)"
// @Param realm_id query string false "Filter by realm UUID"
// @Param guild_id query string false "Filter by guild UUID"
// @Param limit query int false "Max items (0 = no limit)"
// @Param offset query int false "Number of items to skip (default 0)"
// @Success 200 {object} chroniclesdk.RecentInstancesResponse
// @Router /api/v1/raidlogs/range [get]
func (api *API) InstancesByTimeRange(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	q := r.URL.Query()

	startTime, err := time.Parse(time.RFC3339, q.Get("start"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid or missing 'start' parameter",
			Detail:  "Expected RFC3339 format, e.g. 2025-01-01T00:00:00Z",
		})
		return
	}

	endTime, err := time.Parse(time.RFC3339, q.Get("end"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "Invalid or missing 'end' parameter",
			Detail:  "Expected RFC3339 format, e.g. 2025-02-01T00:00:00Z",
		})
		return
	}

	instanceNames := q["instance_name"]
	hasVideo := q.Get("has_video")
	if hasVideo != "true" && hasVideo != "false" {
		hasVideo = ""
	}

	var realmID uuid.UUID
	if rid := q.Get("realm_id"); rid != "" {
		if parsed, err := uuid.Parse(rid); err == nil {
			realmID = parsed
		}
	}

	var guildID uuid.UUID
	if gid := q.Get("guild_id"); gid != "" {
		if parsed, err := uuid.Parse(gid); err == nil {
			guildID = parsed
		}
	}

	var playerGUID guid.GUID
	if pg := q.Get("player_guid"); pg != "" {
		if g, parseErr := guid.FromString(pg); parseErr == nil {
			playerGUID = g
		}
	}

	var limitCount int32
	if l := q.Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limitCount = int32(parsed)
		}
	}

	var offsetCount int32
	if o := q.Get("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed > 0 {
			offsetCount = int32(parsed)
		}
	}

	rows, err := api.Opts.Zed.ListInstancesByTimeRange(ctx, database.ListInstancesByTimeRangeParams{
		StartTime:     pgtype.Timestamptz{Time: startTime, Valid: true},
		EndTime:       pgtype.Timestamptz{Time: endTime, Valid: true},
		InstanceNames: instanceNames,
		HasVideo:      hasVideo,
		RealmID:       realmID,
		GuildID:       guildID,
		PlayerGuid:    playerGUID,
		LimitCount:    limitCount,
		OffsetCount:   offsetCount,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch instances",
				Detail:  err.Error(),
			},
			Status:  http.StatusInternalServerError,
			Wrapped: err,
		})
		return
	}

	// Batch fetch encounter summaries
	instanceIDs := make([]uuid.UUID, len(rows))
	for i, row := range rows {
		instanceIDs[i] = row.ID
	}

	encountersByInstance := make(map[uuid.UUID][]chroniclesdk.RecentEncounter)
	if len(instanceIDs) > 0 {
		allEncounters, err := api.Opts.Zed.GetEncounterSummariesByInstanceIDs(ctx, instanceIDs)
		if err == nil {
			for _, enc := range allEncounters {
				encountersByInstance[enc.InstanceID] = append(encountersByInstance[enc.InstanceID], chroniclesdk.RecentEncounter{
					Name:     enc.Name,
					Boss:     enc.Boss,
					KillType: chroniclesdk.KillType(enc.KillType),
				})
			}
		}
	}

	// Build response (reuse RecentInstancesResponse, no pagination needed)
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
			Encounters:         encountersByInstance[row.ID],
			RecorderName:       row.RecorderName,
			DifficultyName:     row.DifficultyName,
			MaxPlayers:         int(row.MaxPlayers),
			DynamicDifficulty:  int(row.DynamicDifficulty),
		}
		if row.DuplicateGroupID.Valid {
			inst.DuplicateGroupID = &row.DuplicateGroupID.UUID
		}
		if row.DurationMs != 0 {
			d := row.DurationMs
			inst.DurationMs = &d
		}
		if row.CombatDurationMs.Valid {
			c := row.CombatDurationMs.Int64
			inst.CombatDurationMs = &c
		}
		if row.GuildID.Valid {
			inst.GuildID = &row.GuildID.UUID
		}
		if row.GuildName.Valid {
			inst.GuildName = &row.GuildName.String
		}
		instances = append(instances, inst)
	}

	response := chroniclesdk.RecentInstancesResponse{
		Instances: instances,
		HasMore:   false,
	}
	httpapi.Write(ctx, w, http.StatusOK, response)
}
