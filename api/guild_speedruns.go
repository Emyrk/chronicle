package api

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
)

// GuildRaidClears returns per-instance clear counts and duration aggregates
// for a guild. Used by the guild page "Raid Clears" panel.
//
//	GET /api/v1/guilds/{guildID}/speedruns/clears
func (api *API) GuildRaidClears(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	rows, err := api.Opts.Zed.GuildRaidClears(ctx, guild.ID)
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

// GuildClearTimes returns a guild's individual clears for one instance,
// newest first. Used by the guild page "Clear Times" panel.
//
//	GET /api/v1/guilds/{guildID}/speedruns/times?instance_name=Molten+Core
func (api *API) GuildClearTimes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	instanceName := r.URL.Query().Get("instance_name")
	if instanceName == "" {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "instance_name query parameter is required",
		})
		return
	}

	rows, err := api.Opts.Zed.GuildClearTimes(ctx, database.GuildClearTimesParams{
		GuildID:      guild.ID,
		InstanceName: instanceName,
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch guild clear times",
				Detail:  err.Error(),
			},
		})
		return
	}

	resp := chroniclesdk.GuildClearTimesResponse{
		InstanceName: instanceName,
		Times:        make([]chroniclesdk.GuildClearTime, len(rows)),
	}
	var totalMs int64
	for i, row := range rows {
		resp.Times[i] = chroniclesdk.GuildClearTime{
			InstanceID:     row.InstanceID,
			Slug:           row.HashedSlug.String,
			InstanceName:   row.InstanceName,
			DifficultyName: row.DifficultyName,
			DurationMs:     row.DurationMs,
			StartTime:      row.StartTime.Time,
			CompletionTime: row.CompletionTime.Time,
			Qualified:      row.Qualified,
		}
		totalMs += row.DurationMs
		if resp.BestDurationMs == 0 || row.DurationMs < resp.BestDurationMs {
			resp.BestDurationMs = row.DurationMs
		}
	}
	if len(rows) > 0 {
		resp.AvgDurationMs = totalMs / int64(len(rows))
	}

	httpapi.Write(ctx, w, http.StatusOK, resp)
}
