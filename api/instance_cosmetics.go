package api

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/api/httpmw"
)

func (api *API) InstanceCosmetics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	instance := httpmw.Instance(ctx)

	rows, err := api.Opts.Zed.GetInstancePlayerCosmetics(ctx, instance.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	players := make(map[chroniclesdk.GUIDString]chroniclesdk.CosmeticSelection, len(rows))
	for _, row := range rows {
		players[row.UnitGuid] = chroniclesdk.CosmeticSelection{
			NameID:       row.ActiveNameID,
			BackgroundID: row.ActiveBackgroundID,
			BorderID:     row.ActiveBorderID,
		}
	}

	// Cosmetics can change independently of immutable combat-log data. Keep the
	// network response fresh and let the frontend's instance-scoped query cache
	// provide the short-lived reuse needed across panels.
	w.Header().Set("Cache-Control", "no-store")
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.InstanceCosmeticsResponse{
		Players: players,
	})
}
