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

	"github.com/Emyrk/chronicle/api/chronauth/fakeoidc"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/database"
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
	AccessURL    *url.URL
	DevServer    bool
	Database     database.Store
	Discord      DiscordOAuth
	DiscordBot   *chroniclebot.Bot
	BlockSignups bool

	Sessions SessionOptions
}

type Service struct {
	Providers       goth.Providers
	Store           *sessions.CookieStore
	Bot             *chroniclebot.Bot
	Database        database.Store
	logger          *slog.Logger
	disallowSignups bool

	sessions *Sessions
}

func New(ctx context.Context, logger *slog.Logger, opts Options) (*Service, error) {
	if opts.DevServer && !strings.Contains(opts.AccessURL.String(), "localhost") {
		return nil, fmt.Errorf("dev server can only be used with localhost access url, not %s", opts.AccessURL)
	}
	if opts.Database == nil {
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

	store := sessions.NewCookieStore([]byte("secret"))
	store.Options.HttpOnly = true
	store.Options.Secure = opts.AccessURL.Scheme == "https"
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
		Bot:             opts.DiscordBot,
		Providers:       providers,
		Store:           store,
		Database:        opts.Database,
		logger:          logger.With(slog.String("service", "auth")),
		sessions:        sess,
		disallowSignups: opts.BlockSignups,
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
	defer s.Logout(res, req)
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
			s.Authenticated(true),
		)

		mux.Get("/{provider}", func(w http.ResponseWriter, r *http.Request) {
			cl, ok := AuthenticatedClaims(r.Context())
			if ok && cl != nil {
				return // Already authenticated
			}

			s.BeginAuthHandler(w, r)
		})

		mux.Get("/{provider}/callback", func(w http.ResponseWriter, r *http.Request) {
			cl, ok := AuthenticatedClaims(r.Context())
			if !ok || cl == nil {
				// If authenticated, skip all this
				_, ok = s.provider(w, r)
				if !ok {
					return
				}

				user, err := s.CompleteUserAuth(w, r)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}

				// TODO: Upsert user, make an access token, and send that token as a cookie.
				//   Switch to chronicle handling the auth
				session, ok := s.Signup(w, r, user)
				if !ok {
					return
				}

				err = s.SetSessionCookie(w, r, user.Provider, session)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
			}

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
			http.Redirect(w, r, redirectTo, http.StatusTemporaryRedirect)
		})

		mux.Get("/logout", func(w http.ResponseWriter, r *http.Request) {
			_ = s.Logout(w, r)
			httpapi.Write(r.Context(), w, http.StatusNoContent, nil)
		})
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
