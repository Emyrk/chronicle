package api

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
)

// SiteStats returns aggregate public statistics for the homepage.
// The response is cacheable for 30 minutes.
//
//	@Summary	Site-wide statistics
//	@Tags		Stats
//	@Produce	json
//	@Success	200	{object}	chroniclesdk.SiteStats
//	@Router		/stats [get]
func (api *API) SiteStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	row, err := api.Opts.Zed.SiteStats(ctx)
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch site statistics",
				Detail:  err.Error(),
			},
		})
		return
	}

	w.Header().Set("Cache-Control", "public, max-age=1800")
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.SiteStats{
		LogsParsed:     row.LogsParsed,
		PlayersTracked: row.PlayersTracked,
		Guilds:         row.GuildCount,
		BossKills:      row.BossKills,
	})
}
