package serviceoauth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestDeveloperAppCredentialsAndRefresh(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	owner := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: owner, Username: "developer"})
	require.NoError(t, err)
	service := &Service{}
	require.NoError(t, service.configure(ctx, db, "https://chronicle.example"))
	service.SetBrowserAuth(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(chronauth.WithClaims(r.Context(), &claims.Claims{Subject: owner})))
		})
	})
	create := func() *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/apps", strings.NewReader(`{"name":"Analysis bot"}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		service.ServeHTTP(rec, req)
		return rec
	}
	rec := create()
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var app developerAppResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &app))
	require.NotEmpty(t, app.ClientSecret)
	require.Equal(t, developerClientID(app.ID), app.ClientID)
	require.Equal(t, http.StatusConflict, create().Code)
	stored, err := db.GetOAuthDeveloperAppByID(ctx, app.ID)
	require.NoError(t, err)
	require.NotContains(t, string(stored.SecretHash), app.ClientSecret)
	require.NotContains(t, string(stored.SecretHash), "Analysis bot")
	bad := postForm[oauthErrorResponse](t, service, "/token", url.Values{
		"grant_type": {"client_credentials"}, "client_id": {app.ClientID}, "client_secret": {"bad"}, "scope": {ScopeExternalRead},
	}, http.StatusUnauthorized)
	require.Equal(t, "invalid_client", bad.Error)
	token := postForm[tokenResponse](t, service, "/token", url.Values{
		"grant_type": {"client_credentials"}, "client_id": {app.ClientID}, "client_secret": {app.ClientSecret}, "scope": {ScopeExternalRead},
	}, http.StatusOK)
	require.NotEmpty(t, token.RefreshToken)
	identity, err := service.ValidateAccessToken(ctx, token.AccessToken)
	require.NoError(t, err)
	require.Equal(t, owner, identity.UserID)
	require.Equal(t, app.ID, identity.DeveloperAppID)
	require.Equal(t, ScopeExternalRead, identity.Scope)
	require.Equal(t, app.ClientID, identity.ClientID)
	require.NotEqual(t, uuid.Nil, app.ID)
	require.Error(t, func() error { _, err := service.ValidateAccessToken(ctx, token.RefreshToken); return err }())
	valid := postForm[struct {
		Active   bool   `json:"active"`
		ClientID string `json:"client_id"`
	}](t, service, "/validate", url.Values{"token": {token.AccessToken}}, http.StatusOK)
	require.True(t, valid.Active)
	require.Equal(t, app.ClientID, valid.ClientID)
	require.False(t, postForm[struct {
		Active bool `json:"active"`
	}](t, service, "/validate", url.Values{"token": {token.RefreshToken}}, http.StatusOK).Active)
	require.False(t, postForm[struct {
		Active bool `json:"active"`
	}](t, service, "/validate", url.Values{"token": {"not-an-oauth-token"}}, http.StatusOK).Active)
	restarted := &Service{}
	require.NoError(t, restarted.configure(ctx, db, "https://chronicle.example"))
	_, err = restarted.ValidateAccessToken(ctx, token.AccessToken)
	require.NoError(t, err)
	rotated := postForm[tokenResponse](t, restarted, "/token", url.Values{
		"grant_type": {"refresh_token"}, "refresh_token": {token.RefreshToken},
	}, http.StatusOK)
	require.NotEqual(t, token.AccessToken, rotated.AccessToken)
	require.NotEqual(t, token.RefreshToken, rotated.RefreshToken)
	_, err = restarted.ValidateAccessToken(ctx, token.AccessToken)
	require.Error(t, err)
	_, err = restarted.ValidateAccessToken(ctx, rotated.AccessToken)
	require.NoError(t, err)
	reused := postForm[oauthErrorResponse](t, restarted, "/token", url.Values{
		"grant_type": {"refresh_token"}, "refresh_token": {token.RefreshToken},
	}, http.StatusUnauthorized)
	require.NotEmpty(t, reused.Error)
	_, err = restarted.ValidateAccessToken(ctx, rotated.AccessToken)
	require.Error(t, err, "reuse must revoke the entire grant")
	rec = httptest.NewRecorder()
	restarted.SetBrowserAuth(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(chronauth.WithClaims(r.Context(), &claims.Claims{Subject: owner})))
		})
	})
	mounted := chi.NewRouter()
	mounted.Mount("/oauth", restarted)
	mounted.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/oauth/apps/rotate", bytes.NewReader(nil)))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var updated developerAppResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &updated))
	require.NotEqual(t, app.ClientSecret, updated.ClientSecret)
	_, err = restarted.ValidateAccessToken(ctx, rotated.AccessToken)
	require.Error(t, err)
	list := httptest.NewRecorder()
	restarted.ServeHTTP(list, httptest.NewRequest(http.MethodGet, "/apps", nil))
	require.Equal(t, http.StatusOK, list.Code)
	require.NotContains(t, list.Body.String(), updated.ClientSecret)
	require.NotContains(t, list.Body.String(), "secret_hash")
	wrongScope := postForm[oauthErrorResponse](t, restarted, "/token", url.Values{
		"grant_type": {"client_credentials"}, "client_id": {app.ClientID}, "client_secret": {updated.ClientSecret}, "scope": {ScopeAll},
	}, http.StatusBadRequest)
	require.Equal(t, "invalid_scope", wrongScope.Error)
	newToken := postForm[tokenResponse](t, restarted, "/token", url.Values{
		"grant_type": {"client_credentials"}, "client_id": {app.ClientID}, "client_secret": {updated.ClientSecret}, "scope": {ScopeExternalRead},
	}, http.StatusOK)
	deleted := httptest.NewRecorder()
	restarted.ServeHTTP(deleted, httptest.NewRequest(http.MethodDelete, "/apps", nil))
	require.Equal(t, http.StatusNoContent, deleted.Code, deleted.Body.String())
	_, err = restarted.ValidateAccessToken(ctx, newToken.AccessToken)
	require.Error(t, err)

}
