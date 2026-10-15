package serviceoauth

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

type deviceAuthorizationResponse struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	Scope        string `json:"scope"`
	TokenType    string `json:"token_type"`
}

type oauthErrorResponse struct {
	Error string `json:"error"`
}

func TestDeviceAuthorizationRefreshAndRevocation(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	service := &Service{}
	require.NoError(t, service.configure(ctx, db, "https://chronicle.example"))

	userID := uuid.New()
	service.SetBrowserAuth(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := chronauth.WithClaims(r.Context(), &claims.Claims{Subject: userID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})

	device := postForm[deviceAuthorizationResponse](t, service, "/device/authorize", url.Values{
		"client_id": {ClientID},
		"scope":     {ScopeAll},
	}, http.StatusOK)
	require.NotEmpty(t, device.DeviceCode)
	require.NotEmpty(t, device.UserCode)
	require.Equal(t, "https://chronicle.example/oauth/device", device.VerificationURI)

	pending := postForm[oauthErrorResponse](t, service, "/token", url.Values{
		"grant_type":  {deviceGrantType},
		"device_code": {device.DeviceCode},
		"client_id":   {ClientID},
	}, http.StatusBadRequest)
	require.Equal(t, "authorization_pending", pending.Error)

	approval := postFormRaw(t, service, "/device", url.Values{
		"user_code": {device.UserCode},
		"decision":  {"approve"},
	})
	require.Equal(t, http.StatusOK, approval.Code, approval.Body.String())

	initial := postForm[tokenResponse](t, service, "/token", url.Values{
		"grant_type":  {deviceGrantType},
		"device_code": {device.DeviceCode},
		"client_id":   {ClientID},
	}, http.StatusOK)
	require.NotEmpty(t, initial.AccessToken)
	require.NotEmpty(t, initial.RefreshToken)
	require.Equal(t, ScopeAll, initial.Scope)
	require.Equal(t, "bearer", strings.ToLower(initial.TokenType))
	assertBearerIdentity(t, service, initial.AccessToken, userID, http.StatusNoContent)

	restarted := &Service{}
	require.NoError(t, restarted.configure(ctx, db, "https://chronicle.example"))
	assertBearerIdentity(t, restarted, initial.AccessToken, userID, http.StatusNoContent)
	service = restarted

	rotated := postForm[tokenResponse](t, service, "/token", url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {initial.RefreshToken},
		"client_id":     {ClientID},
	}, http.StatusOK)
	require.NotEqual(t, initial.AccessToken, rotated.AccessToken)
	require.NotEqual(t, initial.RefreshToken, rotated.RefreshToken)
	assertBearerIdentity(t, service, initial.AccessToken, userID, http.StatusUnauthorized)
	assertBearerIdentity(t, service, rotated.AccessToken, userID, http.StatusNoContent)

	revoked := postFormRaw(t, service, "/revoke", url.Values{
		"token":           {rotated.RefreshToken},
		"token_type_hint": {"refresh_token"},
		"client_id":       {ClientID},
	})
	require.Equal(t, http.StatusOK, revoked.Code, revoked.Body.String())
	assertBearerIdentity(t, service, rotated.AccessToken, userID, http.StatusUnauthorized)

	reused := postForm[oauthErrorResponse](t, service, "/token", url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {initial.RefreshToken},
		"client_id":     {ClientID},
	}, http.StatusBadRequest)
	require.NotEmpty(t, reused.Error)
}

func TestConcurrentDeviceCodeRedemptionIsSingleUse(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	service := &Service{}
	require.NoError(t, service.configure(ctx, db, "https://chronicle.example"))
	userID := uuid.New()
	service.SetBrowserAuth(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(chronauth.WithClaims(r.Context(), &claims.Claims{Subject: userID})))
		})
	})

	device := postForm[deviceAuthorizationResponse](t, service, "/device/authorize", url.Values{
		"client_id": {ClientID}, "scope": {ScopeAll},
	}, http.StatusOK)
	approval := postFormRaw(t, service, "/device", url.Values{
		"user_code": {device.UserCode}, "decision": {"approve"},
	})
	require.Equal(t, http.StatusOK, approval.Code, approval.Body.String())

	const attempts = 8
	statuses := make(chan int, attempts)
	responses := make(chan tokenResponse, attempts)
	var wg sync.WaitGroup
	for range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rec := postFormRaw(t, service, "/token", url.Values{
				"grant_type": {deviceGrantType}, "device_code": {device.DeviceCode}, "client_id": {ClientID},
			})
			statuses <- rec.Code
			if rec.Code == http.StatusOK {
				var token tokenResponse
				require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &token))
				responses <- token
			}
		}()
	}
	wg.Wait()
	close(statuses)
	close(responses)

	successes := 0
	for status := range statuses {
		if status == http.StatusOK {
			successes++
		}
	}
	require.Equal(t, 1, successes)
	winner := <-responses
	assertBearerIdentity(t, service, winner.AccessToken, userID, http.StatusNoContent)
}

func TestConcurrentRefreshIsSingleUse(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	service := &Service{}
	require.NoError(t, service.configure(ctx, db, "https://chronicle.example"))
	userID := uuid.New()
	service.SetBrowserAuth(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(chronauth.WithClaims(r.Context(), &claims.Claims{Subject: userID})))
		})
	})

	device := postForm[deviceAuthorizationResponse](t, service, "/device/authorize", url.Values{
		"client_id": {ClientID}, "scope": {ScopeAll},
	}, http.StatusOK)
	approval := postFormRaw(t, service, "/device", url.Values{
		"user_code": {device.UserCode}, "decision": {"approve"},
	})
	require.Equal(t, http.StatusOK, approval.Code, approval.Body.String())
	initial := postForm[tokenResponse](t, service, "/token", url.Values{
		"grant_type": {deviceGrantType}, "device_code": {device.DeviceCode}, "client_id": {ClientID},
	}, http.StatusOK)

	const attempts = 8
	statuses := make(chan int, attempts)
	responses := make(chan tokenResponse, attempts)
	var wg sync.WaitGroup
	for range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rec := postFormRaw(t, service, "/token", url.Values{
				"grant_type": {"refresh_token"}, "refresh_token": {initial.RefreshToken}, "client_id": {ClientID},
			})
			statuses <- rec.Code
			if rec.Code == http.StatusOK {
				var token tokenResponse
				require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &token))
				responses <- token
			}
		}()
	}
	wg.Wait()
	close(statuses)
	close(responses)

	successes := 0
	for status := range statuses {
		if status == http.StatusOK {
			successes++
		}
	}
	require.Equal(t, 1, successes)
	winner := <-responses
	assertBearerIdentity(t, service, initial.AccessToken, userID, http.StatusUnauthorized)
	assertBearerIdentity(t, service, winner.AccessToken, userID, http.StatusNoContent)
}

func TestDeviceAuthorizationRateLimit(t *testing.T) {
	t.Parallel()
	limiter := newDeviceAuthorizationLimiter()
	handler := limiter.middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	for attempt := 0; attempt < deviceAuthorizationBurst; attempt++ {
		req := httptest.NewRequest(http.MethodPost, "/device/authorize", nil)
		req.RemoteAddr = "192.0.2.10:1234"
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		require.Equal(t, http.StatusNoContent, rec.Code)
	}
	req := httptest.NewRequest(http.MethodPost, "/device/authorize", nil)
	req.RemoteAddr = "192.0.2.10:1234"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	require.Equal(t, http.StatusTooManyRequests, rec.Code)
	require.NotEmpty(t, rec.Header().Get("Retry-After"))
}

func TestCleanupExpiredOAuthSessions(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	expired := pgtype.Timestamptz{Time: time.Now().Add(-time.Hour), Valid: true}
	require.NoError(t, db.CreateOAuthDeviceSession(ctx, database.CreateOAuthDeviceSessionParams{
		DeviceSignature: "expired-device",
		UserSignature:   "expired-user",
		Request:         []byte(`{}`),
		ExpiresAt:       expired,
	}))
	require.NoError(t, db.CreateOAuthTokenSession(ctx, database.CreateOAuthTokenSessionParams{
		TokenType: tokenTypeAccess, Signature: "expired-access", RequestID: "expired-request",
		Request: []byte(`{}`), ExpiresAt: expired,
	}))

	store := &storage{db: db}
	require.NoError(t, store.cleanupExpired(ctx))
	devices, err := db.DeleteExpiredOAuthDeviceSessions(ctx)
	require.NoError(t, err)
	require.Zero(t, devices)
	tokens, err := db.DeleteExpiredOAuthTokenSessions(ctx)
	require.NoError(t, err)
	require.Zero(t, tokens)
}

func TestDeviceAuthorizationRejectsOtherScopesAndClients(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	service := &Service{}
	require.NoError(t, service.configure(ctx, db, "https://chronicle.example"))

	wrongScope := postForm[oauthErrorResponse](t, service, "/device/authorize", url.Values{
		"client_id": {ClientID},
		"scope":     {"upload"},
	}, http.StatusBadRequest)
	require.Equal(t, "invalid_scope", wrongScope.Error)

	wrongClient := postForm[oauthErrorResponse](t, service, "/device/authorize", url.Values{
		"client_id": {"other-client"},
		"scope":     {ScopeAll},
	}, http.StatusUnauthorized)
	require.Equal(t, "invalid_client", wrongClient.Error)
}

func assertBearerIdentity(t *testing.T, service *Service, token string, want uuid.UUID, status int) {
	t.Helper()
	handler := service.BearerAuthenticated(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := chronauth.AuthenticatedClaims(r.Context())
		require.True(t, ok)
		require.Equal(t, want, claims.Subject)
		_, ok = authz.ActorFromContext(r.Context())
		require.True(t, ok)
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	require.Equal(t, status, rec.Code, rec.Body.String())
}

func postForm[T any](t *testing.T, handler http.Handler, path string, values url.Values, status int) T {
	t.Helper()
	rec := postFormRaw(t, handler, path, values)
	require.Equal(t, status, rec.Code, rec.Body.String())
	var response T
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response), rec.Body.String())
	return response
}

func postFormRaw(t *testing.T, handler http.Handler, path string, values url.Values) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(values.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	_, _ = io.Copy(io.Discard, rec.Result().Body)
	return rec
}
