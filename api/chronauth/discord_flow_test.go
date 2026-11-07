package chronauth

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth/authkeys"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/serviceauthz"
	"github.com/Emyrk/chronicle/internal/services/testservices"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/markbates/goth"
	"github.com/markbates/goth/providers/discord"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/stretchr/testify/require"
)

type oauthRoundTripper func(*http.Request) (*http.Response, error)

func (f oauthRoundTripper) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

// TestDiscordLoginFromTenant exercises the production OAuth shape: a login
// started on a tenant moves to the access domain, exchanges Discord's code with
// the same callback URL, then relays the new Chronicle session to the tenant.
func TestDiscordLoginFromTenant(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	zed := serviceauthz.Authz(testservices.Authz(t))

	const (
		accessOrigin = "https://legacy.chronicleclassic.com"
		tenantOrigin = "https://octo.chronicleclassic.com"
		callbackURL  = accessOrigin + "/auth/discord/callback"
	)
	discordID := "discord-oauth-flow-" + uuid.NewString()

	now := time.Now()
	user, err := zed.InsertUser(ctx, database.InsertUserParams{
		ID:        uuid.New(),
		Username:  "oauth-flow-" + uuid.NewString()[:8],
		Email:     uuid.NewString()[:8] + "@example.com",
		CreatedAt: database.Timestamptz(now),
		UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)
	_, err = zed.InsertUserAuth(ctx, database.InsertUserAuthParams{
		ID:        uuid.New(),
		LinkedID:  discordID,
		UserID:    user.ID,
		Provider:  "discord",
		CreatedAt: database.Timestamptz(now),
		UpdatedAt: database.Timestamptz(now),
	})
	require.NoError(t, err)

	tokenRequests := make(chan url.Values, 1)
	httpClient := &http.Client{Transport: oauthRoundTripper(func(r *http.Request) (*http.Response, error) {
		var body string
		switch r.URL.String() {
		case discordTokenURL:
			require.NoError(t, r.ParseForm())
			tokenRequests <- r.Form
			body = `{"access_token":"access-token","refresh_token":"refresh-token","token_type":"Bearer","expires_in":3600}`
		case "https://discord.com/api/users/@me":
			require.Equal(t, "Bearer access-token", r.Header.Get("Authorization"))
			body = `{"id":"` + discordID + `","username":"OAuth Flow","email":"oauth@example.com"}`
		default:
			t.Fatalf("unexpected Discord request: %s", r.URL)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": {"application/json"}},
			Body:       io.NopCloser(strings.NewReader(body)),
			Request:    r,
		}, nil
	})}

	discordProvider := discord.New("client-id", "client-secret", callbackURL, "email", "identify")
	discordProvider.HTTPClient = httpClient
	provider := withContextualTokenRefresh(
		discordProvider,
		discordProvider.ClientKey,
		discordProvider.Secret,
		discordProvider.CallbackURL,
		discordTokenURL,
		httpClient,
	)

	privateKey, err := authkeys.GenerateKey()
	require.NoError(t, err)
	sessions, err := NewSessions(SessionOptions{SecretPEM: authkeys.MarshalPrivateKey(privateKey)})
	require.NoError(t, err)
	metrics, err := newAuthMetrics(prometheus.NewRegistry())
	require.NoError(t, err)
	accessURL, err := url.Parse(accessOrigin)
	require.NoError(t, err)
	service := &Service{
		Providers:  goth.Providers{"discord": provider},
		Store:      testCookieStore(t),
		Zed:        zed,
		logger:     slog.Default(),
		sessions:   sessions,
		metrics:    metrics,
		RelayStore: NewRelayCodeStore(zed),
		accessURL:  accessURL,
		tenantChecker: func(host string) *TenantInfo {
			if host == "octo.chronicleclassic.com" {
				return &TenantInfo{Slug: "octo", Name: "OctoWoW"}
			}
			return nil
		},
	}

	router := chi.NewRouter()
	router.Mount("/auth", service.Handler())
	serve := func(target string, cookies []*http.Cookie) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, target, nil).WithContext(ctx)
		for _, cookie := range cookies {
			req.AddCookie(cookie)
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}

	start := serve(tenantOrigin+"/auth/discord?from=%2Fraids%3Ftab%3Dboss", nil)
	require.Equal(t, http.StatusTemporaryRedirect, start.Code, start.Body.String())
	require.Equal(t, accessOrigin+"/auth/discord?from=https%3A%2F%2Focto.chronicleclassic.com%2Fraids%3Ftab%3Dboss", start.Header().Get("Location"))
	require.Empty(t, start.Result().Cookies(), "tenant must not create OAuth state")

	begin := serve(start.Header().Get("Location"), nil)
	require.Equal(t, http.StatusTemporaryRedirect, begin.Code, begin.Body.String())
	authorizeURL, err := url.Parse(begin.Header().Get("Location"))
	require.NoError(t, err)
	require.Equal(t, "discord.com", authorizeURL.Host)
	require.Equal(t, callbackURL, authorizeURL.Query().Get("redirect_uri"))
	require.NotEmpty(t, authorizeURL.Query().Get("state"))

	callback := serve(callbackURL+"?code=authorization-code&state="+url.QueryEscape(authorizeURL.Query().Get("state")), begin.Result().Cookies())
	require.Equal(t, http.StatusTemporaryRedirect, callback.Code, callback.Body.String())
	require.True(t, strings.HasPrefix(callback.Header().Get("Location"), tenantOrigin+"/auth/relay?code="), callback.Header().Get("Location"))
	tokenRequest := <-tokenRequests
	require.Equal(t, "authorization-code", tokenRequest.Get("code"))
	require.Equal(t, callbackURL, tokenRequest.Get("redirect_uri"))

	relay := serve(callback.Header().Get("Location"), nil)
	require.Equal(t, http.StatusTemporaryRedirect, relay.Code, relay.Body.String())
	require.Equal(t, "/raids?tab=boss", relay.Header().Get("Location"))
	require.NotEmpty(t, requireResponseCookie(t, relay, AuthSessionName).Value)
}
