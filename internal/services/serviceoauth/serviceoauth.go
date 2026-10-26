package serviceoauth

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log/slog"
	"maps"
	"net/http"
	"net/url"
	"slices"
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
	ClientID          = "chronicle-sidekick"
	ScopeAll          = "all"
	accessTokenPrefix = "ory_at_"
	deviceGrantType   = "urn:ietf:params:oauth:grant-type:device_code"

	installationIDParam       = "installation_id"
	installationNameParam     = "installation_name"
	installationPlatformParam = "installation_platform"
	installationVersionParam  = "installation_version"
	sidekickSessionExtraKey   = "sidekick_installation_id"

	// utmCookie is set by the public /download page from the landing's utm_*
	// params (frontend/chronicle/src/utils/utm.ts).
	utmCookie = "chronicle_utm"
)

type sidekickMetadata struct {
	ID       uuid.UUID
	Name     string
	Platform string
	Version  string
}

func sidekickMetadataFromValues(form url.Values) (sidekickMetadata, bool, error) {
	rawID := strings.TrimSpace(form.Get(installationIDParam))
	if rawID == "" {
		return sidekickMetadata{}, false, nil
	}
	id, err := uuid.Parse(rawID)
	if err != nil || id == uuid.Nil {
		return sidekickMetadata{}, false, errors.New("invalid sidekick installation_id")
	}
	metadata := sidekickMetadata{
		ID:       id,
		Name:     strings.TrimSpace(form.Get(installationNameParam)),
		Platform: strings.TrimSpace(form.Get(installationPlatformParam)),
		Version:  strings.TrimSpace(form.Get(installationVersionParam)),
	}
	if metadata.Name == "" {
		metadata.Name = "Chronicle Sidekick"
	}
	if len(metadata.Name) > 100 || len(metadata.Platform) > 100 || len(metadata.Version) > 100 {
		return sidekickMetadata{}, false, errors.New("sidekick installation metadata is too long")
	}
	return metadata, true, nil
}

func sidekickInstallationIDFromSession(session fosite.Session) (uuid.UUID, bool) {
	defaultSession, ok := session.(*fosite.DefaultSession)
	if !ok || defaultSession == nil {
		return uuid.Nil, false
	}
	rawID := defaultSession.GetUsername()
	if rawID == "" {
		rawID, _ = defaultSession.GetExtraClaims()[sidekickSessionExtraKey].(string)
	}
	id, err := uuid.Parse(rawID)
	return id, err == nil && id != uuid.Nil
}

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
	deviceLimiter   *deviceAuthorizationLimiter
	logger          *slog.Logger
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
	s.logger = servicelogger.Logger(s.broker)
	s.logger.Info("oauth service started")
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
	s.store = &storage{
		db:                         db,
		deviceCodeLifespan:         config.DeviceAndUserCodeLifespan,
		accessTokenLifespan:        config.AccessTokenLifespan,
		refreshTokenLifespan:       config.RefreshTokenLifespan,
		transactionLifetime:        defaultTransactionLifetime,
		transactionFinalizeTimeout: defaultTransactionFinalizeTimeout,
	}
	if err := s.store.cleanupExpired(ctx); err != nil {
		return fmt.Errorf("cleanup expired oauth sessions: %w", err)
	}
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
	s.deviceLimiter = newDeviceAuthorizationLimiter()
	s.router.With(s.deviceLimiter.middleware).Post("/device/authorize", s.deviceAuthorization)
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
	if err := r.ParseForm(); err != nil {
		s.provider.WriteAccessError(r.Context(), w, nil, fosite.ErrInvalidRequest.WithHint(err.Error()))
		return
	}
	metadata, hasMetadata, err := sidekickMetadataFromValues(r.Form)
	if err != nil {
		s.provider.WriteAccessError(r.Context(), w, nil, fosite.ErrInvalidRequest.WithHint(err.Error()))
		return
	}
	if hasMetadata {
		r = r.WithContext(withPendingSidekickMetadata(r.Context(), metadata))
	}
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

// campaignCookie returns the visitor's campaign utm_* params from the landing
// cookie, or nil without one.
func campaignCookie(r *http.Request) url.Values {
	cookie, err := r.Cookie(utmCookie)
	if err != nil {
		return nil
	}
	raw, err := url.QueryUnescape(cookie.Value)
	if err != nil {
		return nil
	}
	campaign, err := url.ParseQuery(raw)
	if err != nil {
		return nil
	}
	return campaign
}

// withCampaign returns the pairing URL with the visitor's campaign utm_* params
// added, so they survive the sign-in round trip and a new account can be
// attributed to the ad that brought it.
func withCampaign(r *http.Request) string {
	target := *r.URL
	campaign := campaignCookie(r)
	if campaign == nil {
		return target.RequestURI()
	}
	query := target.Query()
	for key, values := range campaign {
		if strings.HasPrefix(key, "utm_") && len(values) > 0 && !query.Has(key) {
			query.Set(key, values[0])
		}
	}
	target.RawQuery = query.Encode()
	return target.RequestURI()
}

// logPairComplete records the landing funnel's pair_complete event
// (docs/landing-funnel-events.md) with the campaign the pairing browser came
// from, if any. No user identifiers are attached.
func (s *Service) logPairComplete(r *http.Request) {
	logger := s.logger
	if logger == nil {
		logger = slog.Default()
	}
	attrs := []any{"event", "pair_complete"}
	campaign := campaignCookie(r)
	for _, key := range slices.Sorted(maps.Keys(campaign)) {
		if value := campaign.Get(key); strings.HasPrefix(key, "utm_") && value != "" {
			attrs = append(attrs, key, value)
		}
	}
	logger.InfoContext(r.Context(), "funnel event", attrs...)
}

func (s *Service) browserApprovalHandler(w http.ResponseWriter, r *http.Request) {
	authClaims, ok := chronauth.AuthenticatedClaims(r.Context())
	if !ok {
		http.Redirect(w, r, "/login?from="+url.QueryEscape(withCampaign(r)), http.StatusSeeOther)
		return
	}
	switch r.Method {
	case http.MethodGet:
		renderDevicePage(w, http.StatusOK, devicePageData{
			State:    devicePageAuthorize,
			UserCode: strings.TrimSpace(r.URL.Query().Get("user_code")),
			Title:    "Link this device",
			Message:  "Confirm the code shown in Chronicle Sidekick to connect it to your account.",
		})
	case http.MethodPost:
		if err := r.ParseForm(); err != nil {
			renderDevicePage(w, http.StatusBadRequest, devicePageData{
				State: devicePageError, Title: "That request was unreadable",
				Message: "Chronicle could not read the authorization request. Return to Sidekick and try again.",
			})
			return
		}
		userCode := strings.TrimSpace(r.Form.Get("user_code"))
		signature, err := s.deviceStrategy.UserCodeSignature(r.Context(), userCode)
		if err != nil {
			renderDevicePage(w, http.StatusBadRequest, devicePageData{
				State: devicePageError, Title: "Check the device code",
				Message: "This code is not valid. Compare it with the code shown in Chronicle Sidekick.",
			})
			return
		}
		deviceRequest, err := s.store.GetDeviceCodeSession(r.Context(), signature, &fosite.DefaultSession{})
		if err != nil || s.deviceStrategy.ValidateUserCode(r.Context(), deviceRequest, userCode) != nil {
			renderDevicePage(w, http.StatusNotFound, devicePageData{
				State: devicePageError, Title: "This code has expired",
				Message: "The device code was not found or is no longer active.",
			})
			return
		}
		state := fosite.UserCodeRejected
		page := devicePageData{
			State: devicePageDenied, Title: "Authorization denied",
			Message: "Chronicle Sidekick was not connected to your account.",
		}
		if r.Form.Get("decision") == "approve" {
			state = fosite.UserCodeAccepted
			page = devicePageData{
				State: devicePageApproved, Title: "Device linked",
				Message: "Chronicle Sidekick is now authorized to use your Chronicle account.",
			}
		}
		subject := authClaims.Subject.String()
		if err := s.store.approveDevice(r.Context(), signature, subject, state); err != nil {
			if errors.Is(err, fosite.ErrNotFound) {
				renderDevicePage(w, http.StatusNotFound, devicePageData{
					State: devicePageError, Title: "This code has expired",
					Message: "The device code was already used or is no longer active.",
				})
				return
			}
			renderDevicePage(w, http.StatusInternalServerError, devicePageData{
				State: devicePageError, Title: "Authorization interrupted",
				Message: "Chronicle could not complete the authorization. Return to Sidekick and try again.",
			})
			return
		}
		if state == fosite.UserCodeAccepted {
			s.logPairComplete(r)
		}
		renderDevicePage(w, http.StatusOK, page)
	default:
		w.Header().Set("Allow", "GET, POST")
		renderDevicePage(w, http.StatusMethodNotAllowed, devicePageData{
			State: devicePageError, Title: "Method not allowed",
			Message: "Open the authorization link from Chronicle Sidekick to continue.",
		})
	}
}

// AuthenticationMiddleware establishes Chronicle authentication for valid OAuth
// access tokens. Requests without a valid OAuth token continue to the next
// authentication middleware, which preserves support for Chronicle session JWTs.
func (s *Service) AuthenticationMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, ok := s.authenticateBearer(r)
		if ok {
			r = r.WithContext(ctx)
		}
		next.ServeHTTP(w, r)
	})
}

// BearerAuthenticated requires a valid Fosite access token and establishes both
// Chronicle authentication claims and the database authorization actor.
func (s *Service) BearerAuthenticated(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		parts := strings.Fields(header)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			httpapi.Write(r.Context(), w, http.StatusUnauthorized, chroniclesdk.Response{Message: "Missing OAuth bearer token."})
			return
		}
		ctx, ok := s.authenticateBearer(r)
		if !ok {
			httpapi.Write(r.Context(), w, http.StatusUnauthorized, chroniclesdk.Response{Message: "Invalid OAuth bearer token."})
			return
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Service) authenticateBearer(r *http.Request) (context.Context, bool) {
	header := r.Header.Get("Authorization")
	parts := strings.Fields(header)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || !strings.HasPrefix(parts[1], accessTokenPrefix) {
		return r.Context(), false
	}
	session := &fosite.DefaultSession{}
	_, request, err := s.provider.IntrospectToken(r.Context(), parts[1], fosite.AccessToken, session, ScopeAll)
	if err != nil {
		return r.Context(), false
	}
	userID, err := uuid.Parse(request.GetSession().GetSubject())
	if err != nil {
		return r.Context(), false
	}
	ctx := withOAuthBearer(chronauth.WithClaims(r.Context(), &claims.Claims{Subject: userID}))
	if installationID, ok := sidekickInstallationIDFromSession(request.GetSession()); ok {
		ctx = withSidekickInstallationID(ctx, installationID)
	}
	return authz.AsUser(ctx, userID), true
}
