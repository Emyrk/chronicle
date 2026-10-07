package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/custompanelapi"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const maxCustomPanelInstallations = 32

var errCustomPanelReleaseMismatch = errors.New("custom panel release metadata does not match the existing immutable release")

type customPanelSettingsStore interface {
	GetUserCustomPanelSettings(context.Context, uuid.UUID) (database.UserCustomPanelSetting, error)
	ListUserCustomPanelInstallations(context.Context, uuid.UUID) ([]database.ListUserCustomPanelInstallationsRow, error)
}

func (a *API) GetMyCustomPanelSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	settings, err := a.Opts.Zed.GetUserCustomPanelSettings(ctx, claims.Subject)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.CustomPanelSettings{Installations: []chroniclesdk.CustomPanelInstallation{}})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	response, err := customPanelSettingsResponse(ctx, a.Opts.Zed, settings)
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

	repositories := make([]string, 0, len(req.Installations))
	seen := make(map[string]struct{}, len(req.Installations))
	for _, installation := range req.Installations {
		if _, exists := seen[installation.Repository]; exists {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Custom panel repositories must be unique."})
			return
		}
		seen[installation.Repository] = struct{}{}
		repositories = append(repositories, installation.Repository)
		if err := custompanelapi.ValidateStoredInstallation(installation); err != nil {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid custom panel installation.", Detail: err.Error()})
			return
		}
	}

	var settings database.UserCustomPanelSetting
	err := a.Opts.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		var err error
		settings, err = tx.UpsertUserCustomPanelSettings(ctx, database.UpsertUserCustomPanelSettingsParams{
			UserID: claims.Subject, Enabled: req.Enabled, ExpectedRevision: req.ExpectedRevision,
		})
		if err != nil {
			return err
		}
		for _, installation := range req.Installations {
			manifest, err := json.Marshal(installation.Manifest)
			if err != nil {
				return err
			}
			release, err := tx.InsertCustomPanelRelease(ctx, database.InsertCustomPanelReleaseParams{
				Repository: installation.Repository, CommitSha: installation.CommitSHA,
				Manifest: manifest, ManifestSha256: installation.ManifestSHA256,
			})
			if err != nil {
				return err
			}
			if release.ManifestSha256 != installation.ManifestSHA256 || !jsonBytesEqual(release.Manifest, manifest) {
				return errCustomPanelReleaseMismatch
			}
			if _, err := tx.UpsertUserCustomPanelInstallation(ctx, database.UpsertUserCustomPanelInstallationParams{
				UserID: claims.Subject, Repository: installation.Repository, ReleaseID: release.ID,
				InstalledRef: installation.InstalledRef, Enabled: installation.Enabled,
			}); err != nil {
				return err
			}
		}
		return tx.DeleteUserCustomPanelInstallationsExcept(ctx, database.DeleteUserCustomPanelInstallationsExceptParams{
			UserID: claims.Subject, Repositories: repositories,
		})
	}, nil)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{Message: "Custom panel settings changed in another session. Reload and try again."})
		return
	}
	if errors.Is(err, errCustomPanelReleaseMismatch) {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Custom panel release does not match the existing immutable release."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	response, err := customPanelSettingsResponse(ctx, a.Opts.Zed, settings)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, response)
}

func customPanelSettingsResponse(ctx context.Context, store customPanelSettingsStore, settings database.UserCustomPanelSetting) (chroniclesdk.CustomPanelSettings, error) {
	rows, err := store.ListUserCustomPanelInstallations(ctx, settings.UserID)
	if err != nil {
		return chroniclesdk.CustomPanelSettings{}, err
	}
	installations := make([]chroniclesdk.CustomPanelInstallation, 0, len(rows))
	for _, row := range rows {
		var manifest chroniclesdk.CustomPanelManifest
		if err := json.Unmarshal(row.CustomPanelRelease.Manifest, &manifest); err != nil {
			return chroniclesdk.CustomPanelSettings{}, err
		}
		installation := row.UserCustomPanelInstallation
		release := row.CustomPanelRelease
		installations = append(installations, chroniclesdk.CustomPanelInstallation{
			Repository: release.Repository, CommitSHA: release.CommitSha, InstalledRef: installation.InstalledRef,
			Manifest: manifest, ManifestSHA256: release.ManifestSha256,
			Artifacts:   custompanelapi.ArtifactSet(release.Repository, release.CommitSha, manifest.Artifacts),
			Enabled:     installation.Enabled,
			InstalledAt: installation.InstalledAt.Time.Format("2006-01-02T15:04:05.999999999Z07:00"),
			UpdatedAt:   installation.UpdatedAt.Time.Format("2006-01-02T15:04:05.999999999Z07:00"),
		})
	}
	response := chroniclesdk.CustomPanelSettings{Enabled: settings.Enabled, Installations: installations, Revision: settings.Revision}
	if settings.UpdatedAt.Valid {
		response.UpdatedAt = settings.UpdatedAt.Time.Format("2006-01-02T15:04:05.999999999Z07:00")
	}
	return response, nil
}

func jsonBytesEqual(left, right []byte) bool {
	var leftValue, rightValue any
	if json.Unmarshal(left, &leftValue) != nil || json.Unmarshal(right, &rightValue) != nil {
		return bytes.Equal(left, right)
	}
	return bytes.Equal(mustJSON(leftValue), mustJSON(rightValue))
}

func mustJSON(value any) []byte {
	encoded, _ := json.Marshal(value)
	return encoded
}
