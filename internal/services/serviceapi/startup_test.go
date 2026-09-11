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
	require.Contains(t, recorder.Body.String(), "Please wait")
	require.Contains(t, recorder.Body.String(), "updating its database")
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
}
