package api_test

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/Emyrk/chronicle/api"
)

func TestCors(t *testing.T) {
	t.Parallel()

	prodURL, _ := url.Parse("https://chronicleclassic.com")

	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	tests := []struct {
		name        string
		origin      string
		method      string
		wantAllowed bool
	}{
		{"production origin OPTIONS allowed", "https://chronicleclassic.com", "OPTIONS", true},
		{"production origin GET disallowed", "https://chronicleclassic.com", "GET", false},
		{"production origin POST disallowed", "https://chronicleclassic.com", "POST", false},
		{"random origin rejected", "https://evil.com", "OPTIONS", false},
		{"no origin", "", "OPTIONS", false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			handler := api.Cors(prodURL)(ok)
			req := httptest.NewRequest(http.MethodOptions, "/api/v1/whoami", nil)
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("Access-Control-Request-Method", tc.method)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			acao := rec.Header().Get("Access-Control-Allow-Origin")
			if tc.wantAllowed {
				assert.Equal(t, tc.origin, acao)
			} else {
				assert.Empty(t, acao)
			}
		})
	}
}
