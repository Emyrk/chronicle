package api

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
)

// GuildEncounterKills returns the guild's per-encounter boss kill counts.
// Used by the guild page "Progression" panel.
//
//	GET /api/v1/guilds/{guildID}/encounters
func (api *API) GuildEncounterKills(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	guild := httpmw.Guild(ctx)

	rows, err := api.Opts.Zed.GuildEncounterKills(ctx, guild.ID)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch guild encounter kills",
				Detail:  err.Error(),
			},
		})
		return
	}

	encounters := make([]chroniclesdk.GuildEncounterKill, len(rows))
	for i, row := range rows {
		encounters[i] = chroniclesdk.GuildEncounterKill{
			InstanceName:   row.InstanceName,
			EncounterName:  row.EncounterName,
			DifficultyName: row.DifficultyName,
			MaxPlayers:     row.MaxPlayers,
			Kills:          row.Kills,
			FirstKilledAt:  row.FirstKilledAt.Time,
			LastKilledAt:   row.LastKilledAt.Time,
		}
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.GuildEncounterKillsResponse{
		Encounters: encounters,
	})
}
