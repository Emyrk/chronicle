package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const maxAPIKeysPerUser = 10

func apiKeyToSDK(key database.UserApiKey) chroniclesdk.APIKey {
	result := chroniclesdk.APIKey{
		ID:        key.ID,
		Name:      key.Name,
		CreatedAt: key.CreatedAt.Time,
	}
	if key.LastUsedAt.Valid {
		lastUsedAt := key.LastUsedAt.Time
		result.LastUsedAt = &lastUsedAt
	}
	return result
}

func (a *API) ListMyAPIKeys(w http.ResponseWriter, r *http.Request) {
	claims := chronauth.MustAuthenticatedClaims(r.Context())
	keys, err := a.Opts.Zed.ListUserAPIKeys(r.Context(), claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	response := chroniclesdk.ListAPIKeysResponse{APIKeys: make([]chroniclesdk.APIKey, len(keys))}
	for i, key := range keys {
		response.APIKeys[i] = apiKeyToSDK(key)
	}
	httpapi.Write(r.Context(), w, http.StatusOK, response)
}

func (a *API) CreateMyAPIKey(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	var req chroniclesdk.CreateAPIKeyRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len(req.Name) > 80 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Token name must be between 1 and 80 characters."})
		return
	}

	count, err := a.Opts.Zed.CountUserAPIKeys(ctx, claims.Subject)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if count >= maxAPIKeysPerUser {
		httpapi.Write(ctx, w, http.StatusConflict, chroniclesdk.Response{Message: "Revoke an existing token before creating another."})
		return
	}

	raw, hash, err := chronauth.GenerateAPIKey()
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	key, err := a.Opts.Zed.InsertUserAPIKey(ctx, database.InsertUserAPIKeyParams{
		ID:        uuid.New(),
		UserID:    claims.Subject,
		Name:      req.Name,
		KeyHash:   hash,
		CreatedAt: database.Timestamptz(time.Now()),
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	httpapi.Write(ctx, w, http.StatusCreated, chroniclesdk.CreateAPIKeyResponse{
		APIKey: apiKeyToSDK(key),
		Token:  raw,
	})
}

func (a *API) DeleteMyAPIKey(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)
	keyID, err := uuid.Parse(chi.URLParam(r, "keyID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid API token ID."})
		return
	}

	deleted, err := a.Opts.Zed.DeleteUserAPIKey(ctx, database.DeleteUserAPIKeyParams{
		ID:     keyID,
		UserID: claims.Subject,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if deleted == 0 {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "API token not found."})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
