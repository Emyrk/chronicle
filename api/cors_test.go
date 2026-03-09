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
		name          string
		origin        string
		wantAllowed   bool
	}{
		{"production origin allowed", "https://chronicleclassic.com", true},
		{"random origin rejected", "https://evil.com", false},
		{"no origin", "", false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			handler := api.Cors(prodURL)(ok)
			req := httptest.NewRequest(http.MethodOptions, "/api/v1/whoami", nil)
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("Access-Control-Request-Method", "GET")
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
