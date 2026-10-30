package chronauth

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLogoutRequiresSameOriginPost(t *testing.T) {
	t.Parallel()

	store := testCookieStore(t)
	service := &Service{Store: store, logger: slog.Default()}
	cookieReq := httptest.NewRequest(http.MethodGet, "https://forever.chronicleclassic.com/auth/logout", nil)
	cookieRec := httptest.NewRecorder()
	session, err := store.New(cookieReq, OAuthSessionName)
	require.NoError(t, err)
	session.Values["provider"] = "discord"
	require.NoError(t, session.Save(cookieReq, cookieRec))
	cookie := cookieRec.Result().Cookies()[0]

	tests := []struct {
		name, method, origin, site string
		wantStatus                 int
		cleared                    bool
	}{
		{name: "cross-site GET", method: http.MethodGet, site: "cross-site", wantStatus: http.StatusMethodNotAllowed},
		{name: "cross-site POST", method: http.MethodPost, origin: "https://evil.example", site: "cross-site", wantStatus: http.StatusForbidden},
		{name: "same-site subdomain POST", method: http.MethodPost, origin: "https://epoch.chronicleclassic.com", site: "same-site", wantStatus: http.StatusForbidden},
		{name: "missing browser headers", method: http.MethodPost, wantStatus: http.StatusForbidden},
		{name: "same-origin tenant POST", method: http.MethodPost, origin: "https://forever.chronicleclassic.com", site: "same-origin", wantStatus: http.StatusNoContent, cleared: true},
		{name: "same-origin fetch metadata POST", method: http.MethodPost, site: "same-origin", wantStatus: http.StatusNoContent, cleared: true},
		{name: "conflicting origin POST", method: http.MethodPost, origin: "https://evil.example", site: "same-origin", wantStatus: http.StatusForbidden},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequest(tc.method, "https://forever.chronicleclassic.com/auth/logout", nil)
			req.AddCookie(cookie)
			req.Header.Set("X-Forwarded-Proto", "https")
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}
			if tc.site != "" {
				req.Header.Set("Sec-Fetch-Site", tc.site)
			}
			rec := httptest.NewRecorder()
			http.StripPrefix("/auth", service.Handler()).ServeHTTP(rec, req)
			require.Equal(t, tc.wantStatus, rec.Code, rec.Body.String())
			var cleared bool
			for _, responseCookie := range rec.Result().Cookies() {
				if responseCookie.Name == OAuthSessionName && responseCookie.MaxAge < 0 {
					cleared = true
				}
			}
			require.Equal(t, tc.cleared, cleared, "OAuth session cookie changed")
		})
	}
}

func TestLogoutAllowsBearerOnlyClients(t *testing.T) {
	t.Parallel()

	handler := logoutSameOrigin(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodPost, "https://forever.chronicleclassic.com/auth/logout", nil)
	req.Header.Set("Authorization", "Bearer valid-token")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	require.Equal(t, http.StatusNoContent, rec.Code)
}
