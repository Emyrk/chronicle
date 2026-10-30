package chronauth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/markbates/goth/providers/openidConnect"
	"github.com/stretchr/testify/require"
)

func TestContextualRefreshProviderCancelsTokenRequest(t *testing.T) {
	t.Parallel()

	started := make(chan struct{})
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		close(started)
		<-release
	}))
	t.Cleanup(func() {
		close(release)
		server.Close()
	})

	provider := withContextualTokenRefresh(
		&testRefreshProvider{},
		"client-id",
		"client-secret",
		server.URL,
	)
	refresher, ok := provider.(contextualTokenRefresher)
	require.True(t, ok)

	testCtx := testutil.Context(t, testutil.WaitShort)
	refreshCtx, cancel := context.WithCancel(testCtx)
	result := make(chan error, 1)
	go func() {
		_, err := refresher.RefreshTokenContext(refreshCtx, "refresh-token")
		result <- err
	}()

	select {
	case <-started:
	case <-testCtx.Done():
		t.Fatalf("timed out waiting for token request: %v", testCtx.Err())
	}
	cancel()
	select {
	case err := <-result:
		require.ErrorIs(t, err, context.Canceled)
	case <-testCtx.Done():
		t.Fatalf("timed out waiting for token refresh cancellation: %v", testCtx.Err())
	}
}

func TestAuthorizeSessionUnwrapsContextualRefreshProvider(t *testing.T) {
	t.Parallel()

	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"access-token","token_type":"Bearer","expires_in":3600}`))
	}))
	t.Cleanup(tokenServer.Close)

	oidcProvider, err := openidConnect.NewCustomisedURL(
		"client-id",
		"client-secret",
		"https://example.com/callback",
		"https://example.com/authorize",
		tokenServer.URL,
		"https://example.com",
		"https://example.com/userinfo",
		"",
		"openid",
	)
	require.NoError(t, err)

	provider := withContextualTokenRefresh(
		oidcProvider,
		oidcProvider.ClientKey,
		oidcProvider.Secret,
		oidcProvider.OpenIDConfig.TokenEndpoint,
	)
	session := &openidConnect.Session{}

	_, err = authorizeSession(session, provider, url.Values{"code": {"authorization-code"}})
	require.NoError(t, err)
	require.Equal(t, "access-token", session.AccessToken)
}

func TestLinkTargetRoundTrip(t *testing.T) {
	t.Parallel()

	service := &Service{Store: newCookieStore(false)}
	userID := uuid.New()
	sessionID := uuid.New()

	request := httptest.NewRequest(http.MethodGet, "/auth/discord/link", nil)
	recorder := httptest.NewRecorder()
	linkSession, err := service.Store.New(request, LinkSessionName)
	require.NoError(t, err)
	linkSession.Values["user_id"] = userID.String()
	linkSession.Values["session_id"] = sessionID.String()
	linkSession.Values["return_origin"] = "http://turtle.localhost:4000"
	require.NoError(t, linkSession.Save(request, recorder))

	callback := httptest.NewRequest(http.MethodGet, "/auth/discord/callback", nil)
	for _, cookie := range recorder.Result().Cookies() {
		callback.AddCookie(cookie)
	}

	target, ok := service.linkTarget(callback)
	require.True(t, ok)
	require.Equal(t, userID, target.userID)
	require.Equal(t, sessionID, target.sessionID)
	require.Equal(t, "http://turtle.localhost:4000", target.returnOrigin)
}

var _ contextualTokenRefresher = (*contextualRefreshProvider)(nil)
