package chronauth

import (
	"encoding/json"
	"errors"
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
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"
)

// fakeDiscord stands in for Discord: its session already knows the user, so
// the callback succeeds without network calls while state is still checked.
type fakeDiscord struct{ userID string }

type fakeDiscordSession struct{ AuthURL, UserID string }

func (p *fakeDiscord) Name() string              { return "discord" }
func (*fakeDiscord) SetName(string)              {}
func (*fakeDiscord) Debug(bool)                  {}
func (*fakeDiscord) RefreshTokenAvailable() bool { return false }
func (*fakeDiscord) RefreshToken(string) (*oauth2.Token, error) {
	return nil, errors.New("not supported")
}
func (p *fakeDiscord) BeginAuth(state string) (goth.Session, error) {
	return &fakeDiscordSession{AuthURL: "https://discord.test/authorize?state=" + url.QueryEscape(state), UserID: p.userID}, nil
}
func (*fakeDiscord) UnmarshalSession(data string) (goth.Session, error) {
	sess := &fakeDiscordSession{}
	return sess, json.Unmarshal([]byte(data), sess)
}
func (*fakeDiscord) FetchUser(sess goth.Session) (goth.User, error) {
	return goth.User{Provider: "discord", UserID: sess.(*fakeDiscordSession).UserID}, nil
}
func (s *fakeDiscordSession) GetAuthURL() (string, error) { return s.AuthURL, nil }
func (s *fakeDiscordSession) Marshal() string {
	b, _ := json.Marshal(s)
	return string(b)
}
func (*fakeDiscordSession) Authorize(goth.Provider, goth.Params) (string, error) { return "", nil }

// TestDiscordLinkFromTenant runs Discord links started on a tenant subdomain.
// OAuth runs on the access URL, but the link is only made back on the tenant
// by the same session that started it.
func TestDiscordLinkFromTenant(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))

	accessURL, err := url.Parse("http://localhost:4000")
	require.NoError(t, err)
	const tenantOrigin = "http://turtle.localhost:4000"
	victimDiscordID := "discord-" + uuid.NewString()
	s := &Service{
		Providers:  goth.Providers{"discord": &fakeDiscord{userID: victimDiscordID}},
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

	// newAccount creates a password account signed in on the tenant.
	newAccount := func() (*claims.Claims, uuid.UUID) {
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
		return &claims.Claims{Subject: user.ID, SessionID: session.ID, UserAuthID: authLink.ID}, user.ID
	}
	linkedDiscord := func(userID uuid.UUID) string {
		link, err := zed.GetUserAuthLinkByUserIDAndProvider(ctx, database.GetUserAuthLinkByUserIDAndProviderParams{UserID: userID, Provider: "discord"})
		if err != nil {
			return ""
		}
		return link.LinkedID
	}

	// signedIn is the browser's tenant session for the next request.
	var signedIn *claims.Claims
	router := chi.NewRouter()
	asSignedIn := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			h(w, withState(r, &AuthenticationContext{Claims: signedIn}))
		}
	}
	router.Get("/auth/{provider}/link", asSignedIn(s.BeginLinkHandler))
	router.Get("/auth/{provider}/link/begin", s.BeginLinkFromCodeHandler)
	router.Get("/auth/{provider}/callback", func(w http.ResponseWriter, r *http.Request) {
		require.True(t, s.completeLink(w, r), "callback must be treated as a link")
	})
	router.Get("/auth/{provider}/link/complete", asSignedIn(s.CompleteLinkHandler))
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
	// startLink returns the access URL link/begin address for the signed-in account.
	startLink := func() string {
		rec := serve(tenantOrigin+"/auth/discord/link", nil)
		require.Equal(t, http.StatusTemporaryRedirect, rec.Code, rec.Body.String())
		begin := rec.Header().Get("Location")
		require.True(t, strings.HasPrefix(begin, accessURL.String()+"/auth/discord/link/begin?code="), begin)
		return begin
	}
	// authorizeDiscord follows begin through Discord to the callback and returns
	// where the callback sends the browser.
	authorizeDiscord := func(begin string) string {
		rec := serve(begin, nil)
		require.Equal(t, http.StatusTemporaryRedirect, rec.Code, rec.Body.String())
		authURL, err := url.Parse(rec.Header().Get("Location"))
		require.NoError(t, err)
		rec = serve(accessURL.String()+"/auth/discord/callback?code=x&state="+url.QueryEscape(authURL.Query().Get("state")), rec.Result().Cookies())
		return rec.Header().Get("Location")
	}

	attacker, attackerID := newAccount()
	victim, victimID := newAccount()

	// An attacker starts a link and gets the victim to finish Discord OAuth in
	// the victim's browser. The victim's session must not complete it.
	signedIn = attacker
	begin := startLink()
	complete := authorizeDiscord(begin)
	require.True(t, strings.HasPrefix(complete, tenantOrigin+"/auth/discord/link/complete?code="), complete)
	signedIn = victim
	rec := serve(complete, nil)
	require.Equal(t, "/account/settings?discord_link=session_expired", rec.Header().Get("Location"))
	require.Empty(t, linkedDiscord(attackerID), "attacker must not get the victim's Discord")
	require.Empty(t, linkedDiscord(victimID))

	// Signed out, the completion is refused too.
	signedIn = attacker
	complete = authorizeDiscord(startLink())
	signedIn = nil
	require.Equal(t, "/account/settings?discord_link=session_expired", serve(complete, nil).Header().Get("Location"))
	require.Empty(t, linkedDiscord(attackerID))

	// The owner finishing their own link gets it, and the code is single use.
	signedIn = victim
	complete = authorizeDiscord(startLink())
	require.Equal(t, "/account/settings?discord_link=success", serve(complete, nil).Header().Get("Location"))
	require.Equal(t, victimDiscordID, linkedDiscord(victimID))
	require.Equal(t, "/account/settings?discord_link=session_expired", serve(complete, nil).Header().Get("Location"))

	// Neither kind of link code signs anyone in through the relay.
	signedIn = attacker
	startCode := strings.TrimPrefix(startLink(), accessURL.String()+"/auth/discord/link/begin?code=")
	rec = serve(tenantOrigin+"/auth/relay?code="+startCode, nil)
	require.Equal(t, "/login?error=relay_expired", rec.Header().Get("Location"))
	require.Empty(t, rec.Result().Cookies())
	completeCode := strings.TrimPrefix(authorizeDiscord(startLink()), tenantOrigin+"/auth/discord/link/complete?code=")
	rec = serve(tenantOrigin+"/auth/relay?code="+completeCode, nil)
	require.Equal(t, "/login?error=relay_expired", rec.Header().Get("Location"))
	require.Empty(t, rec.Result().Cookies())

	// If the session ends while the user is on Discord, they are told so on
	// the tenant.
	rec = serve(startLink(), nil)
	authURL, err := url.Parse(rec.Header().Get("Location"))
	require.NoError(t, err)
	require.NoError(t, zed.DeleteUserAuthSessionByID(ctx, attacker.SessionID))
	rec = serve(accessURL.String()+"/auth/discord/callback?code=x&state="+url.QueryEscape(authURL.Query().Get("state")), rec.Result().Cookies())
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
