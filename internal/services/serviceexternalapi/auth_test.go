package serviceexternalapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/internal/services/serviceoauth"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeAccessTokenValidator struct {
	identities map[string]serviceoauth.AccessTokenIdentity
}

func (f fakeAccessTokenValidator) ValidateAccessToken(_ context.Context, token string) (serviceoauth.AccessTokenIdentity, error) {
	identity, ok := f.identities[token]
	if !ok {
		return serviceoauth.AccessTokenIdentity{}, errors.New("invalid token")
	}
	return identity, nil
}

func TestExternalAPIOptionalOAuth(t *testing.T) {
	t.Parallel()
	appID := uuid.New()
	s := &Service{}
	s.oauth = fakeAccessTokenValidator{identities: map[string]serviceoauth.AccessTokenIdentity{
		"developer": {DeveloperAppID: appID, Scope: serviceoauth.ScopeExternalRead},
		"sidekick":  {Scope: serviceoauth.ScopeAll},
	}}
	s.setupRoutes()

	request := func(ip, authorization string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(http.MethodGet, "/openapi.json", nil)
		r.Header.Set("X-Forwarded-For", ip)
		if authorization != "" {
			r.Header.Set("Authorization", authorization)
		}
		w := httptest.NewRecorder()
		s.ServeHTTP(w, r)
		return w
	}

	require.Equal(t, http.StatusOK, request("192.0.2.1", "").Code)
	require.Equal(t, http.StatusOK, request("192.0.2.1", "Bearer developer").Code)
	require.Equal(t, http.StatusOK, request("192.0.2.2", "Bearer developer").Code)
	require.Equal(t, http.StatusUnauthorized, request("192.0.2.3", "Bearer sidekick").Code)
	require.Equal(t, http.StatusUnauthorized, request("192.0.2.3", "Bearer invalid").Code)
	require.Equal(t, http.StatusUnauthorized, request("192.0.2.3", "Basic developer").Code)
}
