package servicesidekick

import (
	"context"
	"encoding/json"
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
			ID: directory.ID.String, Path: directory.Path, TenantName: directory.TenantName,
			TenantBaseURL: directory.TenantBaseUrl, Realmlist: directory.Realmlist,
			GameFormat: chroniclesdk.SidekickGameFormat(directory.GameFormat),
		}
	}
	capabilities, err := decodeSidekickCapabilities(installation.AutoUploadCapabilities)
	if err != nil {
		return chroniclesdk.SidekickInstallation{}, err
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
		ID:                     installation.ID,
		Name:                   installation.Name,
		Platform:               installation.Platform,
		SidekickVersion:        installation.Version,
		StartAtLogin:           installation.StartAtLogin,
		AutoUploadCapabilities: capabilities,
		Online:                 disconnectedAt == nil && lastSeenAt != nil && lastSeenAt.After(time.Now().Add(-chroniclesdk.SidekickOnlineThreshold)),
		LastSeenAt:             lastSeenAt,
		LastUploadAt:           pgTime(installation.LastUploadAt),
		DisconnectedAt:         disconnectedAt,
		CreatedAt:              installation.CreatedAt.Time,
		WoWDirectories:         convertedDirectories,
		Issues:                 convertedIssues,
		Configuration:          &configState,
	}, nil
}

func (s *Service) listSidekicks(ctx context.Context, userID uuid.UUID) (chroniclesdk.ListSidekicksResponse, error) {
	installations, err := s.zed.ListSidekickInstallationsByUser(ctx, userID)
	if err != nil {
		return chroniclesdk.ListSidekicksResponse{}, err
	}
	response := chroniclesdk.ListSidekicksResponse{
		Sidekicks: make([]chroniclesdk.SidekickInstallation, len(installations)),
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
	request.SidekickVersion = strings.TrimSpace(request.SidekickVersion)
	request.ConfigHash = strings.TrimSpace(request.ConfigHash)
	if request.SidekickVersion == "" ||
		request.StartAtLogin == nil ||
		request.AutoUploadCapabilities == nil ||
		request.WoWDirectories == nil ||
		request.Issues == nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Sidekick status is missing required fields."})
		return
	}
	if len(request.Platform) > 100 || len(request.SidekickVersion) > 100 || len(request.ConfigHash) > 128 || len(request.Issues) > 20 {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Sidekick status payload is too large."})
		return
	}
	if len(request.WoWDirectories) > 50 || len(request.AutoUploadCapabilities) > 20 {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Too many Sidekick capabilities or World of Warcraft directories."})
		return
	}
	for format, modes := range request.AutoUploadCapabilities {
		if format == "" || len(format) > 100 || len(modes) > 20 {
			httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Sidekick auto-upload capabilities are invalid."})
			return
		}
		seenModes := make(map[chroniclesdk.SidekickAutoUploadMode]struct{}, len(modes))
		for _, mode := range modes {
			if mode == "" || len(mode) > 100 || mode == chroniclesdk.SidekickAutoUploadDisabled {
				httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Sidekick auto-upload capabilities are invalid."})
				return
			}
			if _, exists := seenModes[mode]; exists {
				httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Sidekick auto-upload capabilities must be unique."})
				return
			}
			seenModes[mode] = struct{}{}
		}
	}
	capabilitiesJSON, err := json.Marshal(request.AutoUploadCapabilities)
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Sidekick auto-upload capabilities are invalid."})
		return
	}

	activeIDs := make([]string, 0, len(request.WoWDirectories))
	seenIDs := make(map[string]struct{}, len(request.WoWDirectories))
	for i := range request.WoWDirectories {
		directory := &request.WoWDirectories[i]
		directory.ID = strings.TrimSpace(directory.ID)
		directory.Path = strings.TrimSpace(directory.Path)
		directory.TenantName = strings.TrimSpace(directory.TenantName)
		directory.TenantBaseURL = strings.TrimRight(strings.TrimSpace(directory.TenantBaseURL), "/")
		directory.Realmlist = strings.TrimSpace(directory.Realmlist)
		directory.GameFormat = chroniclesdk.SidekickGameFormat(strings.TrimSpace(string(directory.GameFormat)))
		if !chroniclesdk.IsValidSidekickWoWDirectoryID(directory.ID) || directory.Path == "" || len(directory.Path) > 2000 ||
			len(directory.TenantName) > 100 || len(directory.TenantBaseURL) > 500 || len(directory.Realmlist) > 255 ||
			(directory.GameFormat != "" && directory.GameFormat != chroniclesdk.SidekickGameFormatWotLK335a) {
			httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "World of Warcraft directory payload is invalid."})
			return
		}
		if directory.TenantBaseURL != "" {
			parsedURL, urlErr := url.ParseRequestURI(directory.TenantBaseURL)
			if parsedURL == nil || urlErr != nil || parsedURL.Host == "" || (parsedURL.Scheme != "https" && parsedURL.Scheme != "http") {
				httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "World of Warcraft directory payload is invalid."})
				return
			}
		}
		if _, exists := seenIDs[directory.ID]; exists {
			httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "World of Warcraft directory IDs must be unique."})
			return
		}
		seenIDs[directory.ID] = struct{}{}
		activeIDs = append(activeIDs, directory.ID)
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
	err = s.zed.InTx(r.Context(), func(tx *authz.AuthzTX) error {
		var err error
		installation, err = tx.UpdateSidekickHeartbeat(r.Context(), database.UpdateSidekickHeartbeatParams{
			ID: installationID, UserID: claims.Subject, Platform: request.Platform,
			SidekickVersion: request.SidekickVersion, StartAtLogin: *request.StartAtLogin,
			AutoUploadCapabilities: capabilitiesJSON,
		})
		if err != nil {
			return err
		}
		if _, err := tx.DeleteSidekickWoWDirectoriesExcept(r.Context(), database.DeleteSidekickWoWDirectoriesExceptParams{
			SidekickID: installationID, ActiveIds: activeIDs,
		}); err != nil {
			return err
		}
		for _, directory := range request.WoWDirectories {
			if err := tx.UpsertSidekickWoWDirectory(r.Context(), database.UpsertSidekickWoWDirectoryParams{
				SidekickID: installationID, ID: pgtype.Text{String: directory.ID, Valid: true}, Path: directory.Path, TenantName: directory.TenantName,
				TenantBaseUrl: directory.TenantBaseURL, Realmlist: directory.Realmlist,
				GameFormat: string(directory.GameFormat),
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
	configuration, err := s.sidekickConfigState(r.Context(), claims.Subject, installation.ID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	response := sidekickStatusResponse(configuration, request.ConfigHash)
	if response.Config == nil {
		httpapi.Write(r.Context(), w, http.StatusNoContent, nil)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, response)
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
}
