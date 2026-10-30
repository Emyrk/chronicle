package chronauth

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/hkdf"
	"crypto/sha256"
	"database/sql"
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
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/chroniclemail"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/sessions"
	"github.com/markbates/goth"
	"github.com/markbates/goth/gothic"
	"github.com/markbates/goth/providers/discord"
	"github.com/markbates/goth/providers/openidConnect"
	"golang.org/x/sync/singleflight"
)

const (
	JWTCookieName  = "JWT"
	XSRFCookieName = "XSRF-TOKEN"

	OAuthSessionName = "chronicle_oauth_session"
	AuthSessionName  = "chronicle_auth_session"
	LinkSessionName  = "chronicle_link_session"

	// linkSessionLifetime bounds how long an unfinished Discord link attempt
	// can affect OAuth callbacks.
	linkSessionLifetime = 10 * time.Minute

	// linkRelayProvider marks relay codes that start a Discord link, and
	// linkCompleteRelayProvider marks codes that finish one. Neither signs in.
	linkRelayProvider         = "discord_link"
	linkCompleteRelayProvider = "discord_link_complete"
)

var (
	errProviderAlreadyLinked   = errors.New("provider already linked to this account")
	errProviderLinkedElsewhere = errors.New("provider identity belongs to another account")
)

type Options struct {
	AccessURL *url.URL
	DevServer bool
	Zed       *authz.Authz
	Discord   DiscordOAuth
	Bot       *chroniclebot.Bot
	Mailer    *chroniclemail.Mailer

	WhatsNewCurrentID string
	Sessions          SessionOptions

	// TenantChecker resolves a host to tenant info for cross-subdomain auth relay.
	// Nil means relay is disabled (e.g. dev mode without primary domain).
	TenantChecker func(host string) *TenantInfo
}

type Service struct {
	Providers goth.Providers
	Store     *sessions.CookieStore
	// legacyStore migrates session cookies signed with the old public key.
	legacyStore *sessions.CookieStore
	Zed         *authz.Authz
	Bot         *chroniclebot.Bot
	logger      *slog.Logger

	sessions          *Sessions
	mailer            *chroniclemail.Mailer
	whatsNewCurrentID string
	devMode           bool

	// RelayStore holds one-time codes for cross-subdomain auth relay.
	RelayStore    *RelayCodeStore
	accessURL     *url.URL
	tenantChecker func(host string) *TenantInfo

	registerMu       sync.Mutex
	registerAttempts map[string]time.Time

	loginMu       sync.Mutex
	loginAttempts map[string]time.Time

	refreshes singleflight.Group
	metrics   *authMetrics
}

// newCookieStore signs and encrypts cookies with keys derived from secret, the
// JWT signing key, so cookies share its lifetime: stable across deploys and
// instances when it is configured, and per process when it is generated.
func newCookieStore(secure bool, secret []byte) (*sessions.CookieStore, error) {
	if len(secret) == 0 {
		return nil, errors.New("cookie store needs a secret")
	}
	hashKey, err := hkdf.Key(sha256.New, secret, nil, "chronicle cookie authentication", 64)
	if err != nil {
		return nil, fmt.Errorf("derive cookie authentication key: %w", err)
	}
	blockKey, err := hkdf.Key(sha256.New, secret, nil, "chronicle cookie encryption", 32)
	if err != nil {
		return nil, fmt.Errorf("derive cookie encryption key: %w", err)
	}
	return configureCookieStore(sessions.NewCookieStore(hashKey, blockKey), secure), nil
}

// newLegacyCookieStore reads cookies signed before keys were derived from the
// JWT secret. Its key was public, so it is only used to migrate the session
// cookie, whose JWT is verified on its own.
func newLegacyCookieStore(secure bool) *sessions.CookieStore {
	return configureCookieStore(sessions.NewCookieStore([]byte("secret")), secure)
}

// newCookie starts a cookie that replaces any existing one with the same name.
// An existing cookie that can't be decoded, such as one signed with an old
// key, is overwritten rather than treated as an error.
func (s *Service) newCookie(r *http.Request, name string) *sessions.Session {
	session, _ := s.Store.New(r, name)
	return session
}

func configureCookieStore(store *sessions.CookieStore, secure bool) *sessions.CookieStore {
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
		providers[d.Name()] = withContextualTokenRefresh(
			d, d.ClientKey, d.Secret, discordTokenURL,
		)
	}

	secure := opts.AccessURL.Scheme == "https"
	store, err := newCookieStore(secure, opts.Sessions.SecretPEM)
	if err != nil {
		return nil, err
	}
	if !store.Options.Secure {
		logger.Warn("using non-secure cookie store; this is not recommended for production environments")
	}

	sess, err := NewSessions(opts.Sessions)
	if err != nil {
		return nil, fmt.Errorf("new sessions: %w", err)
	}
	metrics, err := newAuthMetrics(opts.Sessions.Registry)
	if err != nil {
		return nil, err
	}

	if opts.DevServer {
		devProv, err := fakeoidc.Run(ctx, opts.AccessURL)
		if err != nil {
			return nil, fmt.Errorf("mock oidc: %w", err)
		}

		if oidcProvider, ok := devProv.(*openidConnect.Provider); ok {
			devProv = withContextualTokenRefresh(
				devProv,
				oidcProvider.ClientKey,
				oidcProvider.Secret,
				oidcProvider.OpenIDConfig.TokenEndpoint,
			)
		}
		providers[devProv.Name()] = devProv
	}

	return &Service{
		Providers:         providers,
		Store:             store,
		legacyStore:       newLegacyCookieStore(secure),
		logger:            logger.With(slog.String("service", "auth")),
		sessions:          sess,
		Bot:               opts.Bot,
		Zed:               opts.Zed,
		mailer:            opts.Mailer,
		whatsNewCurrentID: opts.WhatsNewCurrentID,
		devMode:           opts.DevServer,
		RelayStore:        NewRelayCodeStore(opts.Zed),
		accessURL:         opts.AccessURL,
		tenantChecker:     opts.TenantChecker,
		registerAttempts:  make(map[string]time.Time),
		loginAttempts:     make(map[string]time.Time),
		metrics:           metrics,
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
	_, err = authorizeSession(sess, provider, params)
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
		// Get returns a usable session even when the cookie can't be decoded,
		// such as one signed with an old key, so it is still deleted.
		session, _ := s.Store.Get(req, cookieName)
		session.Options.MaxAge = -1
		session.Values = make(map[interface{}]interface{})
		if err := session.Save(req, res); err != nil {
			return errors.New("could not delete user session ")
		}
	}

	return nil
}

// logoutOAuth clears only the OAuth state cookie without touching the auth
// session. Used in CompleteUserAuth so the primary domain's existing auth
// cookie survives relay flows to tenant subdomains.
func (s *Service) logoutOAuth(res http.ResponseWriter, req *http.Request) error {
	session, _ := s.Store.Get(req, OAuthSessionName)
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

	from := s.safeAuthRedirect(req.URL.Query().Get("from"))

	sess := s.newCookie(req, "from")
	sess.Values["from"] = from
	err = sess.Save(req, w)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	http.Redirect(w, req, u, http.StatusTemporaryRedirect)
}

func (s *Service) BeginLinkHandler(w http.ResponseWriter, r *http.Request) {
	claims := MustAuthenticatedClaims(r.Context())
	provider, ok := s.provider(w, r)
	if !ok {
		return
	}
	if provider.Name() != "discord" {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, fmt.Errorf("provider %s cannot be linked", provider.Name()))
		return
	}
	if _, err := s.Zed.GetUserAuthLinkByUserIDAndProvider(r.Context(), database.GetUserAuthLinkByUserIDAndProviderParams{
		UserID: claims.Subject, Provider: "password",
	}); errors.Is(err, sql.ErrNoRows) {
		httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Discord can only be connected to a password account"})
		return
	} else if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	// OAuth always completes on the access URL, so a link started on a tenant
	// subdomain hands its session to the access URL with a one-time code and
	// returns to the tenant afterwards.
	returnOrigin := ""
	if s.accessURL != nil && r.Host != s.accessURL.Host {
		origin, _, _, ok := s.parseRelayTarget(s.accessURL.Scheme + "://" + r.Host + "/")
		if !ok {
			httpapi.Write(r.Context(), w, http.StatusBadRequest, chroniclesdk.Response{Message: "Discord can't be connected from this site"})
			return
		}
		returnOrigin = origin
	}
	authSession, err := s.Zed.GetUserAuthSessionByID(r.Context(), claims.SessionID)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	code, err := s.RelayStore.Generate(r.Context(), &RelayCode{
		Session:      authSession,
		Provider:     linkRelayProvider,
		RedirectPath: returnOrigin,
		ExpiresAt:    time.Now().Add(60 * time.Second),
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	begin := "/auth/" + provider.Name() + "/link/begin?code=" + url.QueryEscape(code)
	if s.accessURL != nil {
		begin = strings.TrimRight(s.accessURL.String(), "/") + begin
	}
	http.Redirect(w, r, begin, http.StatusTemporaryRedirect)
}

// BeginLinkFromCodeHandler runs on the access URL. It redeems the code from
// BeginLinkHandler, remembers which account is linking, and starts OAuth here
// so the OAuth state and callback share a domain.
func (s *Service) BeginLinkFromCodeHandler(w http.ResponseWriter, r *http.Request) {
	provider, ok := s.provider(w, r)
	if !ok {
		return
	}
	relay, err := s.RelayStore.Redeem(r.Context(), r.URL.Query().Get("code"))
	if err != nil || relay.Provider != linkRelayProvider || provider.Name() != "discord" {
		http.Redirect(w, r, "/account/settings?discord_link=session_expired", http.StatusTemporaryRedirect)
		return
	}

	session := s.newCookie(r, LinkSessionName)
	session.Options.MaxAge = int(linkSessionLifetime.Seconds())
	session.Values["user_id"] = relay.Session.UserID.String()
	session.Values["session_id"] = relay.Session.ID.String()
	session.Values["return_origin"] = relay.RedirectPath
	if err := session.Save(r, w); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	s.BeginAuthHandler(w, r)
}

type linkTarget struct {
	userID    uuid.UUID
	sessionID uuid.UUID
	// returnOrigin is the tenant origin to return to, or empty for the access URL.
	returnOrigin string
}

func (s *Service) linkTarget(r *http.Request) (linkTarget, bool) {
	session, err := s.Store.Get(r, LinkSessionName)
	if err != nil {
		return linkTarget{}, false
	}
	userID, err := uuid.Parse(fmt.Sprint(session.Values["user_id"]))
	if err != nil {
		return linkTarget{}, false
	}
	sessionID, err := uuid.Parse(fmt.Sprint(session.Values["session_id"]))
	if err != nil {
		return linkTarget{}, false
	}
	returnOrigin, _ := session.Values["return_origin"].(string)
	return linkTarget{userID: userID, sessionID: sessionID, returnOrigin: returnOrigin}, true
}

func (s *Service) clearLinkTarget(w http.ResponseWriter, r *http.Request) {
	session, _ := s.Store.Get(r, LinkSessionName)
	session.Options.MaxAge = -1
	session.Values = make(map[interface{}]interface{})
	_ = session.Save(r, w)
}

func (s *Service) linkProviderIdentity(ctx context.Context, accountID uuid.UUID, user goth.User) error {
	return s.Zed.InTx(ctx, func(tx *authz.AuthzTX) error {
		locked, err := tx.LockUsersForUpdate(ctx, []uuid.UUID{accountID})
		if err != nil {
			return err
		}
		if len(locked) != 1 {
			return sql.ErrNoRows
		}
		current, err := tx.GetUserAuthLinkByUserIDAndProvider(ctx, database.GetUserAuthLinkByUserIDAndProviderParams{
			UserID:   accountID,
			Provider: user.Provider,
		})
		if err == nil {
			if current.LinkedID == user.UserID {
				return nil
			}
			return errProviderAlreadyLinked
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		existing, err := tx.GetUserAuthByLinkedID(ctx, database.GetUserAuthByLinkedIDParams{
			LinkedID: user.UserID,
			Provider: user.Provider,
		})
		if err == nil {
			if existing.UserID == accountID {
				return nil
			}
			return errProviderLinkedElsewhere
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		now := time.Now()
		_, err = tx.InsertUserAuth(ctx, database.InsertUserAuthParams{
			ID:        uuid.New(),
			LinkedID:  user.UserID,
			UserID:    accountID,
			Provider:  user.Provider,
			CreatedAt: database.Timestamptz(now),
			UpdatedAt: database.Timestamptz(now),
		})
		return err
	}, nil)
}

// completeLink handles the OAuth callback of a Discord link on the access URL.
// It only proves which Discord account the browser controls; the link itself
// is made by CompleteLinkHandler on the site that started it, which checks
// that the same signed-in session is finishing it. That stops a link started
// by one account from being completed in another person's browser.
func (s *Service) completeLink(w http.ResponseWriter, r *http.Request) bool {
	target, linking := s.linkTarget(r)
	if !linking {
		return false
	}
	// Clear before writing any response: a Set-Cookie added after the redirect
	// is dropped, which would leave every later OAuth callback stuck here.
	s.clearLinkTarget(w, r)
	// On another provider's callback the link cookie is stale. Continue with a
	// normal sign-in.
	if chi.URLParam(r, "provider") != "discord" {
		return false
	}

	settings := target.returnOrigin + "/account/settings?discord_link="
	session, err := s.Zed.GetUserAuthSessionByID(r.Context(), target.sessionID)
	if err != nil || session.UserID != target.userID {
		http.Redirect(w, r, settings+"session_expired", http.StatusTemporaryRedirect)
		return true
	}

	user, err := s.CompleteUserAuth(w, r)
	if err != nil || user.Provider != "discord" || user.UserID == "" {
		if err != nil {
			s.logger.Warn("complete Discord account link", slog.String("error", err.Error()))
		}
		http.Redirect(w, r, settings+"error", http.StatusTemporaryRedirect)
		return true
	}

	code, err := s.RelayStore.Generate(r.Context(), &RelayCode{
		Session:   session,
		Provider:  linkCompleteRelayProvider,
		LinkedID:  user.UserID,
		ExpiresAt: time.Now().Add(60 * time.Second),
	})
	if err != nil {
		s.logger.Error("create Discord link completion code", slog.String("error", err.Error()))
		http.Redirect(w, r, settings+"error", http.StatusTemporaryRedirect)
		return true
	}
	http.Redirect(w, r, target.returnOrigin+"/auth/discord/link/complete?code="+url.QueryEscape(code), http.StatusTemporaryRedirect)
	return true
}

// CompleteLinkHandler runs on the site that started a Discord link. It links
// the Discord identity only when the signed-in session is the one that started
// the link.
func (s *Service) CompleteLinkHandler(w http.ResponseWriter, r *http.Request) {
	redirect := func(result string) {
		http.Redirect(w, r, "/account/settings?discord_link="+url.QueryEscape(result), http.StatusTemporaryRedirect)
	}
	relay, err := s.RelayStore.Redeem(r.Context(), r.URL.Query().Get("code"))
	if err != nil || relay.Provider != linkCompleteRelayProvider || relay.LinkedID == "" {
		redirect("session_expired")
		return
	}
	claims, ok := AuthenticatedClaims(r.Context())
	if !ok || claims == nil || claims.SessionID != relay.Session.ID || claims.Subject != relay.Session.UserID {
		s.logger.Warn("Discord link completed by a different session",
			slog.String("link_session_id", relay.Session.ID.String()))
		redirect("session_expired")
		return
	}

	accountID := relay.Session.UserID
	err = s.linkProviderIdentity(r.Context(), accountID, goth.User{Provider: "discord", UserID: relay.LinkedID})
	switch {
	case err == nil:
		if s.Bot != nil {
			if syncErr := s.Bot.EnqueueEntitlementRoleSync(r.Context(), accountID); syncErr != nil {
				s.logger.Warn("enqueue Discord entitlement role sync after linking", slog.String("error", syncErr.Error()))
			}
			// Check Discord server membership perks (such as bonus storage) now,
			// as a Discord sign-in does, instead of waiting for the weekly check.
			if checkErr := s.Bot.ReactivateMembershipGrantCheckOnLogin(r.Context(), accountID); checkErr != nil {
				s.logger.Warn("activate Discord membership grant check after linking", slog.String("error", checkErr.Error()))
			}
		}
		redirect("success")
	case errors.Is(err, errProviderLinkedElsewhere):
		redirect("linked_elsewhere")
	case errors.Is(err, errProviderAlreadyLinked):
		redirect("already_linked")
	default:
		s.logger.Error("link Discord account", slog.String("error", err.Error()))
		redirect("error")
	}
}

func (s *Service) Handler() http.Handler {
	mux := chi.NewRouter()
	mux.Group(func(r chi.Router) {
		r.Use(
			s.AuthenticationMiddleware,
			s.Authenticated(true),
		)

		mux.With(s.AuthenticationMiddleware, s.Authenticated(false)).Get("/{provider}/link", s.BeginLinkHandler)
		mux.Get("/{provider}/link/begin", s.BeginLinkFromCodeHandler)
		mux.With(s.AuthenticationMiddleware, s.Authenticated(true)).Get("/{provider}/link/complete", s.CompleteLinkHandler)

		mux.Get("/{provider}", func(w http.ResponseWriter, r *http.Request) {
			cl, ok := AuthenticatedClaims(r.Context())
			if ok && cl != nil {
				// Already authenticated. If "from" is a tenant URL,
				// relay the existing session directly without re-doing OAuth.
				from := s.safeAuthRedirect(r.URL.Query().Get("from"))
				if from != "/" {
					if relayTarget, redirectPath, tenant, relayOK := s.parseRelayTarget(from); relayOK {
						session, err := s.Zed.GetUserAuthSessionByID(r.Context(), cl.SessionID)
						if err == nil {
							code, err := s.RelayStore.Generate(r.Context(), &RelayCode{
								Session:      session,
								Provider:     cl.Provider,
								TenantSlug:   tenant.Slug,
								TenantName:   tenant.Name,
								RedirectPath: redirectPath,
								ExpiresAt:    time.Now().Add(60 * time.Second),
							})
							if err != nil {
								s.logger.Error("relay: failed to generate relay code", slog.String("error", err.Error()))
								http.Error(w, "failed to create auth relay", http.StatusInternalServerError)
								return
							}
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

			if s.completeLink(w, r) {
				return
			}
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

			// Read the "from" redirect target.
			redirectTo := "/"
			redirect, _ := s.Store.Get(r, "from")
			if redirect != nil {
				raw := redirect.Values["from"]
				fromStr, _ := raw.(string)
				redirectTo = s.safeAuthRedirect(fromStr)
				delete(redirect.Values, "from")
				_ = redirect.Save(r, w)
			}

			// For new authentications, check if we need to relay to a tenant subdomain.
			if isNewAuth {
				if relayTarget, redirectPath, tenant, relayOK := s.parseRelayTarget(redirectTo); relayOK {
					code, err := s.RelayStore.Generate(r.Context(), &RelayCode{
						Session:      authSession,
						Provider:     authProvider,
						TenantSlug:   tenant.Slug,
						TenantName:   tenant.Name,
						RedirectPath: redirectPath,
						ExpiresAt:    time.Now().Add(60 * time.Second),
					})
					if err != nil {
						s.logger.Error("relay: failed to generate relay code", slog.String("error", err.Error()))
						http.Error(w, "failed to create auth relay", http.StatusInternalServerError)
						return
					}

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

		// Do not let GET /logout fall through to the /{provider} OAuth route.
		mux.Get("/logout", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusMethodNotAllowed)
		})
		mux.With(logoutSameOrigin, s.AuthenticationMiddleware, s.Authenticated(true)).Post("/logout", func(w http.ResponseWriter, r *http.Request) {
			if claims, ok := AuthenticatedClaims(r.Context()); ok {
				if err := s.Zed.DeleteUserAuthSessionByID(r.Context(), claims.SessionID); err != nil {
					s.logger.Warn("delete session during logout", slog.String("error", err.Error()))
				}
			}
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

	auth := s.newCookie(r, AuthSessionName)

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

	relay, err := s.RelayStore.Redeem(r.Context(), code)
	if err == nil && (relay.Provider == linkRelayProvider || relay.Provider == linkCompleteRelayProvider) {
		// Link codes only start or finish a Discord link; they never sign anyone in.
		err = errRelayCodeInvalid
	}
	if errors.Is(err, errRelayCodeInvalid) {
		// Code is invalid, expired, or already consumed.
		http.Redirect(w, r, "/login?error=relay_expired", http.StatusTemporaryRedirect)
		return
	}
	if err != nil {
		s.logger.Error("relay: failed to redeem relay code", slog.String("error", err.Error()))
		http.Error(w, "failed to redeem auth relay", http.StatusInternalServerError)
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

// safeAuthRedirect only accepts local redirects or the known tenant origin used
// by the cross-subdomain relay. Recheck the cookie on callback as well as the
// incoming query, since older cookies may contain an unchecked target.
func (s *Service) safeAuthRedirect(from string) string {
	if from == "" || strings.TrimSpace(from) != from || strings.ContainsAny(from, "\\\r\n\t") || strings.HasPrefix(from, "//") {
		return "/"
	}
	parsed, err := url.Parse(from)
	if err != nil || parsed.Opaque != "" || parsed.User != nil {
		return "/"
	}
	if !parsed.IsAbs() && parsed.Host == "" {
		return from
	}
	if s.accessURL == nil || !strings.EqualFold(parsed.Scheme, s.accessURL.Scheme) || parsed.Host == "" {
		return "/"
	}
	if strings.EqualFold(parsed.Host, s.accessURL.Host) {
		return from
	}
	// The relay redirects using the decoded path; encoded slashes must not
	// turn that path into a protocol-relative URL on the tenant domain.
	if strings.HasPrefix(parsed.Path, "//") || strings.Contains(parsed.Path, "\\") {
		return "/"
	}
	if _, _, _, relay := s.parseRelayTarget(from); relay {
		return from
	}
	return "/"
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
