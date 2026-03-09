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
		name       string
		accessURL  *url.URL
		secFetch   string
		wantStatus int
	}{
		{"prod same-origin allowed", prodURL, "same-origin", http.StatusOK},
		{"prod same-site allowed", prodURL, "same-site", http.StatusOK},
		{"prod none allowed", prodURL, "none", http.StatusOK},
		{"prod cross-site rejected", prodURL, "cross-site", http.StatusForbidden},
		{"prod missing header rejected", prodURL, "", http.StatusForbidden},
		{"dev missing header allowed", devURL, "", http.StatusOK},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			handler := httpmw.BrowserOnly(tc.accessURL)(ok)
			req := httptest.NewRequest(http.MethodGet, "/api/v1/whoami", nil)
			if tc.secFetch != "" {
				req.Header.Set("Sec-Fetch-Site", tc.secFetch)
			}
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			assert.Equal(t, tc.wantStatus, rec.Code)
		})
	}
}
