package api

import (
	"net/http"
	"strconv"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
	"github.com/Emyrk/chronicle/database"
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
