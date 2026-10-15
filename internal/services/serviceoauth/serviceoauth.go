package serviceoauth

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceaccessurl"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/coder/serpent"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/ory/fosite"
	"github.com/ory/fosite/compose"
	"github.com/ory/fosite/handler/rfc8628"
)

const (
	ClientID        = "chronicle-sidekick"
	ScopeAll        = "all"
	deviceGrantType = "urn:ietf:params:oauth:grant-type:device_code"
)

var compiledClient = &fosite.DefaultClient{
	ID:         ClientID,
	GrantTypes: []string{deviceGrantType, "refresh_token"},
	Scopes:     []string{ScopeAll},
	Public:     true,
}

var (
	_ services.Servicer = (*Service)(nil)
	_ http.Handler      = (*Service)(nil)
)

func OAuth(broker *services.Services) *Service { return services.MustGet[*Service](broker) }
func OnOAuth() string                          { return (&Service{}).Name() }

type Service struct {
	broker          *services.Services
	store           *storage
	provider        fosite.OAuth2Provider
	deviceStrategy  rfc8628.RFC8628CodeStrategy
	router          chi.Router
	browserApproval http.Handler
}

func New(broker *services.Services) *Service { return &Service{broker: broker} }
func (s *Service) Name() string              { return services.ServiceOAuth }
func (s *Service) Configures() []string      { return nil }
func (s *Service) DependsOn() []string {
	return []string{servicelogger.OnLogger(), servicedbstore.OnDatabaseStore(), serviceaccessurl.OnAccessURL()}
}
func (s *Service) Options() serpent.OptionSet  { return nil }
func (s *Service) Close(context.Context) error { return nil }

func (s *Service) Start(ctx context.Context) error {
	if err := s.configure(ctx, servicedbstore.DatabaseStore(s.broker), serviceaccessurl.AccessURL(s.broker)); err != nil {
		return err
	}
	servicelogger.Logger(s.broker).Info("oauth service started")
	return nil
}

func (s *Service) configure(ctx context.Context, db oauthStore, accessURL string) error {
	secretCandidate := make([]byte, 32)
	if _, err := rand.Read(secretCandidate); err != nil {
		return fmt.Errorf("generate oauth server secret: %w", err)
	}
	secret, err := db.GetOrCreateOAuthServerSecret(ctx, secretCandidate)
	if err != nil {
		return fmt.Errorf("load oauth server secret: %w", err)
	}

	verificationURL, err := url.JoinPath(accessURL, "oauth", "device")
	if err != nil {
		return fmt.Errorf("build oauth device verification url: %w", err)
	}
	config := &fosite.Config{
		GlobalSecret:                   secret,
		AccessTokenLifespan:            time.Hour,
		RefreshTokenLifespan:           30 * 24 * time.Hour,
		RefreshTokenScopes:             []string{ScopeAll},
		DeviceAndUserCodeLifespan:      10 * time.Minute,
		DeviceAuthTokenPollingInterval: 5 * time.Second,
		DeviceVerificationURL:          verificationURL,
		ScopeStrategy:                  fosite.ExactScopeStrategy,
	}
	s.store = &storage{db: db}
	coreStrategy := compose.NewOAuth2HMACStrategy(config)
	deviceStrategy := compose.NewDeviceStrategy(config)
	s.deviceStrategy = deviceStrategy
	strategy := &compose.CommonStrategy{
		CoreStrategy:        coreStrategy,
		RFC8628CodeStrategy: deviceStrategy,
	}
	s.provider = compose.Compose(config, s.store, strategy,
		compose.RFC8628DeviceFactory,
		compose.RFC8628DeviceAuthorizationTokenFactory,
		compose.OAuth2RefreshTokenGrantFactory,
		compose.OAuth2TokenIntrospectionFactory,
		compose.OAuth2TokenRevocationFactory,
	)

	s.router = chi.NewRouter()
	s.router.Post("/device/authorize", s.deviceAuthorization)
	s.router.Handle("/device", http.HandlerFunc(s.serveBrowserApproval))
	s.router.Post("/token", s.token)
	s.router.Post("/revoke", s.revoke)
	return nil
}

func (s *Service) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.router.ServeHTTP(w, r)
}

func (s *Service) SetBrowserAuth(middlewares ...func(http.Handler) http.Handler) {
	var handler http.Handler = http.HandlerFunc(s.browserApprovalHandler)
	for i := len(middlewares) - 1; i >= 0; i-- {
		handler = middlewares[i](handler)
	}
	s.browserApproval = handler
}

func (s *Service) serveBrowserApproval(w http.ResponseWriter, r *http.Request) {
	if s.browserApproval == nil {
		httpapi.Write(r.Context(), w, http.StatusServiceUnavailable, chroniclesdk.Response{Message: "OAuth approval is not configured."})
		return
	}
	s.browserApproval.ServeHTTP(w, r)
}

func (s *Service) deviceAuthorization(w http.ResponseWriter, r *http.Request) {
	request, err := s.provider.NewDeviceRequest(r.Context(), r)
	if err != nil {
		s.provider.WriteAccessError(r.Context(), w, request, err)
		return
	}
	if len(request.GetRequestedScopes()) != 1 || request.GetRequestedScopes()[0] != ScopeAll {
		s.provider.WriteAccessError(r.Context(), w, request, fosite.ErrInvalidScope)
		return
	}
	request.GrantScope(ScopeAll)
	response, err := s.provider.NewDeviceResponse(r.Context(), request, &fosite.DefaultSession{})
	if err != nil {
		s.provider.WriteAccessError(r.Context(), w, request, err)
		return
	}
	s.provider.WriteDeviceResponse(r.Context(), w, request, response)
}

func (s *Service) token(w http.ResponseWriter, r *http.Request) {
	request, err := s.provider.NewAccessRequest(r.Context(), r, &fosite.DefaultSession{})
	if err != nil {
		s.provider.WriteAccessError(r.Context(), w, request, err)
		return
	}
	response, err := s.provider.NewAccessResponse(r.Context(), request)
	if err != nil {
		s.provider.WriteAccessError(r.Context(), w, request, err)
		return
	}
	s.provider.WriteAccessResponse(r.Context(), w, request, response)
}

func (s *Service) revoke(w http.ResponseWriter, r *http.Request) {
	err := s.provider.NewRevocationRequest(r.Context(), r)
	s.provider.WriteRevocationResponse(r.Context(), w, err)
}

var approvalPage = template.Must(template.New("oauth-device").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Authorize Chronicle Sidekick</title></head>
<body><main><h1>Authorize Chronicle Sidekick</h1>
<form method="post"><label>Device code <input name="user_code" value="{{.}}" required></label>
<button name="decision" value="approve" type="submit">Approve</button>
<button name="decision" value="deny" type="submit">Deny</button></form></main></body></html>`))

func (s *Service) browserApprovalHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if err := approvalPage.Execute(w, r.URL.Query().Get("user_code")); err != nil {
			httpapi.InternalServerError(w, err)
		}
	case http.MethodPost:
		if err := r.ParseForm(); err != nil {
			httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid approval request."})
			return
		}
		userCode := strings.TrimSpace(r.Form.Get("user_code"))
		signature, err := s.deviceStrategy.UserCodeSignature(r.Context(), userCode)
		if err != nil {
			httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Invalid device code."})
			return
		}
		deviceRequest, err := s.store.GetDeviceCodeSession(r.Context(), signature, &fosite.DefaultSession{})
		if err != nil || s.deviceStrategy.ValidateUserCode(r.Context(), deviceRequest, userCode) != nil {
			httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Device code not found or expired."})
			return
		}
		state := fosite.UserCodeRejected
		if r.Form.Get("decision") == "approve" {
			state = fosite.UserCodeAccepted
		}
		subject := chronauth.MustAuthenticatedClaims(r.Context()).Subject.String()
		if err := s.store.approveDevice(r.Context(), signature, subject, state); err != nil {
			if errors.Is(err, fosite.ErrNotFound) {
				httpapi.Write(r.Context(), w, http.StatusNotFound, chroniclesdk.Response{Message: "Device code not found or expired."})
				return
			}
			httpapi.InternalServerError(w, err)
			return
		}
		httpapi.Write(r.Context(), w, http.StatusOK, chroniclesdk.Response{Message: "Device authorization updated. You may return to Chronicle Sidekick."})
	default:
		w.Header().Set("Allow", "GET, POST")
		httpapi.Write(r.Context(), w, http.StatusMethodNotAllowed, chroniclesdk.Response{Message: "Method not allowed."})
	}
}

// BearerAuthenticated validates a Fosite access token and establishes both
// Chronicle authentication claims and the database authorization actor. It is
// intentionally not mounted on existing API routes in this change.
func (s *Service) BearerAuthenticated(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		parts := strings.Fields(header)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			httpapi.Write(r.Context(), w, http.StatusUnauthorized, chroniclesdk.Response{Message: "Missing OAuth bearer token."})
			return
		}
		_, request, err := s.provider.IntrospectToken(r.Context(), parts[1], fosite.AccessToken, &fosite.DefaultSession{}, ScopeAll)
		if err != nil {
			httpapi.Write(r.Context(), w, http.StatusUnauthorized, chroniclesdk.Response{Message: "Invalid OAuth bearer token."})
			return
		}
		userID, err := uuid.Parse(request.GetSession().GetSubject())
		if err != nil {
			httpapi.Write(r.Context(), w, http.StatusUnauthorized, chroniclesdk.Response{Message: "Invalid OAuth subject."})
			return
		}
		ctx := chronauth.WithClaims(r.Context(), &claims.Claims{Subject: userID})
		ctx = authz.AsUser(ctx, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
