package chronauth

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth/fakeoidc"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/chroniclemail"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/go-chi/chi/v5"
	"github.com/gorilla/sessions"
	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
	"github.com/markbates/goth/providers/discord"
)

const (
	JWTCookieName  = "JWT"
	XSRFCookieName = "XSRF-TOKEN"

	OAuthSessionName = "chronicle_oauth_session"
	AuthSessionName  = "chronicle_auth_session"
)

type Options struct {
	AccessURL *url.URL
	DevServer bool
	Zed       *authz.Authz
	Discord   DiscordOAuth
	Bot       *chroniclebot.Bot
	Mailer    *chroniclemail.Mailer

	Sessions SessionOptions
	APIKeys  APIKeyOptions

	// TenantChecker resolves a host to tenant info for cross-subdomain auth relay.
	// Nil means relay is disabled (e.g. dev mode without primary domain).
	TenantChecker func(host string) *TenantInfo
}

type Service struct {
	Providers goth.Providers
	Store     *sessions.CookieStore
	Zed       *authz.Authz
	Bot       *chroniclebot.Bot
	logger    *slog.Logger

	sessions *Sessions
	mailer   *chroniclemail.Mailer
	devMode  bool

	// RelayStore holds one-time codes for cross-subdomain auth relay.
	RelayStore    *RelayCodeStore
	accessURL     *url.URL
	tenantChecker func(host string) *TenantInfo

	registerMu       sync.Mutex
	registerAttempts map[string]time.Time

	loginMu       sync.Mutex
	loginAttempts map[string]time.Time

	apiKeyLimiter *apiKeyLimiter
}

func newCookieStore(secure bool) *sessions.CookieStore {
	store := sessions.NewCookieStore([]byte("secret"))
	store.Options.HttpOnly = true
	store.Options.Secure = secure
	// sessions v1.4 defaults to SameSite=None and Secure. Preserve the prior
	// browser behavior so development cookies work over localhost HTTP.
	store.Options.SameSite = http.SameSiteDefaultMode
	return store
}

func New(ctx context.Context, logger *slog.Logger, opts Options) (*Service, error) {
	//nolint:staticcheck
	if opts.DevServer && !(strings.Contains(opts.AccessURL.String(), "localhost") || strings.Contains(opts.AccessURL.String(), "192.168.1")) {
		return nil, fmt.Errorf("dev server can only be used with localhost access url, not %s", opts.AccessURL)
	}
	if opts.Zed == nil {
		return nil, fmt.Errorf("no database store provided")
	}

	providers := make(goth.Providers)
	if opts.Discord.ClientID != "" {
		const name = "discord"
		dcallback, err := opts.AccessURL.Parse(fmt.Sprintf("/auth/%s/callback", name))
		if err != nil {
			return nil, fmt.Errorf("parse discord auth callback URL: %s", err)
		}
		d := discord.New(opts.Discord.ClientID, opts.Discord.ClientSecret, dcallback.String(),
			"email", "identify",
		)
		d.SetName(name)
		providers[d.Name()] = d
	}

	store := newCookieStore(opts.AccessURL.Scheme == "https")
	if !store.Options.Secure {
		logger.Warn("using non-secure cookie store; this is not recommended for production environments")
	}

	sess, err := NewSessions(opts.Sessions)
	if err != nil {
		return nil, fmt.Errorf("new sessions: %w", err)
	}

	if opts.DevServer {
		devProv, err := fakeoidc.Run(ctx, opts.AccessURL)
		if err != nil {
			return nil, fmt.Errorf("mock oidc: %w", err)
		}

		providers[devProv.Name()] = devProv
	}

	return &Service{
		Providers:        providers,
		Store:            store,
		logger:           logger.With(slog.String("service", "auth")),
		sessions:         sess,
		Bot:              opts.Bot,
		Zed:              opts.Zed,
		mailer:           opts.Mailer,
		devMode:          opts.DevServer,
		RelayStore:       NewRelayCodeStore(),
		accessURL:        opts.AccessURL,
		tenantChecker:    opts.TenantChecker,
		registerAttempts: make(map[string]time.Time),
		loginAttempts:    make(map[string]time.Time),
		apiKeyLimiter:    newAPIKeyLimiter(opts.APIKeys),
	}, nil
}

func (s *Service) GetProvider(r *http.Request) (goth.Provider, error) {
	name := chi.URLParam(r, "provider")
	provider, ok := s.Providers[name]
	if !ok {
		return nil, fmt.Errorf("provider %s not found", name)
	}
	return provider, nil
}

func (s *Service) StoreInSession(key string, value string, req *http.Request, res http.ResponseWriter) error {
	session, _ := s.Store.New(req, OAuthSessionName)

	if err := updateSessionValue(session, key, value); err != nil {
		return err
	}

	return session.Save(req, res)
}

func (s *Service) GetFromSession(key string, req *http.Request) (string, error) {
	session, _ := s.Store.Get(req, OAuthSessionName)
	value, err := getSessionValue(session, key)
	if err != nil {
		return "", errors.New("could not find a matching session for this request")
	}

	return value, nil
}

func (s *Service) GetAuthURL(res http.ResponseWriter, req *http.Request) (string, error) {
	provider, err := s.GetProvider(req)
	if err != nil {
		return "", err
	}
	sess, err := provider.BeginAuth(gothic.SetState(req))
	if err != nil {
		return "", err
	}

	u, err := sess.GetAuthURL()
	if err != nil {
		return "", err
	}

	err = s.StoreInSession(provider.Name(), sess.Marshal(), req, res)

	if err != nil {
		return "", err
	}

	return u, err
}

func (s *Service) CompleteUserAuth(res http.ResponseWriter, req *http.Request) (goth.User, error) {
	provider, err := s.GetProvider(req)
	if err != nil {
		return goth.User{}, err
	}

	value, err := s.GetFromSession(provider.Name(), req)
	if err != nil {
		return goth.User{}, err
	}
	//nolint:errcheck
	defer s.logoutOAuth(res, req)
	sess, err := provider.UnmarshalSession(value)
	if err != nil {
		return goth.User{}, err
	}

	err = validateState(req, sess)
	if err != nil {
		return goth.User{}, err
	}

	user, err := provider.FetchUser(sess)
	if err == nil {
		// user can be found with existing session data
		return user, err
	}

	params := req.URL.Query()
	if params.Encode() == "" && req.Method == "POST" {
		_ = req.ParseForm()
		params = req.Form
	}

	// get new token and retry fetch
	_, err = sess.Authorize(provider, params)
	if err != nil {
		return goth.User{}, err
	}

	err = s.StoreInSession(provider.Name(), sess.Marshal(), req, res)

	if err != nil {
		return goth.User{}, err
	}

	gu, err := provider.FetchUser(sess)
	if err != nil {
		return goth.User{}, fmt.Errorf("fetch user: %w", err)
	}

	s.logger.Debug("new oauth login",
		slog.String("provider", provider.Name()),
		slog.String("email", gu.Email),
		slog.String("name", gu.Name),
		slog.String("id", gu.UserID),
	)
	return gu, err
}

// Logout invalidates a user session.
func (s *Service) Logout(res http.ResponseWriter, req *http.Request) error {
	for _, cookieName := range []string{AuthSessionName, OAuthSessionName} {
		session, err := s.Store.Get(req, cookieName)
		if err != nil {
			// Nothing to really do
			continue
		}
		session.Options.MaxAge = -1
		session.Values = make(map[interface{}]interface{})
		err = session.Save(req, res)
		if err != nil {
			return errors.New("could not delete user session ")
		}
	}

	return nil
}

// logoutOAuth clears only the OAuth state cookie without touching the auth
// session. Used in CompleteUserAuth so the primary domain's existing auth
// cookie survives relay flows to tenant subdomains.
func (s *Service) logoutOAuth(res http.ResponseWriter, req *http.Request) error {
	session, err := s.Store.Get(req, OAuthSessionName)
	if err != nil {
		return nil
	}
	session.Options.MaxAge = -1
	session.Values = make(map[interface{}]interface{})
	if err := session.Save(req, res); err != nil {
		return fmt.Errorf("could not delete OAuth session: %w", err)
	}
	return nil
}

func (s *Service) BeginAuthHandler(w http.ResponseWriter, req *http.Request) {
	u, err := s.GetAuthURL(w, req)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = fmt.Fprintln(w, err)
		return
	}

	from := req.URL.Query().Get("from")
	if from == "" {
		from = "/"
	}

	sess, err := s.Store.New(req, "from")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	sess.Values["from"] = from
	err = sess.Save(req, w)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	http.Redirect(w, req, u, http.StatusTemporaryRedirect)
}

func (s *Service) Handler() http.Handler {
	mux := chi.NewRouter()
	mux.Group(func(r chi.Router) {
		r.Use(
			s.AuthenticationMiddleware,
			s.Authenticated(true),
		)

		mux.Get("/{provider}", func(w http.ResponseWriter, r *http.Request) {
			cl, ok := AuthenticatedClaims(r.Context())
			if ok && cl != nil {
				// Already authenticated. If "from" is a tenant URL,
				// relay the existing session directly without re-doing OAuth.
				from := r.URL.Query().Get("from")
				if from != "" {
					if relayTarget, redirectPath, tenant, relayOK := s.parseRelayTarget(from); relayOK {
						session, err := s.Zed.GetUserAuthSessionByID(r.Context(), cl.SessionID)
						if err == nil {
							code := s.RelayStore.Generate(&RelayCode{
								Session:      session,
								Provider:     cl.Provider,
								TenantSlug:   tenant.Slug,
								TenantName:   tenant.Name,
								RedirectPath: redirectPath,
								ExpiresAt:    time.Now().Add(60 * time.Second),
							})
							http.Redirect(w, r, relayTarget+"/auth/relay?code="+code, http.StatusTemporaryRedirect)
							return
						}
						s.logger.Warn("relay: session lookup failed for authenticated user, falling through to OAuth",
							slog.String("error", err.Error()))
						// Fall through to normal OAuth flow
					}
				}
				return // Already authenticated, not a relay target
			}

			s.BeginAuthHandler(w, r)
		})

		mux.Get("/{provider}/callback", func(w http.ResponseWriter, r *http.Request) {
			var authSession database.UserAuthSession
			var authProvider string
			var isNewAuth bool

			cl, ok := AuthenticatedClaims(r.Context())
			if !ok || cl == nil {
				_, provOK := s.provider(w, r)
				if !provOK {
					return
				}

				user, err := s.CompleteUserAuth(w, r)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}

				sess, signedUp := s.Signup(w, r, user)
				if !signedUp {
					return
				}
				authSession = sess
				authProvider = user.Provider
				isNewAuth = true
			}

			// Read the "from" redirect target.
			redirectTo := "/"
			redirect, _ := s.Store.Get(r, "from")
			if redirect != nil {
				raw := redirect.Values["from"]
				fromStr, _ := raw.(string)
				if fromStr != "" {
					redirectTo = fromStr
				}
				delete(redirect.Values, "from")
				_ = redirect.Save(r, w)
			}

			// For new authentications, check if we need to relay to a tenant subdomain.
			if isNewAuth {
				if relayTarget, redirectPath, tenant, relayOK := s.parseRelayTarget(redirectTo); relayOK {
					code := s.RelayStore.Generate(&RelayCode{
						Session:      authSession,
						Provider:     authProvider,
						TenantSlug:   tenant.Slug,
						TenantName:   tenant.Name,
						RedirectPath: redirectPath,
						ExpiresAt:    time.Now().Add(60 * time.Second),
					})

					// Also set the session cookie on the primary domain so
					// the user stays logged in here too.
					if err := s.SetSessionCookie(w, r, authProvider, authSession); err != nil {
						s.logger.Error("relay: failed to set primary session cookie",
							slog.String("error", err.Error()))
						// Non-fatal: the relay will still work for the tenant.
					}

					http.Redirect(w, r, relayTarget+"/auth/relay?code="+code, http.StatusTemporaryRedirect)
					return
				}

				// Normal flow — set cookie on current domain.
				err := s.SetSessionCookie(w, r, authProvider, authSession)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			}

			http.Redirect(w, r, redirectTo, http.StatusTemporaryRedirect)
		})

		mux.Get("/logout", func(w http.ResponseWriter, r *http.Request) {
			_ = s.Logout(w, r)
			httpapi.Write(r.Context(), w, http.StatusNoContent, nil)
		})
	})

	// Relay endpoint for cross-subdomain auth (no auth required — the code IS the auth).
	mux.Get("/relay", s.HandleRelay)

	// Password auth routes (no authentication required)
	mux.Post("/password/register", s.PasswordRegister)
	mux.Post("/password/login", s.PasswordLogin)
	mux.Get("/password/verify-email", s.VerifyEmail)
	mux.Post("/password/forgot-password", s.ForgotPassword)
	mux.Post("/password/reset-password", s.ResetPassword)

	mux.Group(func(r chi.Router) {
		r.Use(
			s.AuthenticationMiddleware,
			s.Authenticated(false),
		)
		r.Post("/password/resend-verification", s.ResendVerification)
	})

	mux.Get("/list", func(w http.ResponseWriter, r *http.Request) {
		list := make([]string, 0, len(s.Providers))
		for _, p := range s.Providers {
			list = append(list, p.Name())
		}
		sort.Strings(list)
		httpapi.Write(r.Context(), w, http.StatusOK, list)
	})

	return mux
}

func (s *Service) SetSessionCookie(w http.ResponseWriter, r *http.Request, provider string, session database.UserAuthSession) error {
	ctx := r.Context()
	jwt, err := s.sessions.CreateSession(ctx, provider, session)
	if err != nil {
		return err
	}

	auth, err := s.Store.New(r, AuthSessionName)
	if err != nil {
		return err
	}

	auth.Values["jwt"] = jwt
	err = auth.Save(r, w)
	if err != nil {
		return err
	}
	s.clearRefreshFailed(w)
	return nil
}

func (s *Service) provider(w http.ResponseWriter, r *http.Request) (goth.Provider, bool) {
	name := chi.URLParam(r, "provider")
	provider, ok := s.Providers[name]
	if !ok {
		httpapi.Write(r.Context(), w, http.StatusInternalServerError, fmt.Errorf("provider %s not found", name))
		return nil, false
	}
	return provider, ok
}

func updateSessionValue(session *sessions.Session, key, value string) error {
	var b bytes.Buffer
	gz := gzip.NewWriter(&b)
	if _, err := gz.Write([]byte(value)); err != nil {
		return err
	}
	if err := gz.Flush(); err != nil {
		return err
	}
	if err := gz.Close(); err != nil {
		return err
	}

	session.Values[key] = b.String()
	return nil
}

func getSessionValue(session *sessions.Session, key string) (string, error) {
	value := session.Values[key]
	if value == nil {
		return "", fmt.Errorf("could not find a matching session for this request")
	}

	rdata := strings.NewReader(value.(string))
	r, err := gzip.NewReader(rdata)
	if err != nil {
		return "", err
	}
	s, err := io.ReadAll(r)
	if err != nil {
		return "", err
	}

	return string(s), nil
}

// validateState ensures that the state token param from the original
// AuthURL matches the one included in the current (callback) request.
func validateState(req *http.Request, sess goth.Session) error {
	rawAuthURL, err := sess.GetAuthURL()
	if err != nil {
		return err
	}

	authURL, err := url.Parse(rawAuthURL)
	if err != nil {
		return err
	}

	reqState := gothic.GetState(req)

	originalState := authURL.Query().Get("state")
	if originalState != "" && (originalState != reqState) {
		return errors.New("state token mismatch")
	}
	return nil
}

// HandleRelay redeems a one-time relay code and sets the session cookie on the
// current (tenant subdomain) domain, then redirects to the stored path.
func (s *Service) HandleRelay(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Redirect(w, r, "/login?error=missing_code", http.StatusTemporaryRedirect)
		return
	}

	relay, err := s.RelayStore.Redeem(code)
	if err != nil {
		// Code is invalid, expired, or already consumed.
		http.Redirect(w, r, "/login?error=relay_expired", http.StatusTemporaryRedirect)
		return
	}

	if err := s.SetSessionCookie(w, r, relay.Provider, relay.Session); err != nil {
		s.logger.Error("relay: failed to set session cookie", slog.String("error", err.Error()))
		http.Error(w, "failed to set session", http.StatusInternalServerError)
		return
	}

	redirectPath := relay.RedirectPath
	if redirectPath == "" {
		redirectPath = "/"
	}
	http.Redirect(w, r, redirectPath, http.StatusTemporaryRedirect)
}

// parseRelayTarget checks if `from` is a full URL pointing to a known tenant
// subdomain. If so it returns the target origin, the path portion, and tenant
// info. When relay is not needed (relative path, same domain, or unknown host)
// it returns isRelay=false.
func (s *Service) parseRelayTarget(from string) (origin string, path string, tenant *TenantInfo, isRelay bool) {
	if s.tenantChecker == nil {
		return "", "", nil, false
	}

	parsed, err := url.Parse(from)
	if err != nil || parsed.Host == "" {
		// Relative path — same domain, no relay needed.
		return "", "", nil, false
	}

	// Same host as the access URL — no relay needed.
	if s.accessURL != nil && parsed.Host == s.accessURL.Host {
		return "", "", nil, false
	}

	info := s.tenantChecker(parsed.Host)
	if info == nil {
		// Unknown host — refuse to relay (open-redirect prevention).
		s.logger.Warn("relay: from URL points to unknown host, ignoring",
			slog.String("from", from))
		return "", "", nil, false
	}

	targetOrigin := parsed.Scheme + "://" + parsed.Host
	targetPath := parsed.Path
	if parsed.RawQuery != "" {
		targetPath += "?" + parsed.RawQuery
	}
	if targetPath == "" {
		targetPath = "/"
	}

	return targetOrigin, targetPath, info, true
}
