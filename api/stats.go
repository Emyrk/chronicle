package api

import (
	"context"
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

	w.Header().Set("Cache-Control", "public, max-age=1800")

	err := api.siteStats.Serve(w, r, func(ctx context.Context) (any, error) {
		row, err := api.Opts.Zed.SiteStats(ctx)
		if err != nil {
			return nil, err
		}
		return chroniclesdk.SiteStats{
			LogsParsed:     row.LogsParsed,
			PlayersTracked: row.PlayersTracked,
			Guilds:         row.GuildCount,
			BossKills:      row.BossKills,
		}, nil
	})
	if err != nil {
		httpapi.HandleResponseError(ctx, w, err, httpapi.APIError{
			Response: chroniclesdk.Response{
				Message: "Failed to fetch site statistics",
				Detail:  err.Error(),
			},
		})
	}
}
