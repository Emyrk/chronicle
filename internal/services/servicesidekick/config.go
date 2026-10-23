package servicesidekick

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func decodeSidekickConfig(payload []byte) (chroniclesdk.SidekickConfig, error) {
	var config chroniclesdk.SidekickConfig
	if err := json.Unmarshal(payload, &config); err != nil {
		return chroniclesdk.SidekickConfig{}, err
	}
	if err := config.Validate(); err != nil {
		return chroniclesdk.SidekickConfig{}, err
	}
	return config, nil
}

func effectiveSidekickConfig(account chroniclesdk.SidekickConfig, override *chroniclesdk.SidekickConfig) chroniclesdk.SidekickConfig {
	if override != nil {
		return *override
	}
	return account
}

func (s *Service) accountConfig(ctx context.Context, userID uuid.UUID) (chroniclesdk.SidekickAccountConfigResponse, error) {
	config := chroniclesdk.DefaultSidekickConfig()
	payload, err := s.zed.GetSidekickAccountConfig(ctx, userID)
	if err == nil {
		config, err = decodeSidekickConfig(payload)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return chroniclesdk.SidekickAccountConfigResponse{}, err
	}
	if err != nil {
		return chroniclesdk.SidekickAccountConfigResponse{}, err
	}
	hash, err := config.Hash()
	if err != nil {
		return chroniclesdk.SidekickAccountConfigResponse{}, err
	}
	return chroniclesdk.SidekickAccountConfigResponse{Config: config, Hash: hash}, nil
}

func (s *Service) sidekickConfigState(ctx context.Context, userID, sidekickID uuid.UUID) (chroniclesdk.SidekickConfigState, error) {
	if _, err := s.zed.GetSidekickInstallationByUser(ctx, database.GetSidekickInstallationByUserParams{
		SidekickID: sidekickID,
		UserID:     userID,
	}); err != nil {
		return chroniclesdk.SidekickConfigState{}, err
	}

	account, err := s.accountConfig(ctx, userID)
	if err != nil {
		return chroniclesdk.SidekickConfigState{}, err
	}

	var override *chroniclesdk.SidekickConfig
	payload, err := s.zed.GetSidekickConfigOverride(ctx, database.GetSidekickConfigOverrideParams{
		SidekickID: sidekickID,
		UserID:     userID,
	})
	if err == nil {
		config, decodeErr := decodeSidekickConfig(payload)
		if decodeErr != nil {
			return chroniclesdk.SidekickConfigState{}, decodeErr
		}
		override = &config
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return chroniclesdk.SidekickConfigState{}, err
	}

	effective := effectiveSidekickConfig(account.Config, override)
	hash, err := effective.Hash()
	if err != nil {
		return chroniclesdk.SidekickConfigState{}, err
	}
	return chroniclesdk.SidekickConfigState{
		Inherited:     override == nil,
		Override:      override,
		Effective:     effective,
		EffectiveHash: hash,
	}, nil
}

func sidekickStatusResponse(installation chroniclesdk.SidekickInstallation, clientHash string) chroniclesdk.SidekickStatusResponse {
	configuration := installation.Configuration
	installation.Configuration = nil
	response := chroniclesdk.SidekickStatusResponse{SidekickInstallation: installation}
	if configuration == nil {
		return response
	}
	response.ConfigHash = configuration.EffectiveHash
	if clientHash != configuration.EffectiveHash {
		config := configuration.Effective
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

func (s *Service) GetMySidekickAccountConfig(w http.ResponseWriter, r *http.Request) {
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	response, err := s.accountConfig(r.Context(), claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, response)
}

func (s *Service) PutMySidekickAccountConfig(w http.ResponseWriter, r *http.Request) {
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	config, ok := readSidekickConfig(w, r)
	if !ok {
		return
	}
	payload, err := config.CanonicalJSON()
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	stored, err := s.zed.UpsertSidekickAccountConfig(r.Context(), database.UpsertSidekickAccountConfigParams{
		UserID: claims.Subject,
		Config: payload,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	config, err = decodeSidekickConfig(stored)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	hash, err := config.Hash()
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.SidekickAccountConfigResponse{Config: config, Hash: hash})
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
