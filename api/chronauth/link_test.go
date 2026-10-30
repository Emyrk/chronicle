package chronauth

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/markbates/goth"
	"github.com/markbates/goth/providers/discord"
	"github.com/stretchr/testify/require"
)

// TestDiscordLinkFromTenant starts a Discord link on a tenant subdomain. OAuth
// must run on the access URL, and the result must return to the tenant.
func TestDiscordLinkFromTenant(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))

	accessURL, err := url.Parse("http://localhost:4000")
	require.NoError(t, err)
	const tenantOrigin = "http://turtle.localhost:4000"
	d := discord.New("client-id", "client-secret", accessURL.String()+"/auth/discord/callback", "identify")
	d.SetName("discord")
	s := &Service{
		Providers:  goth.Providers{"discord": d},
		Store:      newCookieStore(false),
		Zed:        zed,
		RelayStore: NewRelayCodeStore(zed),
		logger:     slog.Default(),
		accessURL:  accessURL,
		tenantChecker: func(host string) *TenantInfo {
			if host == "turtle.localhost:4000" {
				return &TenantInfo{Slug: "turtle", Name: "Turtle"}
			}
			return nil
		},
	}

	// A password account signed in on the tenant.
	now := time.Now()
	user, err := zed.InsertUser(ctx, database.InsertUserParams{
		ID: uuid.New(), Username: "linker-" + uuid.NewString()[:8], Email: uuid.NewString()[:8] + "@example.com",
		CreatedAt: database.Timestamptz(now), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	authLink, err := zed.InsertUserAuth(ctx, database.InsertUserAuthParams{
		ID: uuid.New(), LinkedID: user.Email, UserID: user.ID, Provider: "password",
		CreatedAt: database.Timestamptz(now), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	session, err := zed.InsertUserAuthSession(ctx, database.InsertUserAuthSessionParams{
		ID: uuid.New(), JwtID: uuid.New(), UserID: user.ID, UserAuthID: authLink.ID,
		ExpiresAt: database.Timestamptz(now.Add(time.Hour)), CreatedAt: database.Timestamptz(now), UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	signedIn := &claims.Claims{Subject: user.ID, SessionID: session.ID, UserAuthID: authLink.ID}

	router := chi.NewRouter()
	router.Get("/auth/{provider}/link", func(w http.ResponseWriter, r *http.Request) {
		s.BeginLinkHandler(w, withState(r, &AuthenticationContext{Claims: signedIn}))
	})
	router.Get("/auth/{provider}/link/begin", s.BeginLinkFromCodeHandler)
	router.Get("/auth/{provider}/callback", func(w http.ResponseWriter, r *http.Request) {
		require.True(t, s.completeLink(w, r), "callback must be treated as a link")
	})
	router.Get("/auth/relay", s.HandleRelay)
	serve := func(target string, cookies []*http.Cookie) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, target, nil)
		for _, c := range cookies {
			req.AddCookie(c)
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}
	startLink := func() []*http.Cookie {
		// The tenant hands off to the access URL with a one-time code.
		rec := serve(tenantOrigin+"/auth/discord/link", nil)
		require.Equal(t, http.StatusTemporaryRedirect, rec.Code, rec.Body.String())
		begin := rec.Header().Get("Location")
		require.True(t, strings.HasPrefix(begin, accessURL.String()+"/auth/discord/link/begin?code="), begin)

		// The access URL stores the link and starts OAuth with its own callback.
		rec = serve(begin, nil)
		require.Equal(t, http.StatusTemporaryRedirect, rec.Code, rec.Body.String())
		require.Contains(t, rec.Header().Get("Location"), url.QueryEscape(accessURL.String()+"/auth/discord/callback"))
		return rec.Result().Cookies()
	}

	// The callback returns to the tenant. OAuth itself fails here because no
	// provider responds, which is reported as a link error, not a lost session.
	rec := serve(accessURL.String()+"/auth/discord/callback?code=x&state=y", startLink())
	require.Equal(t, tenantOrigin+"/account/settings?discord_link=error", rec.Header().Get("Location"))

	// A link code cannot be used to sign in through the relay.
	code := strings.TrimPrefix(serve(tenantOrigin+"/auth/discord/link", nil).Header().Get("Location"), accessURL.String()+"/auth/discord/link/begin?code=")
	rec = serve(tenantOrigin+"/auth/relay?code="+code, nil)
	require.Equal(t, "/login?error=relay_expired", rec.Header().Get("Location"))
	require.Empty(t, rec.Result().Cookies())

	// If the tenant session ends mid-link, the user is told so on the tenant.
	cookies := startLink()
	require.NoError(t, zed.DeleteUserAuthSessionByID(ctx, session.ID))
	rec = serve(accessURL.String()+"/auth/discord/callback?code=x&state=y", cookies)
	require.Equal(t, tenantOrigin+"/account/settings?discord_link=session_expired", rec.Header().Get("Location"))
}

// TestCompleteLinkIgnoresOtherProviders guards against a leftover link cookie
// hijacking sign-in with another provider: the cookie is deleted and sign-in
// continues.
func TestCompleteLinkIgnoresOtherProviders(t *testing.T) {
	t.Parallel()

	s := &Service{Store: newCookieStore(false), logger: slog.Default()}
	setup := httptest.NewRecorder()
	link, err := s.Store.New(httptest.NewRequest(http.MethodGet, "/", nil), LinkSessionName)
	require.NoError(t, err)
	link.Values["user_id"] = uuid.NewString()
	link.Values["session_id"] = uuid.NewString()
	require.NoError(t, link.Save(httptest.NewRequest(http.MethodGet, "/", nil), setup))

	var handled bool
	router := chi.NewRouter()
	router.Get("/{provider}/callback", func(w http.ResponseWriter, r *http.Request) {
		handled = s.completeLink(w, r)
	})
	req := httptest.NewRequest(http.MethodGet, "/oidc/callback", nil)
	for _, c := range setup.Result().Cookies() {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	require.False(t, handled)
	var cleared bool
	for _, c := range rec.Result().Cookies() {
		if c.Name == LinkSessionName && c.MaxAge < 0 {
			cleared = true
		}
	}
	require.True(t, cleared, "link cookie must be deleted in the response")
}
