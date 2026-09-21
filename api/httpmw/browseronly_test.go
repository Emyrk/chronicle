package httpmw_test

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/Emyrk/chronicle/api/httpmw"
)

func TestBrowserOnly(t *testing.T) {
	t.Parallel()

	prodURL, _ := url.Parse("https://chronicleclassic.com")
	devURL, _ := url.Parse("http://localhost:3000")

	ok := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	tests := []struct {
		name                  string
		accessURL             *url.URL
		path                  string
		secFetch              string
		origin                string
		allowedCrossSitePaths []string
		wantStatus            int
	}{
		{name: "prod same-origin allowed", accessURL: prodURL, path: "/api/v1/whoami", secFetch: "same-origin", wantStatus: http.StatusOK},
		{name: "prod same-site allowed", accessURL: prodURL, path: "/api/v1/whoami", secFetch: "same-site", wantStatus: http.StatusOK},
		{name: "prod none allowed", accessURL: prodURL, path: "/api/v1/whoami", secFetch: "none", wantStatus: http.StatusOK},
		{name: "prod cross-site wiki allowed", accessURL: prodURL, path: "/api/v1/whoami", secFetch: "cross-site", origin: "https://wiki.chronicleclassic.com", wantStatus: http.StatusOK},
		{name: "prod cross-site Discord allowed", accessURL: prodURL, path: "/api/v1/whoami", secFetch: "cross-site", origin: "https://discord.com", wantStatus: http.StatusOK},
		{name: "prod cross-site callback allowed", accessURL: prodURL, path: "/api/v1/discord-integration/callback", secFetch: "cross-site", allowedCrossSitePaths: []string{"/api/v1/discord-integration/callback"}, wantStatus: http.StatusOK},
		{name: "prod callback without browser header rejected", accessURL: prodURL, path: "/api/v1/discord-integration/callback", allowedCrossSitePaths: []string{"/api/v1/discord-integration/callback"}, wantStatus: http.StatusForbidden},
		{name: "prod cross-site similar callback rejected", accessURL: prodURL, path: "/api/v1/discord-integration/callback/other", secFetch: "cross-site", allowedCrossSitePaths: []string{"/api/v1/discord-integration/callback"}, wantStatus: http.StatusForbidden},
		{name: "prod cross-site rejected", accessURL: prodURL, path: "/api/v1/whoami", secFetch: "cross-site", wantStatus: http.StatusForbidden},
		{name: "prod missing header rejected", accessURL: prodURL, path: "/api/v1/whoami", wantStatus: http.StatusForbidden},
		{name: "dev missing header allowed", accessURL: devURL, path: "/api/v1/whoami", wantStatus: http.StatusOK},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			handler := httpmw.BrowserOnly(tc.accessURL, tc.allowedCrossSitePaths...)(ok)
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			if tc.secFetch != "" {
				req.Header.Set("Sec-Fetch-Site", tc.secFetch)
			}
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			assert.Equal(t, tc.wantStatus, rec.Code)
		})
	}
}
