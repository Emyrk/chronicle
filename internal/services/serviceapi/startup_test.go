package serviceapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestStartupPageHandler(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	startupPageHandler().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/anything", nil))

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	require.Equal(t, "text/html; charset=utf-8", recorder.Header().Get("Content-Type"))
	require.Equal(t, "no-store", recorder.Header().Get("Cache-Control"))
	require.Equal(t, "5", recorder.Header().Get("Retry-After"))
	require.Contains(t, recorder.Body.String(), "Consulting the archives")
	require.Contains(t, recorder.Body.String(), "src=\"/example-not-ready/logo.png\"")
	require.Contains(t, recorder.Body.String(), "id=\"countdown\">5")
	require.Contains(t, recorder.Body.String(), "window.fetch(\"/api/v1/healthz\"")
	require.Contains(t, recorder.Body.String(), "if (response.ok && !preview)")
	require.Contains(t, recorder.Body.String(), "Chronicle was recently re-deployed and is preparing the database")
	require.Contains(t, recorder.Body.String(), "This usually only takes a few moments")
	require.NotContains(t, recorder.Body.String(), "http-equiv=\"refresh\"")
}

func TestSwitchableHandler(t *testing.T) {
	t.Parallel()

	handler := newSwitchableHandler(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = strings.NewReader("starting").WriteTo(w)
	}))

	before := httptest.NewRecorder()
	handler.ServeHTTP(before, httptest.NewRequest(http.MethodGet, "/", nil))
	require.Equal(t, "starting", before.Body.String())

	handler.Set(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = strings.NewReader("ready").WriteTo(w)
	}))

	after := httptest.NewRecorder()
	handler.ServeHTTP(after, httptest.NewRequest(http.MethodGet, "/", nil))
	require.Equal(t, "ready", after.Body.String())

	preview := httptest.NewRecorder()
	handler.ServeHTTP(preview, httptest.NewRequest(http.MethodGet, startupPagePreviewPath, nil))
	require.Equal(t, http.StatusServiceUnavailable, preview.Code)
	require.Contains(t, preview.Body.String(), "Consulting the archives")
	require.Contains(t, preview.Body.String(), "Trying again in")

	logo := httptest.NewRecorder()
	handler.ServeHTTP(logo, httptest.NewRequest(http.MethodGet, startupLogoPath, nil))
	require.Equal(t, http.StatusOK, logo.Code)
	require.Equal(t, "image/png", logo.Header().Get("Content-Type"))
	require.Equal(t, startupLogo, logo.Body.Bytes())
}
