package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/custompanelapi"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5"
)

const maxCustomPanelInstallations = 32

func (a *API) GetMyCustomPanelSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	settings, err := a.Opts.Zed.GetUserCustomPanelSettings(ctx, claims.Subject)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.CustomPanelSettings{
			Installations: []chroniclesdk.CustomPanelInstallation{},
		})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	response, err := customPanelSettingsResponse(settings)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, response)
}

func (a *API) UpdateMyCustomPanelSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	r.Body = http.MaxBytesReader(w, r.Body, 2*1024*1024)
	var req chroniclesdk.UpdateCustomPanelSettingsRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	if req.ExpectedRevision < 0 || len(req.Installations) > maxCustomPanelInstallations {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid custom panel settings."})
		return
	}

	repositories := make(map[string]struct{}, len(req.Installations))
	for _, installation := range req.Installations {
		if _, exists := repositories[installation.Repository]; exists {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Custom panel repositories must be unique."})
			return
		}
		repositories[installation.Repository] = struct{}{}
		if err := custompanelapi.ValidateStoredInstallation(installation); err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid custom panel installation.", Detail: err.Error()})
			return
		}
	}

	installations, err := json.Marshal(req.Installations)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if len(installations) > 1024*1024 {
		httpapi.Write(ctx, w, http.StatusRequestEntityTooLarge, chroniclesdk.Response{Message: "Custom panel settings exceed 1 MiB."})
		return
	}

	settings, err := a.Opts.Zed.UpsertUserCustomPanelSettings(ctx, database.UpsertUserCustomPanelSettingsParams{
		UserID:           claims.Subject,
		Enabled:          req.Enabled,
		Installations:    installations,
		ExpectedRevision: req.ExpectedRevision,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{Message: "Custom panel settings changed in another session. Reload and try again."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	response, err := customPanelSettingsResponse(settings)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, response)
}

func customPanelSettingsResponse(settings database.UserCustomPanelSetting) (chroniclesdk.CustomPanelSettings, error) {
	installations := make([]chroniclesdk.CustomPanelInstallation, 0)
	if err := json.Unmarshal(settings.Installations, &installations); err != nil {
		return chroniclesdk.CustomPanelSettings{}, err
	}
	response := chroniclesdk.CustomPanelSettings{
		Enabled:       settings.Enabled,
		Installations: installations,
		Revision:      settings.Revision,
	}
	if settings.UpdatedAt.Valid {
		response.UpdatedAt = settings.UpdatedAt.Time.Format("2006-01-02T15:04:05.999999999Z07:00")
	}
	return response, nil
}
