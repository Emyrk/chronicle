package chronauth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/google/uuid"
	"github.com/gorilla/sessions"
	"github.com/stretchr/testify/require"
)

type sessionContextKey struct{}

func TestDevCookieStoreDoesNotRequireSecureTransport(t *testing.T) {
	t.Parallel()

	store := testCookieStore(t)
	req := httptest.NewRequest("GET", "http://localhost:4000", nil)
	res := httptest.NewRecorder()

	session, err := store.New(req, OAuthSessionName)
	if err != nil {
		t.Fatalf("new session: %v", err)
	}
	session.Values["provider"] = "dev"
	if err := session.Save(req, res); err != nil {
		t.Fatalf("save session: %v", err)
	}

	cookies := res.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("cookie count = %d, want 1", len(cookies))
	}
	if cookies[0].Secure {
		t.Fatal("development session cookie unexpectedly requires secure transport")
	}
	if cookies[0].SameSite == http.SameSiteNoneMode {
		t.Fatal("development session cookie uses SameSite=None without secure transport")
	}
}

func TestSessionRegistryFollowsRequestContextClone(t *testing.T) {
	t.Parallel()

	store := sessions.NewCookieStore([]byte("test-secret"))
	req := httptest.NewRequest("GET", "https://example.com", nil)

	first, err := store.Get(req, AuthSessionName)
	if err != nil {
		t.Fatalf("get first session: %v", err)
	}
	first.Values["marker"] = "retained"

	cloned := req.WithContext(context.WithValue(req.Context(), sessionContextKey{}, true))
	second, err := store.Get(cloned, AuthSessionName)
	if err != nil {
		t.Fatalf("get session from cloned request: %v", err)
	}

	if first != second {
		t.Fatal("session registry did not follow the request context clone")
	}
	if got := second.Values["marker"]; got != "retained" {
		t.Fatalf("session value = %v, want retained", got)
	}
}

func TestAuthenticationMiddlewarePreservesExistingClaims(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	service := &Service{}
	handler := service.AuthenticationMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got, ok := AuthenticatedClaims(r.Context())
		require.True(t, ok)
		require.Equal(t, userID, got.Subject)
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "https://example.com/api/v1/raidlogs/logs/upload-v2", nil)
	req.Header.Set("Authorization", "Bearer oauth-access-token")
	req = req.WithContext(WithClaims(req.Context(), &claims.Claims{Subject: userID}))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusNoContent, rec.Code)
}
