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
