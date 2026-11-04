package httpmw_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/api/httpmw"
)

func TestContentSecurityPolicy(t *testing.T) {
	t.Parallel()

	handler := httpmw.ContentSecurityPolicy(nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	csp := rec.Header().Get("Content-Security-Policy")
	require.NotEmpty(t, csp)

	assert.Contains(t, csp, "default-src 'self'")
	assert.Contains(t, csp, "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:")
	assert.Contains(t, csp, "img-src 'self' data: blob: https://www.googletagmanager.com")
	assert.Contains(t, csp, "connect-src 'self' blob: https://raw.githubusercontent.com https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://stats.g.doubleclick.net https://www.google.com")
	assert.NotContains(t, csp, "tweakcn.com")
	assert.NotContains(t, csp, "fonts.googleapis.com")
	assert.NotContains(t, csp, "fonts.gstatic.com")
	assert.Contains(t, csp, "style-src 'self' 'unsafe-inline'")
	assert.Contains(t, csp, "font-src 'self'")
	assert.Contains(t, csp, "frame-ancestors 'none'")
	assert.Contains(t, csp, "worker-src 'self' blob:")
}

func TestContentSecurityPolicyAllowsConfiguredSignalingOrigin(t *testing.T) {
	t.Parallel()
	handler := httpmw.ContentSecurityPolicy(nil, "wss://live.example.com")(
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	assert.Contains(t, rec.Header().Get("Content-Security-Policy"), "connect-src 'self' blob:")
	assert.Contains(t, rec.Header().Get("Content-Security-Policy"), " wss://live.example.com;")
}

func TestContentSecurityPolicyAllowsAdResourcesOnlyWhenEnabled(t *testing.T) {
	t.Parallel()

	handler := httpmw.ContentSecurityPolicy(func(r *http.Request) bool {
		return r.Host == "ads.example.com"
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for _, test := range []struct {
		name        string
		host        string
		allowsHTTPS bool
	}{
		{name: "ad tenant", host: "ads.example.com", allowsHTTPS: true},
		{name: "disabled tenant", host: "disabled.example.com", allowsHTTPS: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequest(http.MethodGet, "https://"+test.host+"/", nil)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			csp := rec.Header().Get("Content-Security-Policy")
			scriptPolicy := strings.Split(csp, "; ")[1]
			assert.Equal(t, test.allowsHTTPS, strings.Contains(csp, "default-src 'self' https:"))
			assert.Equal(t, test.allowsHTTPS, strings.HasSuffix(scriptPolicy, " https:"))
			assert.Equal(t, test.allowsHTTPS, strings.Contains(scriptPolicy, "'unsafe-eval'"))
			assert.Equal(t, test.allowsHTTPS, strings.Contains(csp, "style-src 'self' 'unsafe-inline' https:"))
			assert.Equal(t, test.allowsHTTPS, strings.Contains(csp, "font-src 'self' https:"))
			assert.Equal(t, test.allowsHTTPS, strings.Contains(csp, "media-src 'self' data: blob: https:"))
			assert.Contains(t, csp, "connect-src 'self' blob: ")
		})
	}
}
