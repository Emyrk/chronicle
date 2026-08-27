package chronauth

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/sessions"
)

type sessionContextKey struct{}

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
