package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

type customPanelReleaseStore interface {
	GetCustomPanelReleaseByRepositoryCommit(context.Context, database.GetCustomPanelReleaseByRepositoryCommitParams) (database.CustomPanelRelease, error)
}

type customPanelReleaseResolver interface {
	ResolveRelease(context.Context, string, string) (chroniclesdk.CustomPanelResolveResponse, error)
}

type preparedCustomPanelRelease struct {
	repository     string
	commitSHA      string
	manifest       []byte
	manifestSHA256 string
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

	preparedReleases, err := prepareCustomPanelReleases(ctx, a.Opts.Zed, a.CustomPanels, req.Installations)
	if errors.Is(err, errCustomPanelReleaseMismatch) {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Custom panel release does not match the authoritative manifest."})
		return
	}
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadGateway, chroniclesdk.Response{Message: "Failed to verify the custom panel release.", Detail: err.Error()})
		return
	}

	var settings database.UserCustomPanelSetting
	err = a.Opts.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		var err error
		settings, err = tx.UpsertUserCustomPanelSettings(ctx, database.UpsertUserCustomPanelSettingsParams{
			UserID: claims.Subject, Enabled: req.Enabled, ExpectedRevision: req.ExpectedRevision,
		})
		if err != nil {
			return err
		}
		for i, installation := range req.Installations {
			prepared := preparedReleases[i]
			release, err := tx.GetCustomPanelReleaseByRepositoryCommit(ctx, database.GetCustomPanelReleaseByRepositoryCommitParams{
				Repository: prepared.repository, CommitSha: prepared.commitSHA,
			})
			if errors.Is(err, pgx.ErrNoRows) {
				release, err = tx.InsertCustomPanelRelease(ctx, database.InsertCustomPanelReleaseParams{
					Repository: prepared.repository, CommitSha: prepared.commitSHA,
					Manifest: prepared.manifest, ManifestSha256: prepared.manifestSHA256,
				})
			}
			if err != nil {
				return err
			}
			if !releaseMatchesPrepared(release, prepared) {
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

func prepareCustomPanelReleases(ctx context.Context, store customPanelReleaseStore, resolver customPanelReleaseResolver, installations []chroniclesdk.CustomPanelInstallation) ([]preparedCustomPanelRelease, error) {
	prepared := make([]preparedCustomPanelRelease, 0, len(installations))
	for _, installation := range installations {
		release, err := store.GetCustomPanelReleaseByRepositoryCommit(ctx, database.GetCustomPanelReleaseByRepositoryCommitParams{
			Repository: installation.Repository, CommitSha: installation.CommitSHA,
		})
		if err == nil {
			candidate := preparedCustomPanelRelease{
				repository: release.Repository, commitSHA: release.CommitSha,
				manifest: release.Manifest, manifestSHA256: release.ManifestSha256,
			}
			if !releaseMatchesInstallation(candidate, installation) {
				return nil, errCustomPanelReleaseMismatch
			}
			prepared = append(prepared, candidate)
			continue
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}

		resolved, err := resolver.ResolveRelease(ctx, installation.Repository, installation.CommitSHA)
		if err != nil {
			return nil, fmt.Errorf("resolve %s@%s: %w", installation.Repository, installation.CommitSHA, err)
		}
		manifest, err := json.Marshal(resolved.Manifest)
		if err != nil {
			return nil, err
		}
		candidate := preparedCustomPanelRelease{
			repository: resolved.Repository, commitSHA: resolved.CommitSHA,
			manifest: manifest, manifestSHA256: resolved.ManifestSHA256,
		}
		if !releaseMatchesInstallation(candidate, installation) || !artifactSetsEqual(resolved.Artifacts, installation.Artifacts) {
			return nil, errCustomPanelReleaseMismatch
		}
		prepared = append(prepared, candidate)
	}
	return prepared, nil
}

func releaseMatchesInstallation(release preparedCustomPanelRelease, installation chroniclesdk.CustomPanelInstallation) bool {
	manifest, err := json.Marshal(installation.Manifest)
	return err == nil && release.repository == installation.Repository && release.commitSHA == installation.CommitSHA &&
		release.manifestSHA256 == installation.ManifestSHA256 && jsonBytesEqual(release.manifest, manifest)
}

func artifactSetsEqual(left, right chroniclesdk.CustomPanelArtifactSet) bool {
	return left.Entry == right.Entry && artifactPointersEqual(left.Worker, right.Worker) && artifactPointersEqual(left.Styles, right.Styles)
}

func artifactPointersEqual(left, right *chroniclesdk.CustomPanelArtifact) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func releaseMatchesPrepared(release database.CustomPanelRelease, prepared preparedCustomPanelRelease) bool {
	return release.Repository == prepared.repository && release.CommitSha == prepared.commitSHA &&
		release.ManifestSha256 == prepared.manifestSHA256 && jsonBytesEqual(release.Manifest, prepared.manifest)
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
