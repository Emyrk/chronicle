package serviceoauth

import (
	"context"
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
	"golang.org/x/oauth2"
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

type concurrentTokenResult struct {
	status int
	token  tokenResponse
	err    error
}

type oauthErrorResponse struct {
	Error string `json:"error"`
}

func TestDevicePageRendering(t *testing.T) {
	t.Parallel()
	for _, testCase := range []struct {
		name string
		data devicePageData
		want []string
	}{
		{
			name: "authorization form",
			data: devicePageData{State: devicePageAuthorize, UserCode: "ABCD-EFGH", Title: "Link this device", Message: "Confirm the code."},
			want: []string{`action="/oauth/device"`, `value="ABCD-EFGH"`, "Authorize device"},
		},
		{
			name: "approved",
			data: devicePageData{State: devicePageApproved, Title: "Device linked", Message: "Sidekick is connected."},
			want: []string{"Device linked", "Authorization complete", "return to Chronicle Sidekick"},
		},
		{
			name: "denied",
			data: devicePageData{State: devicePageDenied, Title: "Authorization denied", Message: "Sidekick was not connected."},
			want: []string{"Authorization denied", "No access was granted"},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			renderDevicePage(recorder, http.StatusOK, testCase.data)
			response := recorder.Result()
			defer func() { _ = response.Body.Close() }()
			require.Equal(t, "text/html; charset=utf-8", response.Header.Get("Content-Type"))
			require.Equal(t, "no-store", response.Header.Get("Cache-Control"))
			require.Equal(t, "DENY", response.Header.Get("X-Frame-Options"))
			for _, want := range testCase.want {
				require.Contains(t, recorder.Body.String(), want)
			}
			require.NotContains(t, recorder.Body.String(), `{"message":`)
		})
	}
}

func TestDevicePageRedirectsSignedOutUsersToLogin(t *testing.T) {
	t.Parallel()
	service := &Service{}
	service.SetBrowserAuth()

	recorder := httptest.NewRecorder()
	service.serveBrowserApproval(recorder, httptest.NewRequest(http.MethodGet, "/oauth/device?user_code=ABCD-EFGH", nil))
	require.Equal(t, http.StatusSeeOther, recorder.Code)
	require.Equal(t, "/login?from=%2Foauth%2Fdevice%3Fuser_code%3DABCD-EFGH", recorder.Header().Get("Location"))
}

func TestDeviceAuthorizationRefreshAndRevocation(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	service := &Service{}
	require.NoError(t, service.configure(ctx, db, "https://chronicle.example"))

	userID := uuid.New()
	_, err := db.InsertUser(ctx, database.InsertUserParams{ID: userID, Username: "sidekick-user"})
	require.NoError(t, err)
	installationID := uuid.New()
	service.SetBrowserAuth(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := chronauth.WithClaims(r.Context(), &claims.Claims{Subject: userID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})

	device := postForm[deviceAuthorizationResponse](t, service, "/device/authorize", url.Values{
		"client_id":               {ClientID},
		"scope":                   {ScopeAll},
		installationIDParam:       {installationID.String()},
		installationNameParam:     {"Raid laptop"},
		installationPlatformParam: {"windows"},
		installationVersionParam:  {"1.2.3"},
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
	require.Equal(t, "text/html; charset=utf-8", approval.Header().Get("Content-Type"))
	require.Contains(t, approval.Body.String(), "Device linked")
	require.Contains(t, approval.Body.String(), "return to Chronicle Sidekick")

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
	assertOAuthAuthenticationMiddleware(t, service, initial.AccessToken, userID, http.StatusNoContent)
	installations, err := db.ListSidekickInstallationsByUser(ctx, userID)
	require.NoError(t, err)
	require.Len(t, installations, 1)
	require.Equal(t, installationID, installations[0].ID)
	require.Equal(t, "Raid laptop", installations[0].Name)
	require.Equal(t, "windows", installations[0].Platform)
	require.Equal(t, "1.2.3", installations[0].Version)
	assertBearerSidekickIdentity(t, service, initial.AccessToken, installationID)

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
	assertBearerSidekickIdentity(t, service, rotated.AccessToken, installationID)

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
	results := make(chan concurrentTokenResult, attempts)
	var wg sync.WaitGroup
	for range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rec := postFormRawContext(ctx, service, "/token", url.Values{
				"grant_type": {deviceGrantType}, "device_code": {device.DeviceCode}, "client_id": {ClientID},
			})
			result := concurrentTokenResult{status: rec.Code}
			if rec.Code == http.StatusOK {
				result.err = json.Unmarshal(rec.Body.Bytes(), &result.token)
			}
			results <- result
		}()
	}
	waitGroupWithContext(t, ctx, &wg)
	close(results)

	successes := 0
	var winner tokenResponse
	for result := range results {
		if result.status == http.StatusOK {
			require.NoError(t, result.err)
			successes++
			winner = result.token
		}
	}
	require.Equal(t, 1, successes)
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
	results := make(chan concurrentTokenResult, attempts)
	var wg sync.WaitGroup
	for range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rec := postFormRawContext(ctx, service, "/token", url.Values{
				"grant_type": {"refresh_token"}, "refresh_token": {initial.RefreshToken}, "client_id": {ClientID},
			})
			result := concurrentTokenResult{status: rec.Code}
			if rec.Code == http.StatusOK {
				result.err = json.Unmarshal(rec.Body.Bytes(), &result.token)
			}
			results <- result
		}()
	}
	waitGroupWithContext(t, ctx, &wg)
	close(results)

	successes := 0
	var winner tokenResponse
	for result := range results {
		if result.status == http.StatusOK {
			require.NoError(t, result.err)
			successes++
			winner = result.token
		}
	}
	require.Equal(t, 1, successes)
	assertBearerIdentity(t, service, initial.AccessToken, userID, http.StatusUnauthorized)
	assertBearerIdentity(t, service, winner.AccessToken, userID, http.StatusNoContent)
}

func TestAuthenticationMiddlewarePassesChronicleJWTsThrough(t *testing.T) {
	t.Parallel()

	service := &Service{}
	handler := service.AuthenticationMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, ok := chronauth.AuthenticatedClaims(r.Context())
		require.False(t, ok)
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/v1/whoami", nil)
	req.Header.Set("Authorization", "Bearer header.payload.signature")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusNoContent, rec.Code)
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

func TestDeviceAuthorizationWithGoOAuthClient(t *testing.T) {
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

	server := httptest.NewServer(service)
	t.Cleanup(server.Close)
	config := &oauth2.Config{
		ClientID: ClientID,
		Scopes:   []string{ScopeAll},
		Endpoint: oauth2.Endpoint{
			DeviceAuthURL: server.URL + "/device/authorize",
			TokenURL:      server.URL + "/token",
			AuthStyle:     oauth2.AuthStyleInParams,
		},
	}

	device, err := config.DeviceAuth(ctx)
	require.NoError(t, err)
	require.NotEmpty(t, device.DeviceCode)
	require.NotEmpty(t, device.UserCode)

	approval, err := http.PostForm(server.URL+"/device", url.Values{
		"user_code": {device.UserCode},
		"decision":  {"approve"},
	})
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, approval.StatusCode)
	require.NoError(t, approval.Body.Close())

	// The production response asks clients to poll every five seconds. Reduce
	// only the test client's delay so the interoperability test stays fast.
	device.Interval = 1
	token, err := config.DeviceAccessToken(ctx, device)
	require.NoError(t, err)
	require.True(t, token.Valid())
	require.NotEmpty(t, token.RefreshToken)
	assertBearerIdentity(t, service, token.AccessToken, userID, http.StatusNoContent)

	oldAccessToken := token.AccessToken
	oldRefreshToken := token.RefreshToken
	token.Expiry = time.Now().Add(-time.Minute)
	rotated, err := config.TokenSource(ctx, token).Token()
	require.NoError(t, err)
	require.NotEqual(t, oldAccessToken, rotated.AccessToken)
	require.NotEqual(t, oldRefreshToken, rotated.RefreshToken)
	assertBearerIdentity(t, service, oldAccessToken, userID, http.StatusUnauthorized)
	assertBearerIdentity(t, service, rotated.AccessToken, userID, http.StatusNoContent)
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

func assertBearerSidekickIdentity(t *testing.T, service *Service, token string, want uuid.UUID) {
	t.Helper()
	handler := service.BearerAuthenticated(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		installationID, ok := SidekickInstallationID(r.Context())
		require.True(t, ok)
		require.Equal(t, want, installationID)
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
}

func assertOAuthAuthenticationMiddleware(t *testing.T, service *Service, token string, want uuid.UUID, status int) {
	t.Helper()
	handler := service.AuthenticationMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := chronauth.AuthenticatedClaims(r.Context())
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		require.Equal(t, want, claims.Subject)
		_, ok = authz.ActorFromContext(r.Context())
		require.True(t, ok)
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/v1/raidlogs/logs/upload-v2", nil)
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
	return postFormRawContext(context.Background(), handler, path, values)
}

func postFormRawContext(ctx context.Context, handler http.Handler, path string, values url.Values) *httptest.ResponseRecorder {
	req := httptest.NewRequestWithContext(ctx, http.MethodPost, path, strings.NewReader(values.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	result := rec.Result()
	_, _ = io.Copy(io.Discard, result.Body)
	_ = result.Body.Close()
	return rec
}

func waitGroupWithContext(t *testing.T, ctx context.Context, wg *sync.WaitGroup) {
	t.Helper()
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
		t.Fatalf("concurrent requests did not finish: %v", ctx.Err())
	}
}
