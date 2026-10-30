package api

import (
	"net/http"
	"strconv"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicerankings"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
	"github.com/google/uuid"
)

// GuildRaidClears returns per-instance clear counts and duration aggregates
// for a guild. Used by the guild page "Raid Clears" panel.
//
//	GET /api/v1/guilds/{guildID}/speedruns/clears?since_days=90
func (api *API) GuildRaidClears(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	var sinceDays int64
	if v := r.URL.Query().Get("since_days"); v != "" {
		sinceDays, _ = strconv.ParseInt(v, 10, 64)
	}

	rows, err := api.Opts.Zed.GuildRaidClears(ctx, database.GuildRaidClearsParams{
		GuildID:   guild.ID,
		SinceDays: sinceDays,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch guild raid clears",
				Detail:  err.Error(),
			},
		})
		return
	}

	clears := make([]chroniclesdk.GuildRaidClear, len(rows))
	for i, row := range rows {
		clears[i] = chroniclesdk.GuildRaidClear{
			InstanceName:   row.InstanceName,
			ClearCount:     row.ClearCount,
			BestDurationMs: row.BestDurationMs,
			AvgDurationMs:  row.AvgDurationMs,
			LastClearedAt:  row.LastClearedAt.Time,
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildRaidClearsResponse{
		Clears: clears,
	})
}

// maxGuildSpeedrunHistoryDays caps the guild history window so one request
// stays bounded for guilds that clear several times a week.
const maxGuildSpeedrunHistoryDays = 365

// GuildSpeedrunHistory returns every clear of one instance by a guild, with
// per-boss kill times and trash time, for the guild history page.
//
//	GET /api/v1/guilds/{guildID}/speedruns/history?instance_name=Molten+Core&since_days=180
func (api *API) GuildSpeedrunHistory(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	instanceName := r.URL.Query().Get("instance_name")
	if instanceName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "instance_name query parameter is required",
		})
		return
	}

	sinceDays := int64(180)
	if v := r.URL.Query().Get("since_days"); v != "" {
		parsed, err := strconv.ParseInt(v, 10, 64)
		if err != nil || parsed <= 0 {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
				Message: "since_days must be a positive number",
			})
			return
		}
		sinceDays = min(parsed, maxGuildSpeedrunHistoryDays)
	}

	tenantID := servicetenant.TenantIDFromContext(ctx)
	rows, err := api.Opts.Zed.GuildSpeedrunHistory(ctx, database.GuildSpeedrunHistoryParams{
		TenantID:      tenantID,
		LookbackDays:  servicerankings.TimeParseScoreLookbackDays,
		PolicyVersion: int16(timeparsepolicy.PolicyVersion),
		QueryVersion:  timeparsepolicy.QueryVersion,
		GuildID:       guild.ID,
		InstanceName:  instanceName,
		SinceDays:     sinceDays,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch guild speedrun history",
				Detail:  err.Error(),
			},
		})
		return
	}

	instanceIDs := make([]uuid.UUID, len(rows))
	for i, row := range rows {
		instanceIDs[i] = row.InstanceID
	}
	kills, err := api.Opts.Zed.GuildSpeedrunBossKills(ctx, database.GuildSpeedrunBossKillsParams{
		TenantID:      tenantID,
		LookbackDays:  servicerankings.TimeParseScoreLookbackDays,
		PolicyVersion: int16(timeparsepolicy.PolicyVersion),
		QueryVersion:  timeparsepolicy.QueryVersion,
		InstanceIds:   instanceIDs,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch guild boss kills",
				Detail:  err.Error(),
			},
		})
		return
	}
	bossesByInstance := make(map[uuid.UUID][]chroniclesdk.GuildSpeedrunBossKill, len(rows))
	for _, kill := range kills {
		bossesByInstance[kill.InstanceID] = append(bossesByInstance[kill.InstanceID], chroniclesdk.GuildSpeedrunBossKill{
			EncounterName: kill.EncounterName,
			KilledAt:      kill.KilledAt.Time,
			DurationMs:    kill.DurationMs,
			Parse:         storedParse(kill.Parse),
		})
	}

	runs := make([]chroniclesdk.GuildSpeedrunRun, len(rows))
	for i, row := range rows {
		bosses := bossesByInstance[row.InstanceID]
		if bosses == nil {
			bosses = []chroniclesdk.GuildSpeedrunBossKill{}
		}
		runs[i] = chroniclesdk.GuildSpeedrunRun{
			Slug:                 row.Slug,
			Qualified:            row.Qualified,
			PlayerCount:          row.PlayerCount,
			StartTime:            row.StartTime.Time,
			CompletionTime:       row.CompletionTime.Time,
			DurationMs:           row.DurationMs,
			BossToBossDurationMs: row.BossToBossDurationMs,
			TrashDurationMs:      row.TrashDurationMs,
			ClearParse:           storedParse(row.ClearParse),
			Bosses:               bosses,
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildSpeedrunHistoryResponse{
		Runs: runs,
	})
}

// storedParse turns the queries' -1 "no parse" sentinel into nil.
func storedParse(parse float64) *float64 {
	if parse < 0 {
		return nil
	}
	return &parse
}
