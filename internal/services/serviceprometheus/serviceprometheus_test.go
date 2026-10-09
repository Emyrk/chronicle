package serviceprometheus

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestBearerAuth(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		sharedKey     string
		authorization string
		wantStatus    int
	}{
		{
			name:       "disabled without shared key",
			wantStatus: http.StatusNoContent,
		},
		{
			name:          "valid token",
			sharedKey:     "shared-secret",
			authorization: "Bearer shared-secret",
			wantStatus:    http.StatusNoContent,
		},
		{
			name:          "case insensitive scheme",
			sharedKey:     "shared-secret",
			authorization: "BEARER shared-secret",
			wantStatus:    http.StatusNoContent,
		},
		{
			name:       "missing authorization",
			sharedKey:  "shared-secret",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:          "wrong scheme",
			sharedKey:     "shared-secret",
			authorization: "Basic shared-secret",
			wantStatus:    http.StatusUnauthorized,
		},
		{
			name:          "wrong token",
			sharedKey:     "shared-secret",
			authorization: "Bearer wrong-secret",
			wantStatus:    http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			handler := bearerAuth(tt.sharedKey, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			}))
			req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
			if tt.authorization != "" {
				req.Header.Set("Authorization", tt.authorization)
			}
			res := httptest.NewRecorder()

			handler.ServeHTTP(res, req)

			require.Equal(t, tt.wantStatus, res.Code)
			if tt.wantStatus == http.StatusUnauthorized {
				require.Equal(t, "Bearer", res.Header().Get("WWW-Authenticate"))
			}
		})
	}
}

func TestIPAllow(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		allowlist  string
		remoteAddr string
		forwarded  string
		wantStatus int
	}{
		{
			name:       "disabled without allowlist",
			remoteAddr: "192.0.2.10:1234",
			wantStatus: http.StatusNoContent,
		},
		{
			name:       "direct IP allowed",
			allowlist:  "192.0.2.10, 198.51.100.20,",
			remoteAddr: "192.0.2.10:1234",
			wantStatus: http.StatusNoContent,
		},
		{
			name:       "direct IP denied",
			allowlist:  "192.0.2.10",
			remoteAddr: "198.51.100.20:1234",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "forwarded IP allowed behind private proxy",
			allowlist:  "192.0.2.10",
			remoteAddr: "10.0.0.2:1234",
			forwarded:  "198.51.100.20, 192.0.2.10",
			wantStatus: http.StatusNoContent,
		},
		{
			name:       "forwarded IP ignored from public peer",
			allowlist:  "192.0.2.10",
			remoteAddr: "198.51.100.20:1234",
			forwarded:  "192.0.2.10",
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "unparseable peer denied",
			allowlist:  "192.0.2.10",
			remoteAddr: "not-an-ip",
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			handler, err := ipAllow(tt.allowlist, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			}))
			require.NoError(t, err)

			req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
			req.RemoteAddr = tt.remoteAddr
			if tt.forwarded != "" {
				req.Header.Set("X-Forwarded-For", tt.forwarded)
			}
			res := httptest.NewRecorder()

			handler.ServeHTTP(res, req)

			require.Equal(t, tt.wantStatus, res.Code)
		})
	}
}

func TestIPAllowRejectsInvalidConfiguration(t *testing.T) {
	t.Parallel()

	next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})

	_, err := ipAllow("192.0.2.10,not-an-ip", next)
	require.Error(t, err)

	_, err = ipAllow(", ,", next)
	require.Error(t, err)
}
