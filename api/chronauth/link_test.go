package chronauth

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/api/chronauth/claims"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/gorilla/sessions"
	"github.com/stretchr/testify/require"
)

// TestCompleteLinkClearsStaleCookie guards against a leftover link cookie
// hijacking later OAuth sign-ins: the cookie must be deleted in the response
// and sign-in must continue when nobody is signed in.
func TestCompleteLinkClearsStaleCookie(t *testing.T) {
	t.Parallel()

	userID, sessionID := uuid.New(), uuid.New()
	tests := []struct {
		name     string
		provider string
		claims   *claims.Claims
		handled  bool
		location string
	}{
		{name: "signed out discord", provider: "discord", handled: false},
		{name: "signed in other provider", provider: "oidc", claims: &claims.Claims{Subject: userID, SessionID: sessionID}, handled: false},
		{name: "different session", provider: "discord", claims: &claims.Claims{Subject: userID, SessionID: uuid.New()}, handled: true, location: "/account/settings?discord_link=session_expired"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			s := &Service{Store: sessions.NewCookieStore([]byte("test-secret")), logger: slog.Default()}

			// Build the link cookie the way BeginLinkHandler does.
			setup := httptest.NewRecorder()
			link, err := s.Store.New(httptest.NewRequest(http.MethodGet, "/", nil), LinkSessionName)
			require.NoError(t, err)
			link.Values["user_id"] = userID.String()
			link.Values["session_id"] = sessionID.String()
			require.NoError(t, link.Save(httptest.NewRequest(http.MethodGet, "/", nil), setup))

			var handled bool
			router := chi.NewRouter()
			router.Get("/{provider}/callback", func(w http.ResponseWriter, r *http.Request) {
				handled = s.completeLink(w, r, test.claims)
			})
			req := httptest.NewRequest(http.MethodGet, "/"+test.provider+"/callback", nil)
			for _, c := range setup.Result().Cookies() {
				req.AddCookie(c)
			}
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)

			require.Equal(t, test.handled, handled)
			require.Equal(t, test.location, rec.Header().Get("Location"))
			var cleared bool
			for _, c := range rec.Result().Cookies() {
				if c.Name == LinkSessionName && c.MaxAge < 0 {
					cleared = true
				}
			}
			require.True(t, cleared, "link cookie must be deleted in the response")
		})
	}
}
