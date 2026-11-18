package serviceoauth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/ory/fosite"
	"github.com/ory/fosite/handler/oauth2"
	"golang.org/x/crypto/bcrypt"
)

func developerClientID(id uuid.UUID) string { return DeveloperClientIDPrefix + id.String() }
func developerAppID(clientID string) (uuid.UUID, bool) {
	if !strings.HasPrefix(clientID, DeveloperClientIDPrefix) {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(strings.TrimPrefix(clientID, DeveloperClientIDPrefix))
	return id, err == nil && id != uuid.Nil && developerClientID(id) == clientID
}

type AccessTokenIdentity struct {
	ClientID               string    `json:"client_id"`
	DeveloperAppID         uuid.UUID `json:"developer_app_id,omitempty"`
	UserID                 uuid.UUID `json:"user_id"`
	Scope                  string    `json:"scope"`
	ExpiresAt              time.Time `json:"expires_at"`
	SidekickInstallationID uuid.UUID `json:"-"`
}

// ValidateAccessToken validates only issued OAuth access tokens; it never accepts session JWTs.
// UserID identifies the app owner for accounting, not delegated user permissions.
func (s *Service) ValidateAccessToken(ctx context.Context, token string) (AccessTokenIdentity, error) {
	if !strings.HasPrefix(token, accessTokenPrefix) {
		return AccessTokenIdentity{}, fosite.ErrInvalidTokenFormat
	}
	_, request, err := s.provider.IntrospectToken(ctx, token, fosite.AccessToken, &fosite.DefaultSession{})
	if err != nil {
		return AccessTokenIdentity{}, err
	}
	userID, err := uuid.Parse(request.GetSession().GetSubject())
	if err != nil || userID == uuid.Nil {
		return AccessTokenIdentity{}, fosite.ErrRequestUnauthorized
	}
	clientID := request.GetClient().GetID()
	identity := AccessTokenIdentity{
		ClientID: clientID, UserID: userID,
		Scope:     strings.Join(request.GetGrantedScopes(), " "),
		ExpiresAt: request.GetSession().GetExpiresAt(fosite.AccessToken),
	}
	if id, ok := developerAppID(clientID); ok {
		app, err := s.store.db.GetOAuthDeveloperAppByID(ctx, id)
		if err != nil || app.UserID != userID {
			return AccessTokenIdentity{}, fosite.ErrRequestUnauthorized
		}
		identity.DeveloperAppID = id
	} else if clientID == ClientID {
		identity.SidekickInstallationID, _ = sidekickInstallationIDFromSession(request.GetSession())
	} else {
		return AccessTokenIdentity{}, fosite.ErrRequestUnauthorized
	}
	return identity, nil
}

func (s *Service) validate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if err := r.ParseForm(); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]bool{"active": false})
		return
	}
	token := r.PostForm.Get("token")
	if token == "" {
		parts := strings.Fields(r.Header.Get("Authorization"))
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			token = parts[1]
		}
	}
	identity, err := s.ValidateAccessToken(r.Context(), token)
	if err != nil {
		_ = json.NewEncoder(w).Encode(map[string]bool{"active": false})
		return
	}
	_ = json.NewEncoder(w).Encode(struct {
		Active bool `json:"active"`
		AccessTokenIdentity
	}{true, identity})
}

type developerCredentialsHandler struct {
	*oauth2.ClientCredentialsGrantHandler
	store   *storage
	refresh oauth2.RefreshTokenStrategy
}

func (h *developerCredentialsHandler) HandleTokenEndpointRequest(ctx context.Context, request fosite.AccessRequester) error {
	if err := h.ClientCredentialsGrantHandler.HandleTokenEndpointRequest(ctx, request); err != nil {
		return err
	}
	id, ok := developerAppID(request.GetClient().GetID())
	if !ok {
		return fosite.ErrUnauthorizedClient
	}
	app, err := h.store.db.GetOAuthDeveloperAppByID(ctx, id)
	if err != nil {
		return err
	}
	if !request.GetRequestedScopes().ExactOne(ScopeExternalRead) {
		return fosite.ErrInvalidScope
	}
	request.GrantScope(ScopeExternalRead)
	request.GetSession().(*fosite.DefaultSession).Subject = app.UserID.String()
	request.GetSession().SetExpiresAt(fosite.RefreshToken, time.Now().UTC().Add(h.store.refreshTokenLifespan).Round(time.Second))
	return nil
}

func (h *developerCredentialsHandler) PopulateTokenEndpointResponse(ctx context.Context, request fosite.AccessRequester, response fosite.AccessResponder) error {
	if !h.CanHandleTokenEndpointRequest(ctx, request) {
		return fosite.ErrUnknownRequest
	}
	txCtx, err := h.store.BeginTX(ctx)
	if err != nil {
		return err
	}
	// Both tokens commit together. A failed issuance cannot strand a usable access token.
	fail := func(err error) error { _ = h.store.Rollback(txCtx); return err }
	signature, err := h.IssueAccessToken(txCtx, h.store.accessTokenLifespan, request, response)
	if err != nil {
		return fail(err)
	}
	token, refreshSignature, err := h.refresh.GenerateRefreshToken(txCtx, request)
	if err != nil {
		return fail(err)
	}
	if err := h.store.CreateRefreshTokenSession(txCtx, refreshSignature, signature, request.Sanitize([]string{})); err != nil {
		return fail(err)
	}
	if err := h.store.Commit(txCtx); err != nil {
		return err
	}
	response.SetExtra("refresh_token", token)
	return nil
}

// authenticateRefreshClient permits a bearer refresh token to authenticate its own
// confidential client. Only valid, unexpired, persisted tokens qualify.
func (s *Service) authenticateRefreshClient(ctx context.Context, r *http.Request, form url.Values, strategy oauth2.RefreshTokenStrategy) (fosite.Client, error) {
	provider := s.provider.(*fosite.Fosite)
	if form.Get("grant_type") != "refresh_token" || form.Get("client_secret") != "" {
		return provider.DefaultClientAuthenticationStrategy(ctx, r, form)
	}
	if _, _, ok := r.BasicAuth(); ok {
		return provider.DefaultClientAuthenticationStrategy(ctx, r, form)
	}
	token := form.Get("refresh_token")
	if token == "" {
		return provider.DefaultClientAuthenticationStrategy(ctx, r, form)
	}
	signature := strategy.RefreshTokenSignature(ctx, token)
	original, err := s.store.GetRefreshTokenSession(ctx, signature, &fosite.DefaultSession{})
	if errors.Is(err, fosite.ErrInactiveToken) && original != nil {
		// A reused, cryptographically valid refresh token compromises its grant.
		// Revoke all later tokens of that grant, just as Fosite does for Sidekick.
		if strategy.ValidateRefreshToken(ctx, original, token) == nil {
			_, _ = s.store.db.DeleteOAuthTokenSessionsByRequestID(ctx, original.GetID())
		}
		return nil, fosite.ErrInvalidClient
	}
	if err != nil {
		if form.Get("client_id") == ClientID {
			return provider.DefaultClientAuthenticationStrategy(ctx, r, form)
		}
		return nil, fosite.ErrInvalidClient
	}
	clientID := original.GetClient().GetID()
	if _, ok := developerAppID(clientID); !ok {
		return provider.DefaultClientAuthenticationStrategy(ctx, r, form)
	}
	if form.Get("client_id") != "" && form.Get("client_id") != clientID {
		return nil, fosite.ErrInvalidClient
	}
	if err := strategy.ValidateRefreshToken(ctx, original, token); err != nil {
		return nil, fosite.ErrInvalidClient
	}
	return s.store.GetClient(ctx, clientID)
}

type developerAppResponse struct {
	ID           uuid.UUID `json:"id"`
	ClientID     string    `json:"client_id"`
	Name         string    `json:"name"`
	ClientSecret string    `json:"client_secret,omitempty"`
}

func appResponse(app database.OauthDeveloperApp) developerAppResponse {
	return developerAppResponse{ID: app.ID, ClientID: developerClientID(app.ID), Name: app.Name}
}
func newDeveloperSecret() (string, []byte, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", nil, err
	}
	secret := base64.RawURLEncoding.EncodeToString(b)
	hash, err := bcrypt.GenerateFromPassword([]byte(secret), bcrypt.DefaultCost)
	return secret, hash, err
}
func (s *Service) serveDeveloperApps(w http.ResponseWriter, r *http.Request) {
	if s.browserApps == nil {
		writeDeveloperError(w, http.StatusServiceUnavailable, "browser authentication is not configured")
		return
	}
	s.browserApps.ServeHTTP(w, r)
}
func (s *Service) developerAppsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	claims, ok := chronauth.AuthenticatedClaims(r.Context())
	if !ok {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "authentication_required"})
		return
	}
	ctx := r.Context()
	switch {
	case r.Method == http.MethodGet:
		app, err := s.store.db.GetOAuthDeveloperAppByUser(ctx, claims.Subject)
		if errors.Is(err, pgx.ErrNoRows) {
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"app": nil})
			return
		}
		if err != nil {
			writeDeveloperError(w, http.StatusInternalServerError, "database error")
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"app": appResponse(app)})
	case r.Method == http.MethodPost && !strings.HasSuffix(r.URL.Path, "/apps/rotate"):
		var body struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
			writeDeveloperError(w, http.StatusBadRequest, "invalid request")
			return
		}
		body.Name = strings.TrimSpace(body.Name)
		if len(body.Name) < 1 || len(body.Name) > 100 {
			writeDeveloperError(w, http.StatusBadRequest, "invalid name")
			return
		}
		secret, hash, err := newDeveloperSecret()
		if err != nil {
			writeDeveloperError(w, http.StatusInternalServerError, "secret generation failed")
			return
		}
		app, err := s.store.db.CreateOAuthDeveloperApp(ctx, database.CreateOAuthDeveloperAppParams{ID: uuid.New(), UserID: claims.Subject, Name: body.Name, SecretHash: hash})
		if err != nil {
			if isDeveloperAppConflict(err) {
				writeDeveloperError(w, http.StatusConflict, "app already exists")
				return
			}
			writeDeveloperError(w, http.StatusInternalServerError, "database error")
			return
		}
		result := appResponse(app)
		result.ClientSecret = secret
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(result)
	case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/apps/rotate"):
		secret, hash, err := newDeveloperSecret()
		if err != nil {
			writeDeveloperError(w, http.StatusInternalServerError, "secret generation failed")
			return
		}
		var app database.OauthDeveloperApp
		err = s.store.db.InTx(ctx, func(tx database.Store) error {
			var err error
			app, err = tx.GetOAuthDeveloperAppByUser(ctx, claims.Subject)
			if err != nil {
				return err
			}
			if _, err = tx.DeleteOAuthDeveloperAppTokens(ctx, app.ID.String()); err != nil {
				return err
			}
			_, err = tx.UpdateOAuthDeveloperAppSecret(ctx, database.UpdateOAuthDeveloperAppSecretParams{SecretHash: hash, UserID: claims.Subject})
			return err
		}, nil)
		if errors.Is(err, pgx.ErrNoRows) {
			writeDeveloperError(w, http.StatusNotFound, "app not found")
			return
		}
		if err != nil {
			writeDeveloperError(w, http.StatusInternalServerError, "database error")
			return
		}
		result := appResponse(app)
		result.ClientSecret = secret
		_ = json.NewEncoder(w).Encode(result)
	case r.Method == http.MethodDelete:
		err := s.store.db.InTx(ctx, func(tx database.Store) error {
			app, err := tx.GetOAuthDeveloperAppByUser(ctx, claims.Subject)
			if err != nil {
				return err
			}
			if _, err := tx.DeleteOAuthDeveloperAppTokens(ctx, app.ID.String()); err != nil {
				return err
			}
			_, err = tx.DeleteOAuthDeveloperAppByUser(ctx, claims.Subject)
			return err
		}, nil)
		if errors.Is(err, pgx.ErrNoRows) {
			writeDeveloperError(w, http.StatusNotFound, "app not found")
			return
		}
		if err != nil {
			writeDeveloperError(w, http.StatusInternalServerError, "database error")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		writeDeveloperError(w, http.StatusMethodNotAllowed, fmt.Sprintf("unsupported method %s", r.Method))
	}
}

func isDeveloperAppConflict(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "oauth_developer_apps_user_id_key"
}

func writeDeveloperError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
