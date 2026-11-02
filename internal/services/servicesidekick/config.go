package servicesidekick

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"reflect"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func decodeSidekickConfig(payload []byte) (chroniclesdk.SidekickConfig, bool, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		return chroniclesdk.SidekickConfig{}, false, err
	}
	config := chroniclesdk.DefaultSidekickConfig()
	if err := json.Unmarshal(payload, &config); err != nil {
		return chroniclesdk.SidekickConfig{}, false, err
	}
	_, hasArchive := fields["archive"]
	if err := config.Validate(); err != nil {
		return chroniclesdk.SidekickConfig{}, false, err
	}
	return config, !hasArchive, nil
}

func decodeSidekickCapabilities(payload []byte) (chroniclesdk.SidekickAutoUploadCapabilities, error) {
	capabilities := chroniclesdk.SidekickAutoUploadCapabilities{}
	if len(payload) == 0 {
		return capabilities, nil
	}
	if err := json.Unmarshal(payload, &capabilities); err != nil {
		return nil, err
	}
	return capabilities, nil
}

func supportsAutoUpload(capabilities chroniclesdk.SidekickAutoUploadCapabilities, mode chroniclesdk.SidekickAutoUploadMode) bool {
	if mode == chroniclesdk.SidekickAutoUploadDisabled {
		return true
	}
	for _, modes := range capabilities {
		for _, supported := range modes {
			if supported == mode {
				return true
			}
		}
	}
	return false
}

func normalizeSidekickConfig(config chroniclesdk.SidekickConfig, capabilities chroniclesdk.SidekickAutoUploadCapabilities) chroniclesdk.SidekickConfig {
	normalized := chroniclesdk.DefaultSidekickConfig()
	normalized.Archive = config.Archive
	for id, directory := range config.WoWDirectories {
		if !supportsAutoUpload(capabilities, directory.AutoUpload) {
			directory.AutoUpload = chroniclesdk.SidekickAutoUploadDisabled
		}
		normalized.WoWDirectories[id] = directory
	}
	return normalized
}

func validateSidekickCapabilities(config chroniclesdk.SidekickConfig, capabilities chroniclesdk.SidekickAutoUploadCapabilities) error {
	for id, directory := range config.WoWDirectories {
		if !supportsAutoUpload(capabilities, directory.AutoUpload) {
			return fmt.Errorf("auto-upload mode %q is not supported by directory %q", directory.AutoUpload, id)
		}
	}
	return nil
}

func (s *Service) sidekickConfigState(ctx context.Context, userID, sidekickID uuid.UUID) (chroniclesdk.SidekickConfigState, error) {
	installation, err := s.zed.GetSidekickInstallationByUser(ctx, database.GetSidekickInstallationByUserParams{
		SidekickID: sidekickID,
		UserID:     userID,
	})
	if err != nil {
		return chroniclesdk.SidekickConfigState{}, err
	}
	capabilities, err := decodeSidekickCapabilities(installation.AutoUploadCapabilities)
	if err != nil {
		return chroniclesdk.SidekickConfigState{}, err
	}

	config := chroniclesdk.DefaultSidekickConfig()
	resetStoredConfig := false
	payload, err := s.zed.GetSidekickConfigOverride(ctx, database.GetSidekickConfigOverrideParams{
		SidekickID: sidekickID,
		UserID:     userID,
	})
	if err == nil {
		decoded, needsUpgrade, decodeErr := decodeSidekickConfig(payload)
		if decodeErr != nil {
			resetStoredConfig = true
		} else {
			config = decoded
			resetStoredConfig = needsUpgrade
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return chroniclesdk.SidekickConfigState{}, err
	}

	normalized := normalizeSidekickConfig(config, capabilities)
	if (resetStoredConfig || !reflect.DeepEqual(config, normalized)) && !installation.DisconnectedAt.Valid {
		payload, encodeErr := normalized.CanonicalJSON()
		if encodeErr != nil {
			return chroniclesdk.SidekickConfigState{}, encodeErr
		}
		if _, persistErr := s.zed.UpsertSidekickConfigOverride(ctx, database.UpsertSidekickConfigOverrideParams{
			SidekickID: sidekickID,
			UserID:     userID,
			Config:     payload,
		}); persistErr != nil {
			return chroniclesdk.SidekickConfigState{}, persistErr
		}
	}
	config = normalized
	hash, err := config.Hash()
	if err != nil {
		return chroniclesdk.SidekickConfigState{}, err
	}
	return chroniclesdk.SidekickConfigState{Config: config, Hash: hash}, nil
}

func sidekickStatusResponse(sidekickID uuid.UUID, configuration chroniclesdk.SidekickConfigState, clientHash string) chroniclesdk.SidekickStatusResponse {
	response := chroniclesdk.SidekickStatusResponse{
		SettingsURL: "/account/sidekick/installations/" + sidekickID.String(),
		ConfigHash:  configuration.Hash,
	}
	if clientHash != configuration.Hash {
		config := configuration.Config
		response.Config = &config
	}
	return response
}

func readSidekickConfig(w http.ResponseWriter, r *http.Request) (chroniclesdk.SidekickConfig, bool) {
	var config chroniclesdk.SidekickConfig
	if !httpapi.Read(r.Context(), w, r, &config) {
		return chroniclesdk.SidekickConfig{}, false
	}
	if err := config.Validate(); err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: err.Error()})
		return chroniclesdk.SidekickConfig{}, false
	}
	return config, true
}

func sidekickIDParam(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	sidekickID, err := uuid.Parse(chi.URLParam(r, "sidekickID"))
	if err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid Sidekick ID."})
		return uuid.Nil, false
	}
	return sidekickID, true
}

func (s *Service) GetMySidekickConfig(w http.ResponseWriter, r *http.Request) {
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	sidekickID, ok := sidekickIDParam(w, r)
	if !ok {
		return
	}
	state, err := s.sidekickConfigState(r.Context(), claims.Subject, sidekickID)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Sidekick not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, state)
}

func (s *Service) PutMySidekickConfig(w http.ResponseWriter, r *http.Request) {
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	sidekickID, ok := sidekickIDParam(w, r)
	if !ok {
		return
	}
	config, ok := readSidekickConfig(w, r)
	if !ok {
		return
	}
	installation, err := s.zed.GetSidekickInstallationByUser(r.Context(), database.GetSidekickInstallationByUserParams{
		SidekickID: sidekickID,
		UserID:     claims.Subject,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Sidekick not found."})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	capabilities, err := decodeSidekickCapabilities(installation.AutoUploadCapabilities)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if err := validateSidekickCapabilities(config, capabilities); err != nil {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: err.Error()})
		return
	}
	payload, err := config.CanonicalJSON()
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if _, err := s.zed.UpsertSidekickConfigOverride(r.Context(), database.UpsertSidekickConfigOverrideParams{
		SidekickID: sidekickID,
		UserID:     claims.Subject,
		Config:     payload,
	}); errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Sidekick not found."})
		return
	} else if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	state, err := s.sidekickConfigState(r.Context(), claims.Subject, sidekickID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, state)
}

func (s *Service) DeleteMySidekickConfig(w http.ResponseWriter, r *http.Request) {
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	sidekickID, ok := sidekickIDParam(w, r)
	if !ok {
		return
	}
	if _, err := s.zed.DeleteSidekickConfigOverride(r.Context(), database.DeleteSidekickConfigOverrideParams{
		SidekickID: sidekickID,
		UserID:     claims.Subject,
	}); errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Sidekick override not found."})
		return
	} else if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	state, err := s.sidekickConfigState(r.Context(), claims.Subject, sidekickID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, state)
}
