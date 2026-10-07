package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
)

// AdminListActiveCustomPanels returns custom-panel installations that are enabled
// both for the account and for the individual installation.
// @Summary List active custom panel installations
// @Tags Admin
// @Success 200 {object} chroniclesdk.AdminActiveCustomPanelsResponse
// @Router /api/v1/admin/custom-panels [get]
func (a *API) AdminListActiveCustomPanels(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, err := a.Opts.Zed.ListAdminActiveCustomPanelInstallations(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	installations := make([]chroniclesdk.AdminActiveCustomPanelInstallation, 0, len(rows))
	for _, row := range rows {
		var manifest chroniclesdk.CustomPanelManifest
		if err := json.Unmarshal(row.Manifest, &manifest); err != nil {
			httpapi.InternalServerError(w, err)
			return
		}

		panelNames := make([]string, 0, len(manifest.Panels))
		for _, panel := range manifest.Panels {
			panelNames = append(panelNames, panel.Name)
		}

		installations = append(installations, chroniclesdk.AdminActiveCustomPanelInstallation{
			UserID:        row.UserID.String(),
			Username:      row.Username,
			Repository:    row.Repository,
			CommitSHA:     row.CommitSha,
			InstalledRef:  row.InstalledRef,
			PluginName:    manifest.Plugin.Name,
			PluginVersion: manifest.Plugin.Version,
			PanelNames:    panelNames,
			InstalledAt:   row.InstalledAt.Time.Format(time.RFC3339Nano),
			UpdatedAt:     row.UpdatedAt.Time.Format(time.RFC3339Nano),
		})
	}

	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.AdminActiveCustomPanelsResponse{
		Installations: installations,
	})
}
