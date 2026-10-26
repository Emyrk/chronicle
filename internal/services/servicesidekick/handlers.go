package servicesidekick

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services/serviceoauth"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const sidekickIssueHistoryLimit = 20

func pgTime(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}
	result := value.Time
	return &result
}

func sidekickIssue(issue database.SidekickIssue) chroniclesdk.SidekickIssue {
	return chroniclesdk.SidekickIssue{
		ID:              issue.ID,
		Code:            issue.Code,
		Message:         issue.Message,
		Details:         issue.Details,
		FirstReportedAt: issue.FirstReportedAt.Time,
		LastReportedAt:  issue.LastReportedAt.Time,
		ResolvedAt:      pgTime(issue.ResolvedAt),
	}
}

func (s *Service) sidekickInstallation(ctx context.Context, installation database.SidekickInstallation) (chroniclesdk.SidekickInstallation, error) {
	issues, err := s.zed.ListSidekickIssues(ctx, database.ListSidekickIssuesParams{
		SidekickID: installation.ID,
		LimitCount: sidekickIssueHistoryLimit,
	})
	if err != nil {
		return chroniclesdk.SidekickInstallation{}, err
	}
	wowDirectories, err := s.zed.ListSidekickWoWDirectories(ctx, installation.ID)
	if err != nil {
		return chroniclesdk.SidekickInstallation{}, err
	}
	convertedDirectories := make([]chroniclesdk.SidekickWoWDirectory, len(wowDirectories))
	for i, directory := range wowDirectories {
		convertedDirectories[i] = chroniclesdk.SidekickWoWDirectory{
			Path: directory.Path, TenantName: directory.TenantName,
			TenantBaseURL: directory.TenantBaseUrl, Realmlist: directory.Realmlist,
		}
	}
	convertedIssues := make([]chroniclesdk.SidekickIssue, len(issues))
	for i, issue := range issues {
		convertedIssues[i] = sidekickIssue(issue)
	}
	configState, err := s.sidekickConfigState(ctx, installation.UserID, installation.ID)
	if err != nil {
		return chroniclesdk.SidekickInstallation{}, err
	}
	lastSeenAt := pgTime(installation.LastSeenAt)
	disconnectedAt := pgTime(installation.DisconnectedAt)
	return chroniclesdk.SidekickInstallation{
		ID:             installation.ID,
		Name:           installation.Name,
		Platform:       installation.Platform,
		Version:        installation.Version,
		Online:         disconnectedAt == nil && lastSeenAt != nil && lastSeenAt.After(time.Now().Add(-chroniclesdk.SidekickOnlineThreshold)),
		LastSeenAt:     lastSeenAt,
		LastUploadAt:   pgTime(installation.LastUploadAt),
		DisconnectedAt: disconnectedAt,
		CreatedAt:      installation.CreatedAt.Time,
		WoWDirectories: convertedDirectories,
		Issues:         convertedIssues,
		Configuration:  &configState,
	}, nil
}

func (s *Service) listSidekicks(ctx context.Context, userID uuid.UUID) (chroniclesdk.ListSidekicksResponse, error) {
	installations, err := s.zed.ListSidekickInstallationsByUser(ctx, userID)
	if err != nil {
		return chroniclesdk.ListSidekicksResponse{}, err
	}
	accountConfig, err := s.accountConfig(ctx, userID)
	if err != nil {
		return chroniclesdk.ListSidekicksResponse{}, err
	}
	response := chroniclesdk.ListSidekicksResponse{
		AccountConfig: accountConfig,
		Sidekicks:     make([]chroniclesdk.SidekickInstallation, len(installations)),
	}
	for i, installation := range installations {
		response.Sidekicks[i], err = s.sidekickInstallation(ctx, installation)
		if err != nil {
			return chroniclesdk.ListSidekicksResponse{}, err
		}
	}
	return response, nil
}

func (s *Service) ListMySidekicks(w http.ResponseWriter, r *http.Request) {
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	response, err := s.listSidekicks(r.Context(), claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, response)
}

func (s *Service) AdminListUserSidekicks(w http.ResponseWriter, r *http.Request) {
	userID, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid user ID."})
		return
	}
	response, err := s.listSidekicks(r.Context(), userID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, response)
}

func (s *Service) RenameMySidekick(w http.ResponseWriter, r *http.Request) {
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	installationID, err := uuid.Parse(chi.URLParam(r, "sidekickID"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid Sidekick ID."})
		return
	}
	var request chroniclesdk.RenameSidekickRequest
	if !httpapi.Read(r.Context(), w, r, &request) {
		return
	}
	request.Name = strings.TrimSpace(request.Name)
	if request.Name == "" || len(request.Name) > 100 {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Sidekick name must be between 1 and 100 characters."})
		return
	}
	installation, err := s.zed.RenameSidekickInstallation(r.Context(), database.RenameSidekickInstallationParams{
		ID: installationID, UserID: claims.Subject, Name: request.Name,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Sidekick not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	response, err := s.sidekickInstallation(r.Context(), installation)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, response)
}

func (s *Service) DisconnectMySidekick(w http.ResponseWriter, r *http.Request) {
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	installationID, err := uuid.Parse(chi.URLParam(r, "sidekickID"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid Sidekick ID."})
		return
	}
	err = s.zed.InTx(r.Context(), func(tx *authz.AuthzTX) error {
		if _, err := tx.DisconnectSidekickInstallation(r.Context(), database.DisconnectSidekickInstallationParams{
			ID: installationID, UserID: claims.Subject,
		}); err != nil {
			return err
		}
		requestIDs, err := tx.RevokeActiveSidekickOAuthGrants(r.Context(), installationID)
		if err != nil {
			return err
		}
		for _, requestID := range requestIDs {
			if _, err := tx.DeleteOAuthTokenSessionsByRequestID(r.Context(), requestID); err != nil {
				return err
			}
		}
		return nil
	}, nil)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Sidekick not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusNoContent, nil)
}

func (s *Service) UpdateSidekickStatus(w http.ResponseWriter, r *http.Request) {
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	installationID, ok := serviceoauth.SidekickInstallationID(r.Context())
	if !ok {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{
			Message: "This OAuth authorization is not linked to a Sidekick installation. Reconnect Sidekick to Chronicle.",
		})
		return
	}
	var request chroniclesdk.SidekickStatusRequest
	if !httpapi.Read(r.Context(), w, r, &request) {
		return
	}
	request.Platform = strings.TrimSpace(request.Platform)
	request.Version = strings.TrimSpace(request.Version)
	request.ConfigHash = strings.TrimSpace(request.ConfigHash)
	if len(request.Platform) > 100 || len(request.Version) > 100 || len(request.ConfigHash) > 128 || len(request.Issues) > 20 {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Sidekick status payload is too large."})
		return
	}
	if len(request.WoWDirectories) > 50 {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Too many World of Warcraft directories."})
		return
	}
	activePaths := make([]string, 0, len(request.WoWDirectories))
	seenPaths := make(map[string]struct{}, len(request.WoWDirectories))
	for i := range request.WoWDirectories {
		directory := &request.WoWDirectories[i]
		directory.Path = strings.TrimSpace(directory.Path)
		directory.TenantName = strings.TrimSpace(directory.TenantName)
		directory.TenantBaseURL = strings.TrimRight(strings.TrimSpace(directory.TenantBaseURL), "/")
		directory.Realmlist = strings.TrimSpace(directory.Realmlist)
		parsedURL, urlErr := url.ParseRequestURI(directory.TenantBaseURL)
		if directory.Path == "" || len(directory.Path) > 2000 ||
			directory.TenantName == "" || len(directory.TenantName) > 100 ||
			len(directory.TenantBaseURL) > 500 || parsedURL == nil || urlErr != nil || parsedURL.Host == "" ||
			(parsedURL.Scheme != "https" && parsedURL.Scheme != "http") || len(directory.Realmlist) > 255 {
			httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "World of Warcraft directory payload is invalid."})
			return
		}
		if _, exists := seenPaths[directory.Path]; exists {
			httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "World of Warcraft directory paths must be unique."})
			return
		}
		seenPaths[directory.Path] = struct{}{}
		activePaths = append(activePaths, directory.Path)
	}

	activeCodes := make([]string, 0, len(request.Issues))
	seenCodes := make(map[string]struct{}, len(request.Issues))
	for i := range request.Issues {
		issue := &request.Issues[i]
		issue.Code = strings.TrimSpace(issue.Code)
		issue.Message = strings.TrimSpace(issue.Message)
		issue.Details = strings.TrimSpace(issue.Details)
		if issue.Code == "" || len(issue.Code) > 100 || issue.Message == "" || len(issue.Message) > 500 || len(issue.Details) > 4000 {
			httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Sidekick issue payload is invalid."})
			return
		}
		if _, exists := seenCodes[issue.Code]; exists {
			httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Sidekick issue codes must be unique."})
			return
		}
		seenCodes[issue.Code] = struct{}{}
		activeCodes = append(activeCodes, issue.Code)
	}

	var installation database.SidekickInstallation
	err := s.zed.InTx(r.Context(), func(tx *authz.AuthzTX) error {
		var err error
		installation, err = tx.UpdateSidekickHeartbeat(r.Context(), database.UpdateSidekickHeartbeatParams{
			ID: installationID, UserID: claims.Subject, Platform: request.Platform, Version: request.Version,
		})
		if err != nil {
			return err
		}
		if _, err := tx.DeleteSidekickWoWDirectoriesExcept(r.Context(), database.DeleteSidekickWoWDirectoriesExceptParams{
			SidekickID: installationID, ActivePaths: activePaths,
		}); err != nil {
			return err
		}
		for _, directory := range request.WoWDirectories {
			if err := tx.UpsertSidekickWoWDirectory(r.Context(), database.UpsertSidekickWoWDirectoryParams{
				SidekickID: installationID, Path: directory.Path, TenantName: directory.TenantName,
				TenantBaseUrl: directory.TenantBaseURL, Realmlist: directory.Realmlist,
			}); err != nil {
				return err
			}
		}
		if _, err := tx.ResolveSidekickIssuesExcept(r.Context(), database.ResolveSidekickIssuesExceptParams{
			SidekickID: installationID, ActiveCodes: activeCodes,
		}); err != nil {
			return err
		}
		for _, issue := range request.Issues {
			if _, err := tx.UpsertActiveSidekickIssue(r.Context(), database.UpsertActiveSidekickIssueParams{
				SidekickID: installationID, Code: issue.Code, Message: issue.Message, Details: issue.Details,
			}); err != nil {
				return err
			}
		}
		return nil
	}, nil)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Sidekick installation is disconnected."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	response, err := s.sidekickInstallation(r.Context(), installation)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, sidekickStatusResponse(response, request.ConfigHash))
}

func (s *Service) RecordUpload(ctx context.Context) {
	installationID, ok := serviceoauth.SidekickInstallationID(ctx)
	if !ok {
		return
	}
	claims := chronauth.MustAuthenticatedClaims(ctx)
	if _, err := s.zed.TouchSidekickUpload(ctx, database.TouchSidekickUploadParams{
		ID: installationID, UserID: claims.Subject,
	}); err != nil {
		s.logger.ErrorContext(ctx, "record sidekick upload", "sidekick_id", installationID, "error", err)
	}
	// The landing funnel's first_upload (docs/landing-funnel-events.md): the
	// account's first log group from any Sidekick. No user identifiers.
	count, err := s.zed.CountSidekickLogGroupsByUser(ctx, claims.Subject)
	if err != nil {
		s.logger.ErrorContext(ctx, "count sidekick log groups", "sidekick_id", installationID, "error", err)
		return
	}
	if count == 1 {
		s.logger.InfoContext(ctx, "funnel event", "event", "first_upload")
	}
}
